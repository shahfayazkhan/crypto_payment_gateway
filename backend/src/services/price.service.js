import { config } from '../config/index.js';
import { redis } from '../lib/redis.js';
import { emitPublic } from '../lib/realtime.js';
import { createLogger } from '../lib/logger.js';

const log = createLogger('prices');
const KEY = 'prices:usd';
const BASE = { USDT: 1, BTC: 64250, ETH: 3180, BNB: 585, TRX: 0.124, SOL: 152.4 };

export async function getPrices() {
  const h = await redis().hgetall(KEY);
  const out = { ...BASE };
  for (const [k, v] of Object.entries(h)) out[k] = Number(v);
  return out;
}

export async function getPrice(priceKey) {
  const v = await redis().hget(KEY, priceKey);
  return v ? Number(v) : BASE[priceKey];
}

/** Random walk (mock) or CoinGecko (live). Called by the worker on an interval. */
export async function refreshPrices() {
  let next;
  if (config.priceMode === 'coingecko') {
    try {
      const ids = { BTC: 'bitcoin', ETH: 'ethereum', BNB: 'binancecoin', TRX: 'tron', SOL: 'solana', USDT: 'tether' };
      const r = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${Object.values(ids).join(',')}&vs_currencies=usd`);
      const j = await r.json();
      next = Object.fromEntries(Object.entries(ids).map(([k, id]) => [k, j[id]?.usd ?? BASE[k]]));
    } catch (e) {
      log.warn('coingecko failed, keeping old prices', { e: e.message });
      return getPrices();
    }
  } else {
    const cur = await getPrices();
    next = Object.fromEntries(Object.entries(cur).map(([k, v]) => {
      if (k === 'USDT') return [k, 1];
      const drift = 1 + (Math.random() - 0.5) * 0.004; // ±0.2%
      const pulled = v * drift * 0.98 + BASE[k] * 0.02;  // mean-revert so it never wanders off
      return [k, Number(pulled.toPrecision(6))];
    }));
  }
  await redis().hset(KEY, next);
  emitPublic('price:update', next);
  return next;
}
