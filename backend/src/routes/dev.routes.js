/**
 * Mock / realtime testing endpoints. Disabled when CHAIN_MODE != mock (except the webhook sink).
 */
import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { redis } from '../lib/redis.js';
import { emitToBackoffice } from '../lib/realtime.js';
import { simulateDeposit, fundHotWallets, chainState, assertMock } from '../services/simulator.service.js';
import { mine } from '../chains/mock/mockChain.js';
import { getTrafficState, setTrafficState } from '../workers/mockTraffic.js';
import { NETWORK_IDS } from '../config/chains.js';
import { User, Deposit } from '../models/index.js';

const r = Router();
const SINK = 'dev:webhook-sink';

// Built-in receiver so you can watch outbound CRM/RMS webhooks without another service
r.post('/webhook-sink', async (req, res) => {
  const entry = { receivedAt: new Date().toISOString(), event: req.headers['x-gateway-event'], signature: req.headers['x-gateway-signature'], body: req.body };
  await redis().lpush(SINK, JSON.stringify(entry));
  await redis().ltrim(SINK, 0, 199);
  emitToBackoffice('webhook:received', entry);
  res.json({ ok: true });
});

r.use(requireAuth, requireRole('admin', 'finance'));

r.get('/webhook-sink', async (_req, res) => res.json((await redis().lrange(SINK, 0, 49)).map((s) => JSON.parse(s))));

r.use((_req, _res, next) => { assertMock(); next(); });

r.post('/simulate/deposit', async (req, res) => {
  const body = z.object({
    asset: z.string(), amount: z.number().positive(),
    userId: z.string().optional(), mt5Login: z.number().optional(), address: z.string().optional(),
  }).refine((b) => b.userId || b.mt5Login || b.address, 'Provide userId, mt5Login or address').parse(req.body);
  res.status(201).json(await simulateDeposit(body));
});

/** Fire N random deposits across random clients/assets. */
r.post('/simulate/burst', async (req, res) => {
  const { count } = z.object({ count: z.number().int().min(1).max(50).default(5) }).parse(req.body || {});
  const clients = await User.find({ role: 'client' }).select('_id').lean();
  const assets = { USDT_TRC20: [20, 2000], USDT_ERC20: [50, 4000], USDT_BEP20: [20, 2500], BTC: [0.001, 0.05], SOL: [0.5, 30] };
  const out = [];
  for (let i = 0; i < count; i++) {
    const [code, [a, b]] = Object.entries(assets)[Math.floor(Math.random() * 5)];
    const u = clients[Math.floor(Math.random() * clients.length)];
    out.push(await simulateDeposit({ userId: String(u._id), asset: code, amount: Number((a + Math.random() * (b - a)).toPrecision(4)) }));
  }
  res.status(201).json(out);
});

r.post('/chain/:network/mine', async (req, res) => {
  const { blocks } = z.object({ blocks: z.number().int().min(1).max(500).default(1) }).parse(req.body || {});
  const network = z.enum(NETWORK_IDS).parse(req.params.network);
  res.json({ network, height: await mine(network, blocks) });
});

r.get('/chain', async (_req, res) => res.json(await chainState()));

r.post('/fund-hot-wallets', async (req, res) => res.status(201).json(await fundHotWallets(req.body || {})));

r.get('/traffic', async (_req, res) => res.json(await getTrafficState()));
r.post('/traffic', async (req, res) => {
  const body = z.object({ enabled: z.boolean().optional(), intervalMs: z.number().int().min(1000).max(600000).optional() }).parse(req.body || {});
  const st = await setTrafficState(body);
  emitToBackoffice('traffic:state', st);
  res.json(st);
});

/** Force a confirming deposit's network to mine enough blocks to confirm it now. */
r.post('/deposits/:id/fast-confirm', async (req, res) => {
  const d = await Deposit.findById(req.params.id);
  if (!d) return res.status(404).json({ error: 'Not found' });
  const need = Math.max(0, d.requiredConfirmations - d.confirmations);
  res.json({ network: d.network, mined: need, height: need ? await mine(d.network, need) : null });
});

export default r;
