import { Withdrawal, User } from '../models/index.js';
import { config } from '../config/index.js';
import { ASSETS, NETWORKS, nativeAssetOf } from '../config/chains.js';
import { badRequest, notFound, conflict, HttpError } from '../lib/errors.js';
import { round, toRaw } from '../lib/money.js';
import { publish, QUEUES } from '../lib/rabbit.js';
import { withLock } from '../lib/redis.js';
import { emitToUser } from '../lib/realtime.js';
import { isValidAddress, normalizeAddress } from './addressCodec.js';
import { getPrice } from './price.service.js';
import { mt5 } from './mt5/index.js';
import { emitWebhook } from './webhook.service.js';
import { getTreasuryAddresses } from './wallet.service.js';
import { adapterFor } from '../chains/index.js';
import { audit } from './audit.service.js';
import { createLogger } from '../lib/logger.js';

const log = createLogger('withdrawals');
const OPEN = ['pending_review', 'approved', 'processing', 'awaiting_liquidity', 'broadcast', 'completed'];
const broadcast = (event, w) => emitToUser(String(w.user), event, w.toObject ? w.toObject() : w);

export async function quote(assetCode, amount) {
  const asset = ASSETS[assetCode];
  if (!asset?.depositable) throw badRequest('Unsupported asset');
  const price = await getPrice(asset.priceKey);
  const net = round(amount - asset.withdrawalFee, asset.decimals > 8 ? 8 : asset.decimals);
  return {
    asset: assetCode, network: asset.network, amount, fee: asset.withdrawalFee, netAmount: net,
    priceUsd: price, amountUsd: round(amount * price), minWithdrawal: asset.minWithdrawal,
  };
}

async function usedTodayUsd(userId) {
  const since = new Date(Date.now() - 24 * 3600 * 1000);
  const [r] = await Withdrawal.aggregate([
    { $match: { user: userId, createdAt: { $gte: since }, status: { $in: OPEN } } },
    { $group: { _id: null, usd: { $sum: '$amountUsd' } } },
  ]);
  return r?.usd || 0;
}

/** Client request: validate → debit MT5 (hold) → pending_review (or auto-approve). */
export async function requestWithdrawal(userId, { asset: assetCode, toAddress, amount }) {
  const user = await User.findById(userId);
  if (!user?.mt5Login) throw badRequest('No MT5 account linked');
  const asset = ASSETS[assetCode];
  if (!asset?.depositable) throw badRequest('Unsupported asset');
  if (!isValidAddress(asset.network, toAddress)) throw badRequest(`Invalid ${NETWORKS[asset.network].name} address`);
  if (amount < asset.minWithdrawal) throw badRequest(`Minimum withdrawal is ${asset.minWithdrawal} ${asset.symbol}`);

  const q = await quote(assetCode, amount);
  if (q.netAmount <= 0) throw badRequest('Amount does not cover the network fee');
  const limit = user.withdrawalDailyLimitUsd ?? config.treasury.withdrawalDailyLimitUsd;
  const used = await usedTodayUsd(user._id);
  if (used + q.amountUsd > limit) throw badRequest(`Daily withdrawal limit exceeded (${round(limit - used)} USD left)`);

  const w = new Withdrawal({
    user: user._id, mt5Login: user.mt5Login, network: asset.network, asset: assetCode,
    toAddress: normalizeAddress(asset.network, toAddress), amount, fee: q.fee, netAmount: q.netAmount,
    priceUsd: q.priceUsd, amountUsd: q.amountUsd, requiredConfirmations: NETWORKS[asset.network].confirmations,
  });
  // Debit first so the client can't trade the funds away while we review
  const debit = await mt5.withdraw(user.mt5Login, q.amountUsd, `CRYPTO WD ${asset.symbol} ${String(w._id).slice(-8)}`, `wd:${w._id}`);
  w.mt5DebitDealId = debit.dealId;
  await w.save();
  log.info('requested', { login: user.mt5Login, asset: assetCode, amount, usd: q.amountUsd });
  broadcast('withdrawal:new', w);
  emitToUser(String(user._id), 'mt5:balance', { login: user.mt5Login, balance: debit.balance });
  emitWebhook('withdrawal.requested', w.toObject()).catch(() => {});

  if (config.treasury.withdrawalAutoApproveUsd > 0 && q.amountUsd <= config.treasury.withdrawalAutoApproveUsd) {
    return approve(w._id, null, 'auto-approved under threshold');
  }
  return w;
}

export async function approve(id, reviewer, note) {
  const w = await Withdrawal.findOneAndUpdate(
    { _id: id, status: 'pending_review' },
    { status: 'approved', reviewedBy: reviewer?.sub, reviewedAt: new Date(), reviewNote: note },
    { returnDocument: 'after' },
  );
  if (!w) throw conflict('Withdrawal is not pending review');
  await publish(QUEUES.WITHDRAWAL_APPROVED, { withdrawalId: String(w._id) });
  audit(reviewer, 'withdrawal.approve', 'Withdrawal', w._id, { note });
  broadcast('withdrawal:update', w);
  emitWebhook('withdrawal.approved', w.toObject()).catch(() => {});
  return w;
}

async function refund(w, reason) {
  const r = await mt5.deposit(w.mt5Login, w.amountUsd, `CRYPTO WD REFUND ${String(w._id).slice(-8)}`, `wd-refund:${w._id}`);
  w.mt5RefundDealId = r.dealId;
  emitToUser(String(w.user), 'mt5:balance', { login: w.mt5Login, balance: r.balance });
  log.info('refunded', { id: String(w._id), reason });
}

/** Refund first (idempotent MT5 key), then flip status — so a failed refund never leaves a "rejected" without money back. */
async function closeWithRefund(filter, status, extra, reason) {
  const w0 = await Withdrawal.findOne(filter);
  if (!w0) return null;
  const { locked, result } = await withLock(`wd:${w0._id}`, 30000, async () => {
    const w = await Withdrawal.findOne({ ...filter, _id: w0._id });
    if (!w) return null;
    await refund(w, reason);
    w.set({ status, ...extra });
    await w.save();
    return w;
  });
  if (!locked) throw conflict('Withdrawal is being processed, try again');
  return result;
}

export async function reject(id, reviewer, note) {
  const w = await closeWithRefund(
    { _id: id, status: { $in: ['pending_review', 'awaiting_liquidity', 'failed'] } }, 'rejected',
    { reviewedBy: reviewer?.sub, reviewedAt: new Date(), reviewNote: note }, 'rejected',
  );
  if (!w) throw conflict('Withdrawal cannot be rejected in its current state');
  audit(reviewer, 'withdrawal.reject', 'Withdrawal', w._id, { note });
  broadcast('withdrawal:update', w);
  emitWebhook('withdrawal.rejected', w.toObject()).catch(() => {});
  return w;
}

export async function cancel(id, userId) {
  const w = await closeWithRefund({ _id: id, user: userId, status: 'pending_review' }, 'cancelled', {}, 'cancelled');
  if (!w) throw conflict('Only pending withdrawals can be cancelled');
  broadcast('withdrawal:update', w);
  return w;
}

export async function retry(id, actor) {
  const w = await Withdrawal.findOneAndUpdate({ _id: id, status: { $in: ['failed', 'awaiting_liquidity'] } }, { status: 'approved', error: undefined }, { returnDocument: 'after' });
  if (!w) throw conflict('Only failed / awaiting-liquidity withdrawals can be retried');
  await publish(QUEUES.WITHDRAWAL_APPROVED, { withdrawalId: String(w._id) });
  audit(actor, 'withdrawal.retry', 'Withdrawal', w._id);
  broadcast('withdrawal:update', w);
  return w;
}

/** Worker: sign + broadcast from the hot wallet. */
export async function processWithdrawal(withdrawalId) {
  await withLock(`wd:${withdrawalId}`, 60000, async () => {
    const w = await Withdrawal.findOneAndUpdate({ _id: withdrawalId, status: 'approved' }, { status: 'processing' }, { returnDocument: 'after' });
    if (!w) return;
    broadcast('withdrawal:update', w);
    const asset = ASSETS[w.asset];
    const adapter = adapterFor(w.network);
    const { hot } = await getTreasuryAddresses(w.network);
    const amountRaw = BigInt(toRaw(w.netAmount, asset.decimals));
    try {
      const bal = await adapter.getBalance(hot.address, w.asset);
      const native = nativeAssetOf(w.network);
      const gasOk = asset.type === 'native' || (await adapter.getBalance(hot.address, native.code)) > 0n;
      if (bal < amountRaw || !gasOk) {
        w.set({ status: 'awaiting_liquidity', error: `Hot wallet short on ${gasOk ? asset.symbol : native.symbol}` });
        await w.save();
        broadcast('withdrawal:update', w);
        return;
      }
      const { txHash, blockNumber } = await adapter.send({ from: hot.address, fromPath: hot.derivationPath, to: w.toAddress, assetCode: w.asset, amountRaw });
      w.set({ status: 'broadcast', txHash, blockNumber, fromAddress: hot.address, error: undefined });
      await w.save();
      log.info('broadcast', { id: String(w._id), txHash });
      broadcast('withdrawal:update', w);
    } catch (e) {
      if (e.code === 'INSUFFICIENT_FUNDS') {
        w.set({ status: 'awaiting_liquidity', error: e.message });
      } else {
        w.set({ status: 'failed', error: e.message });
        emitWebhook('withdrawal.failed', w.toObject()).catch(() => {});
      }
      await w.save();
      broadcast('withdrawal:update', w);
    }
  });
}

/** Listener: track confirmations of broadcast withdrawals. */
export async function refreshWithdrawalConfirmations(networkId, adapter) {
  const list = await Withdrawal.find({ network: networkId, status: 'broadcast' });
  for (const w of list) {
    const st = await adapter.getTxStatus(w.txHash);
    if (!st.found) continue;
    if (st.success === false) {
      w.set({ status: 'failed', error: 'Transaction reverted on-chain' });
    } else if (st.confirmations >= w.requiredConfirmations) {
      w.set({ status: 'completed', confirmations: st.confirmations, blockNumber: st.blockNumber, completedAt: new Date() });
      emitWebhook('withdrawal.completed', w.toObject()).catch(() => {});
    } else if (st.confirmations !== w.confirmations) {
      w.confirmations = st.confirmations;
    } else continue;
    await w.save();
    broadcast('withdrawal:update', w);
  }
}

/** Re-queue withdrawals parked for liquidity (called after sweeps / top-ups). */
export async function requeueAwaitingLiquidity() {
  const list = await Withdrawal.find({ status: 'awaiting_liquidity' }).select('_id').lean();
  for (const w of list) {
    const u = await Withdrawal.findOneAndUpdate({ _id: w._id, status: 'awaiting_liquidity' }, { status: 'approved' });
    if (u) await publish(QUEUES.WITHDRAWAL_APPROVED, { withdrawalId: String(w._id) });
  }
}

export async function getWithdrawalOr404(id) {
  const w = await Withdrawal.findById(id);
  if (!w) throw notFound('Withdrawal not found');
  return w;
}
export { HttpError };
