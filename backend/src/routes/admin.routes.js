import { Router } from 'express';
import { z } from 'zod';
import { Deposit, Withdrawal, Sweep, User, WalletAddress, AuditLog, WebhookDelivery } from '../models/index.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { paginate } from '../lib/paginate.js';
import { publish, QUEUES } from '../lib/rabbit.js';
import * as wd from '../services/withdrawal.service.js';
import { retryCredit } from '../services/deposit.service.js';
import { treasuryOverview } from '../services/sweep.service.js';
import { mt5 } from '../services/mt5/index.js';
import { audit } from '../services/audit.service.js';
import { config } from '../config/index.js';
import { NETWORKS, ASSETS } from '../config/chains.js';
import { notFound } from '../lib/errors.js';
import { round } from '../lib/money.js';

const r = Router();
r.use(requireAuth, requireRole('finance', 'admin'));
const USER_FIELDS = 'name email mt5Login';

const listFilter = (q, searchFields = ['txHash']) => {
  const f = {};
  for (const k of ['status', 'asset', 'network']) if (q[k]) f[k] = q[k];
  if (q.mt5Login) f.mt5Login = Number(q.mt5Login);
  if (q.q) f.$or = searchFields.map((field) => ({ [field]: q.q }));
  return f;
};

// ── Dashboard ──────────────────────────────────────────────────────────────
r.get('/stats', async (_req, res) => {
  const since24 = new Date(Date.now() - 864e5);
  const since14 = new Date(Date.now() - 14 * 864e5);
  const [dep24, wd24, pendingReview, confirming, creditFailed, awaitingLiq, activeSweeps, clients, daily, byAsset] = await Promise.all([
    Deposit.aggregate([{ $match: { createdAt: { $gte: since24 }, status: 'credited' } }, { $group: { _id: null, usd: { $sum: '$amountUsd' }, n: { $sum: 1 } } }]),
    Withdrawal.aggregate([{ $match: { createdAt: { $gte: since24 }, status: { $nin: ['rejected', 'cancelled', 'failed'] } } }, { $group: { _id: null, usd: { $sum: '$amountUsd' }, n: { $sum: 1 } } }]),
    Withdrawal.countDocuments({ status: 'pending_review' }),
    Deposit.countDocuments({ status: 'confirming' }),
    Deposit.countDocuments({ status: 'credit_failed' }),
    Withdrawal.countDocuments({ status: 'awaiting_liquidity' }),
    Sweep.countDocuments({ status: { $in: ['pending', 'gas_topup', 'sweeping'] } }),
    User.countDocuments({ role: 'client' }),
    Deposit.aggregate([
      { $match: { createdAt: { $gte: since14 }, status: 'credited' } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, deposits: { $sum: '$amountUsd' } } },
    ]),
    Deposit.aggregate([
      { $match: { status: 'credited' } },
      { $group: { _id: '$asset', usd: { $sum: '$amountUsd' }, n: { $sum: 1 } } },
    ]),
  ]);
  const wdDaily = await Withdrawal.aggregate([
    { $match: { createdAt: { $gte: since14 }, status: { $nin: ['rejected', 'cancelled', 'failed'] } } },
    { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, withdrawals: { $sum: '$amountUsd' } } },
  ]);
  const days = [...Array(14)].map((_, i) => new Date(Date.now() - (13 - i) * 864e5).toISOString().slice(0, 10));
  res.json({
    deposits24h: { usd: round(dep24[0]?.usd || 0), count: dep24[0]?.n || 0 },
    withdrawals24h: { usd: round(wd24[0]?.usd || 0), count: wd24[0]?.n || 0 },
    pendingReview, confirming, creditFailed, awaitingLiquidity: awaitingLiq, activeSweeps, clients,
    daily: days.map((d) => ({
      date: d,
      deposits: round(daily.find((x) => x._id === d)?.deposits || 0),
      withdrawals: round(wdDaily.find((x) => x._id === d)?.withdrawals || 0),
    })),
    byAsset: byAsset.map((b) => ({ asset: b._id, label: ASSETS[b._id]?.label, usd: round(b.usd), count: b.n })),
  });
});

// ── Deposits ───────────────────────────────────────────────────────────────
r.get('/deposits', async (req, res) => res.json(await paginate(Deposit, listFilter(req.query, ['txHash', 'address', 'fromAddress']), req, { populate: { path: 'user', select: USER_FIELDS } })));
r.get('/deposits/:id', async (req, res) => {
  const d = await Deposit.findById(req.params.id).populate('user', USER_FIELDS).populate('sweep');
  if (!d) throw notFound();
  res.json(d);
});
r.post('/deposits/:id/retry-credit', async (req, res) => {
  const d = await retryCredit(req.params.id);
  if (!d) throw notFound('Deposit is not in credit_failed state');
  audit(req.user, 'deposit.retry_credit', 'Deposit', d._id);
  res.json(d);
});

// ── Withdrawals ────────────────────────────────────────────────────────────
r.get('/withdrawals', async (req, res) => res.json(await paginate(Withdrawal, listFilter(req.query, ['txHash', 'toAddress']), req, { populate: { path: 'user', select: USER_FIELDS } })));
const note = z.object({ note: z.string().max(500).optional() });
r.post('/withdrawals/:id/approve', async (req, res) => res.json(await wd.approve(req.params.id, req.user, note.parse(req.body || {}).note)));
r.post('/withdrawals/:id/reject', async (req, res) => res.json(await wd.reject(req.params.id, req.user, note.parse(req.body || {}).note)));
r.post('/withdrawals/:id/retry', async (req, res) => res.json(await wd.retry(req.params.id, req.user)));

// ── Treasury / sweeps ──────────────────────────────────────────────────────
r.get('/treasury', async (_req, res) => res.json(await treasuryOverview()));
r.get('/sweeps', async (req, res) => res.json(await paginate(Sweep, listFilter(req.query, ['txHash', 'toAddress']), req)));
r.post('/sweeps/run', async (req, res) => {
  const { force } = z.object({ force: z.boolean().optional() }).parse(req.body || {});
  await publish(QUEUES.SWEEP_RUN, { force: !!force, by: req.user.email });
  audit(req.user, 'sweep.run', 'Sweep', null, { force });
  res.status(202).json({ queued: true });
});
r.get('/addresses', async (req, res) => {
  const f = {};
  if (req.query.kind) f.kind = req.query.kind;
  if (req.query.network) f.network = req.query.network;
  res.json(await paginate(WalletAddress, f, req, { populate: { path: 'user', select: USER_FIELDS } }));
});

// ── Clients ────────────────────────────────────────────────────────────────
r.get('/clients', async (req, res) => {
  const page = await paginate(User, { role: 'client' }, req);
  page.items = await Promise.all(page.items.map(async (u) => {
    const [account, dep, w] = await Promise.all([
      u.mt5Login ? mt5.getAccount(u.mt5Login).catch(() => null) : null,
      Deposit.aggregate([{ $match: { user: u._id, status: 'credited' } }, { $group: { _id: null, usd: { $sum: '$amountUsd' } } }]),
      Withdrawal.aggregate([{ $match: { user: u._id, status: 'completed' } }, { $group: { _id: null, usd: { $sum: '$amountUsd' } } }]),
    ]);
    return { ...u, account, totalDepositedUsd: round(dep[0]?.usd || 0), totalWithdrawnUsd: round(w[0]?.usd || 0) };
  }));
  res.json(page);
});

// ── Ops ────────────────────────────────────────────────────────────────────
r.get('/audit', async (req, res) => res.json(await paginate(AuditLog, {}, req)));
r.get('/webhooks', async (req, res) => res.json(await paginate(WebhookDelivery, req.query.status ? { status: req.query.status } : {}, req)));
r.get('/config', requireRole('admin'), (_req, res) => res.json({
  chainMode: config.chainMode, mt5Mode: config.mt5Mode, priceMode: config.priceMode,
  treasury: config.treasury, coldWallets: config.coldWallets, webhooks: config.webhooks.urls,
  networks: NETWORKS, assets: ASSETS,
}));

export default r;
