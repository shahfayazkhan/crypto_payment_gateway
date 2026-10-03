import { Deposit, WalletAddress, User } from '../models/index.js';
import { ASSETS, NETWORKS } from '../config/chains.js';
import { fromRaw, round } from '../lib/money.js';
import { publish, QUEUES } from '../lib/rabbit.js';
import { emitToUser, emitToBackoffice } from '../lib/realtime.js';
import { withLock } from '../lib/redis.js';
import { mt5 } from './mt5/index.js';
import { getPrice } from './price.service.js';
import { emitWebhook } from './webhook.service.js';
import { createLogger } from '../lib/logger.js';

const log = createLogger('deposits');

const publicView = (d) => ({
  _id: d._id, user: d.user, mt5Login: d.mt5Login, network: d.network, asset: d.asset, address: d.address,
  fromAddress: d.fromAddress, txHash: d.txHash, blockNumber: d.blockNumber, amount: d.amount,
  confirmations: d.confirmations, requiredConfirmations: d.requiredConfirmations, status: d.status,
  amountUsd: d.amountUsd, priceUsd: d.priceUsd, mt5DealId: d.mt5DealId, creditedAt: d.creditedAt,
  sweptAt: d.sweptAt, createdAt: d.createdAt, updatedAt: d.updatedAt, error: d.error,
});
const broadcast = (event, d) => emitToUser(String(d.user), event, publicView(d));

/** Listener found a transfer into one of our deposit addresses. Insert-only (idempotent). */
export async function recordDetected(networkId, t, height) {
  const asset = ASSETS[t.asset];
  if (!asset?.depositable) return null;
  const wallet = await WalletAddress.findOne({ network: networkId, address: t.to, kind: 'deposit' }).lean();
  if (!wallet) return null;
  const user = await User.findById(wallet.user).lean();
  const amount = fromRaw(t.amountRaw, asset.decimals);
  const price = await getPrice(asset.priceKey);
  const status = amount < asset.minDeposit ? 'below_minimum' : 'confirming';
  const res = await Deposit.findOneAndUpdate(
    { network: networkId, txHash: t.txHash, outputIndex: t.outputIndex },
    {
      $setOnInsert: {
        user: wallet.user, mt5Login: user?.mt5Login, network: networkId, asset: t.asset, address: t.to,
        fromAddress: t.from, txHash: t.txHash, outputIndex: t.outputIndex, blockNumber: t.blockNumber,
        amount, amountRaw: t.amountRaw, priceUsd: price, amountUsd: round(amount * price),
        confirmations: Math.max(0, height - t.blockNumber + 1), requiredConfirmations: NETWORKS[networkId].confirmations,
        status, simulated: false,
      },
    },
    { upsert: true, returnDocument: 'after', includeResultMetadata: true },
  );
  const d = res.value;
  if (!res.lastErrorObject?.updatedExisting) {
    log.info('detected', { network: networkId, asset: t.asset, amount, tx: t.txHash.slice(0, 12), status });
    broadcast('deposit:new', d);
    emitWebhook('deposit.detected', publicView(d)).catch(() => {});
  }
  return d;
}

/** Recompute confirmations for every in-flight deposit on a network; promote to confirmed. */
export async function refreshConfirmations(networkId, height, adapter) {
  const pending = await Deposit.find({ network: networkId, status: 'confirming' });
  for (const d of pending) {
    const conf = Math.max(0, height - d.blockNumber + 1);
    if (conf >= d.requiredConfirmations) {
      // re-org guard: make sure the tx is still where we saw it
      const st = await adapter.getTxStatus(d.txHash);
      if (!st.found || (st.blockNumber && st.blockNumber !== d.blockNumber)) {
        d.status = 'orphaned';
        d.error = 'Transaction no longer in canonical chain';
        await d.save();
        broadcast('deposit:update', d);
        continue;
      }
      const updated = await Deposit.findOneAndUpdate(
        { _id: d._id, status: 'confirming' }, { status: 'confirmed', confirmations: conf }, { returnDocument: 'after' },
      );
      if (updated) {
        await publish(QUEUES.DEPOSIT_CONFIRMED, { depositId: String(d._id) });
        broadcast('deposit:update', updated);
      }
    } else if (conf !== d.confirmations) {
      d.confirmations = conf;
      await d.save();
      broadcast('deposit:update', d);
    }
  }
}

/** Worker: credit MT5 for a confirmed deposit, exactly once. */
export async function creditDeposit(depositId) {
  const { locked } = await withLock(`credit:${depositId}`, 30000, async () => {
    const d = await Deposit.findOneAndUpdate(
      { _id: depositId, status: { $in: ['confirmed', 'credit_failed'] } }, { status: 'crediting' }, { returnDocument: 'after' },
    );
    if (!d) return; // already credited or not ready
    try {
      const asset = ASSETS[d.asset];
      const price = await getPrice(asset.priceKey);
      const usd = round(d.amount * price);
      if (!d.mt5Login) throw new Error('Client has no MT5 login');
      const comment = `CRYPTO DEP ${asset.symbol} ${d.network} ${d.txHash.slice(0, 10)}`;
      const r = await mt5.deposit(d.mt5Login, usd, comment, `dep:${d._id}`);
      d.set({ status: 'credited', priceUsd: price, amountUsd: usd, mt5DealId: r.dealId, creditedAt: new Date(), error: undefined });
      await d.save();
      log.info('credited', { login: d.mt5Login, usd, deal: r.dealId });
      broadcast('deposit:update', d);
      emitToUser(String(d.user), 'mt5:balance', { login: d.mt5Login, balance: r.balance });
      emitWebhook('deposit.credited', publicView(d)).catch(() => {});
    } catch (e) {
      d.set({ status: 'credit_failed', error: e.message });
      await d.save();
      broadcast('deposit:update', d);
      emitWebhook('deposit.credit_failed', publicView(d)).catch(() => {});
      throw e; // → RabbitMQ retry
    }
  });
  if (!locked) throw new Error(`deposit ${depositId} is locked, retry later`);
}

export async function retryCredit(depositId) {
  const d = await Deposit.findOneAndUpdate({ _id: depositId, status: 'credit_failed' }, { status: 'confirmed' }, { returnDocument: 'after' });
  if (d) await publish(QUEUES.DEPOSIT_CONFIRMED, { depositId: String(d._id) });
  return d;
}

export { publicView as depositView };
