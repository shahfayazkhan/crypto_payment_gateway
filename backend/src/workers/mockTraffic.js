/**
 * Synthetic traffic generator for realtime testing: random client deposits
 * (and the occasional withdrawal request). Toggle at runtime via
 * POST /api/dev/traffic { enabled, intervalMs } — state lives in Redis.
 */
import { config } from '../config/index.js';
import { redis } from '../lib/redis.js';
import { User } from '../models/index.js';
import { DEPOSIT_ASSETS } from '../config/chains.js';
import { simulateDeposit } from '../services/simulator.service.js';
import { requestWithdrawal } from '../services/withdrawal.service.js';
import { randomExternalAddress } from '../chains/mock/mockChain.js';
import { createLogger } from '../lib/logger.js';

const log = createLogger('mock-traffic');
export const TRAFFIC_KEY = 'mock:traffic';

const AMOUNTS = { USDT_TRC20: [20, 2500], USDT_ERC20: [50, 5000], USDT_BEP20: [15, 3000], BTC: [0.0008, 0.08], SOL: [0.3, 40] };
const rnd = ([a, b]) => Number((a + Math.random() * (b - a)).toPrecision(4));

export async function getTrafficState() {
  const h = await redis().hgetall(TRAFFIC_KEY);
  return { enabled: h.enabled === '1', intervalMs: Number(h.intervalMs || config.mock.trafficIntervalMs) };
}
export async function setTrafficState({ enabled, intervalMs }) {
  const cur = await getTrafficState();
  await redis().hset(TRAFFIC_KEY, { enabled: (enabled ?? cur.enabled) ? '1' : '0', intervalMs: intervalMs ?? cur.intervalMs });
  return getTrafficState();
}

async function once() {
  const clients = await User.find({ role: 'client', status: 'active' }).select('_id').lean();
  if (!clients.length) return;
  const user = clients[Math.floor(Math.random() * clients.length)];
  const asset = DEPOSIT_ASSETS[Math.floor(Math.random() * DEPOSIT_ASSETS.length)];
  if (Math.random() < 0.82) {
    await simulateDeposit({ userId: user._id, asset: asset.code, amount: rnd(AMOUNTS[asset.code]) });
  } else {
    const amount = Math.max(asset.minWithdrawal * 2, rnd(AMOUNTS[asset.code]) / 3);
    await requestWithdrawal(user._id, { asset: asset.code, amount: Number(amount.toPrecision(4)), toAddress: randomExternalAddress(asset.network) })
      .catch((e) => log.debug('withdrawal skipped', { e: e.message }));
  }
}

export async function startMockTraffic() {
  if (config.mock.autoTraffic) await setTrafficState({ enabled: true });
  let last = 0;
  setInterval(async () => {
    const st = await getTrafficState().catch(() => ({ enabled: false }));
    if (!st.enabled || Date.now() - last < st.intervalMs) return;
    last = Date.now();
    once().catch((e) => log.error('traffic tick failed', { e: e.message }));
  }, 1000);
}
