/** Advances simulated block heights (mock mode only). */
import { NETWORKS, NETWORK_IDS } from '../config/chains.js';
import { config } from '../config/index.js';
import { mine } from '../chains/mock/mockChain.js';
import { withLock } from '../lib/redis.js';

export function startMockChainTicker() {
  for (const n of NETWORK_IDS) {
    const ms = Math.max(200, Math.floor(NETWORKS[n].mockBlockMs / config.mock.speed));
    // lock prevents double-mining if you run several worker processes
    setInterval(() => withLock(`mockmine:${n}`, ms - 50, () => mine(n, 1)).catch(() => {}), ms);
  }
}
