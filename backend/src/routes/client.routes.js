import { Router } from 'express';
import { z } from 'zod';
import { Deposit, Withdrawal, User } from '../models/index.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { ensureClientWallets } from '../services/wallet.service.js';
import { mt5 } from '../services/mt5/index.js';
import * as wd from '../services/withdrawal.service.js';
import { paginate } from '../lib/paginate.js';
import { getPrices } from '../services/price.service.js';
import { DEPOSIT_ASSETS } from '../config/chains.js';

const r = Router();
r.use(requireAuth, requireRole('client'));

r.get('/account', async (req, res) => {
  const user = await User.findById(req.user.sub);
  const account = user.mt5Login ? await mt5.getAccount(user.mt5Login) : null;
  res.json({ user, account });
});

/** Deposit addresses (created on first call). */
r.get('/wallets', async (req, res) => {
  const wallets = await ensureClientWallets(req.user.sub);
  const byNetwork = Object.fromEntries(wallets.map((w) => [w.network, w.address]));
  res.json(DEPOSIT_ASSETS.map((a) => ({
    asset: a.code, label: a.label, network: a.network, address: byNetwork[a.network], minDeposit: a.minDeposit,
  })));
});

r.get('/deposits', async (req, res) => {
  const filter = { user: req.user.sub };
  if (req.query.status) filter.status = req.query.status;
  if (req.query.asset) filter.asset = req.query.asset;
  res.json(await paginate(Deposit, filter, req));
});

r.get('/withdrawals', async (req, res) => {
  const filter = { user: req.user.sub };
  if (req.query.status) filter.status = req.query.status;
  res.json(await paginate(Withdrawal, filter, req));
});

r.get('/withdrawals/quote', async (req, res) => {
  const { asset, amount } = z.object({ asset: z.string(), amount: z.coerce.number().positive() }).parse(req.query);
  res.json(await wd.quote(asset, amount));
});

r.post('/withdrawals', async (req, res) => {
  const body = z.object({ asset: z.string(), toAddress: z.string().min(20).max(100), amount: z.number().positive() }).parse(req.body);
  res.status(201).json(await wd.requestWithdrawal(req.user.sub, body));
});

r.post('/withdrawals/:id/cancel', async (req, res) => {
  res.json(await wd.cancel(req.params.id, req.user.sub));
});

r.get('/prices', async (_req, res) => res.json(await getPrices()));

export default r;
