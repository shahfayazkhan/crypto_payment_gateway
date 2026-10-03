/**
 * Sweeper: moves credited deposits from per-client addresses to the treasury.
 *  1. Pick (address, asset) groups with unswept credited deposits ≥ sweepThreshold
 *  2. Destination: hot wallet if it's below its per-asset target, otherwise cold
 *  3. Token on account chains (TRC20/ERC20/BEP20): top up gas from hot wallet first
 *  4. UTXO (BTC): consolidate all qualifying addresses in one multi-input tx
 * Each sweep is a small state machine advanced by the worker tick.
 */
import { Deposit, Sweep, WalletAddress } from '../models/index.js';
import { config } from '../config/index.js';
import { ASSETS, NETWORKS, NETWORK_IDS, DEPOSIT_ASSETS, nativeAssetOf } from '../config/chains.js';
import { adapterFor } from '../chains/index.js';
import { fromRaw, toRaw, round } from '../lib/money.js';
import { withLock } from '../lib/redis.js';
import { emitToBackoffice } from '../lib/realtime.js';
import { getPrice } from './price.service.js';
import { getTreasuryAddresses } from './wallet.service.js';
import { emitWebhook } from './webhook.service.js';
import { requeueAwaitingLiquidity } from './withdrawal.service.js';
import { createLogger } from '../lib/logger.js';

const log = createLogger('sweeper');
const emit = (s) => emitToBackoffice('sweep:update', s.toObject ? s.toObject() : s);
const perAssetHotTarget = () => config.treasury.hotWalletTargetUsd / DEPOSIT_ASSETS.length;
const INTERNAL_CONF = 1; // confirmations needed for our own gas top-ups

async function chooseDestination(networkId, assetCode) {
  const adapter = adapterFor(networkId);
  const { hot, cold } = await getTreasuryAddresses(networkId);
  const asset = ASSETS[assetCode];
  const hotBal = fromRaw(await adapter.getBalance(hot.address, assetCode), asset.decimals);
  const usd = hotBal * (await getPrice(asset.priceKey));
  return usd < perAssetHotTarget() || !cold ? { type: 'hot', address: hot.address } : { type: 'cold', address: cold.address };
}

/** Create new sweeps. `force` ignores thresholds (manual "sweep now"). */
export async function planSweeps({ trigger = 'schedule', force = false } = {}) {
  const created = [];
  for (const asset of DEPOSIT_ASSETS) {
    const groups = await Deposit.aggregate([
      { $match: { asset: asset.code, status: 'credited', sweep: null } },
      { $group: { _id: '$address', ids: { $push: '$_id' }, total: { $sum: '$amount' } } },
    ]);
    const eligible = groups.filter((g) => force || g.total >= asset.sweepThreshold);
    if (!eligible.length) continue;
    const dest = await chooseDestination(asset.network, asset.code);
    const price = await getPrice(asset.priceKey);
    const batches = NETWORKS[asset.network].model === 'utxo' ? [eligible] : eligible.map((g) => [g]);
    for (const batch of batches) {
      const total = batch.reduce((a, g) => a + g.total, 0);
      const s = await Sweep.create({
        network: asset.network, asset: asset.code, fromAddresses: batch.map((g) => g._id), toAddress: dest.address,
        destination: dest.type, amount: round(total, 8), amountUsd: round(total * price), trigger,
        deposits: batch.flatMap((g) => g.ids),
      });
      // reserve deposits so they're never picked twice
      await Deposit.updateMany({ _id: { $in: s.deposits }, sweep: null }, { sweep: s._id });
      created.push(s);
      emit(s);
    }
  }
  if (created.length) log.info(`planned ${created.length} sweep(s)`, { trigger });
  return created;
}

async function fail(s, err) {
  s.set({ status: 'failed', error: err.message || String(err) });
  await s.save();
  await Deposit.updateMany({ sweep: s._id, sweptAt: null }, { $unset: { sweep: 1 } }); // release for next run
  log.warn('sweep failed', { id: String(s._id), err: s.error });
  emit(s);
}

async function addressPath(network, address) {
  return (await WalletAddress.findOne({ network, address }).lean())?.derivationPath;
}

/** Advance one sweep through its state machine. */
async function advance(s) {
  const adapter = adapterFor(s.network);
  const asset = ASSETS[s.asset];
  const native = nativeAssetOf(s.network);
  const net = NETWORKS[s.network];

  if (s.status === 'pending') {
    if (net.model === 'utxo') {
      // multi-input consolidation; fee comes out of the first input
      const fee = BigInt(toRaw(net.nativeTransferFee, asset.decimals));
      const inputs = [];
      for (const addr of s.fromAddresses) {
        const bal = await adapter.getBalance(addr, s.asset);
        if (bal > 0n) inputs.push({ address: addr, amountRaw: bal, fromPath: await addressPath(s.network, addr) });
      }
      if (!inputs.length) return fail(s, new Error('Nothing to sweep'));
      inputs[0].amountRaw -= fee;
      const { txHash, blockNumber } = await adapter.send({ from: inputs, to: s.toAddress, assetCode: s.asset });
      const total = inputs.reduce((a, i) => a + i.amountRaw, 0n);
      s.set({ status: 'sweeping', txHash, blockNumber, amount: fromRaw(total, asset.decimals) });
      return s.save().then(emit);
    }
    const from = s.fromAddresses[0];
    if (asset.type === 'token') {
      const gasNeeded = BigInt(toRaw(net.gasPerTokenTransfer, native.decimals));
      const gasBal = await adapter.getBalance(from, native.code);
      if (gasBal < gasNeeded) {
        const { hot } = await getTreasuryAddresses(s.network);
        const topup = gasNeeded - gasBal;
        const { txHash } = await adapter.send({ from: hot.address, fromPath: hot.derivationPath, to: from, assetCode: native.code, amountRaw: topup });
        s.set({ status: 'gas_topup', gasTopupTxHash: txHash, gasTopupAmount: fromRaw(topup, native.decimals) });
        return s.save().then(emit);
      }
    }
    s.status = 'gas_topup'; // no top-up needed → fall through to sweep
  }

  if (s.status === 'gas_topup') {
    if (s.gasTopupTxHash) {
      const st = await adapter.getTxStatus(s.gasTopupTxHash);
      if (!st.found || st.confirmations < INTERNAL_CONF) return; // wait
    }
    const from = s.fromAddresses[0];
    let amountRaw = await adapter.getBalance(from, s.asset);
    if (asset.type === 'native') amountRaw -= BigInt(toRaw(net.nativeTransferFee, asset.decimals));
    if (amountRaw <= 0n) return fail(s, new Error('Balance too low to sweep'));
    const { txHash, blockNumber } = await adapter.send({ from, fromPath: await addressPath(s.network, from), to: s.toAddress, assetCode: s.asset, amountRaw });
    s.set({ status: 'sweeping', txHash, blockNumber, amount: fromRaw(amountRaw, asset.decimals) });
    return s.save().then(emit);
  }

  if (s.status === 'sweeping') {
    const st = await adapter.getTxStatus(s.txHash);
    if (!st.found) return;
    if (st.success === false) return fail(s, new Error('Sweep tx reverted'));
    if (st.confirmations !== s.confirmations) s.confirmations = st.confirmations;
    if (st.confirmations >= net.confirmations) {
      s.set({ status: 'completed', completedAt: new Date(), amountUsd: round(s.amount * (await getPrice(asset.priceKey))) });
      await Deposit.updateMany({ sweep: s._id }, { sweptAt: new Date() });
      await WalletAddress.updateMany({ network: s.network, address: { $in: s.fromAddresses } }, { lastSweptAt: new Date() });
      log.info('sweep completed', { network: s.network, asset: s.asset, amount: s.amount, to: s.destination });
      emitWebhook('sweep.completed', s.toObject()).catch(() => {});
      if (s.destination === 'hot') requeueAwaitingLiquidity().catch(() => {});
    }
    await s.save();
    emit(s);
  }
}

/** Worker tick: advance all in-flight sweeps. */
export async function advanceSweeps() {
  await withLock('sweeper:advance', 20000, async () => {
    const active = await Sweep.find({ status: { $in: ['pending', 'gas_topup', 'sweeping'] } });
    for (const s of active) {
      try { await advance(s); } catch (e) { await fail(s, e); }
    }
  });
}

export async function runSweepCycle(opts) {
  const { result } = await withLock('sweeper:plan', 30000, () => planSweeps(opts));
  await advanceSweeps();
  return result || [];
}

/** Treasury overview: hot / cold / unswept client balances per asset. */
export async function treasuryOverview() {
  const prices = {};
  const rows = [];
  for (const networkId of NETWORK_IDS) {
    const adapter = adapterFor(networkId);
    const { hot, cold } = await getTreasuryAddresses(networkId);
    const assets = Object.values(ASSETS).filter((a) => a.network === networkId);
    for (const a of assets) {
      prices[a.priceKey] ??= await getPrice(a.priceKey);
      const hotBal = hot ? fromRaw(await adapter.getBalance(hot.address, a.code), a.decimals) : 0;
      const coldBal = cold ? fromRaw(await adapter.getBalance(cold.address, a.code), a.decimals) : 0;
      const [unswept] = await Deposit.aggregate([
        { $match: { asset: a.code, status: 'credited', sweptAt: null } },
        { $group: { _id: null, amt: { $sum: '$amount' } } },
      ]);
      const p = prices[a.priceKey];
      rows.push({
        network: networkId, asset: a.code, label: a.label, gasOnly: !a.depositable, price: p,
        hot: hotBal, cold: coldBal, unswept: unswept?.amt || 0,
        hotUsd: round(hotBal * p), coldUsd: round(coldBal * p), unsweptUsd: round((unswept?.amt || 0) * p),
        hotAddress: hot?.address, coldAddress: cold?.address,
        hotTargetUsd: a.depositable ? perAssetHotTarget() : null,
      });
    }
  }
  return rows;
}
