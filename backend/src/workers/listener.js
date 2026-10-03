/**
 * Chain listener — one loop per network.
 * Scans new blocks for transfers into client deposit addresses, then refreshes
 * confirmations for in-flight deposits and broadcast withdrawals.
 */
import { WalletAddress } from '../models/index.js';
import { NETWORKS, NETWORK_IDS } from '../config/chains.js';
import { config } from '../config/index.js';
import { adapterFor } from '../chains/index.js';
import { redis, withLock } from '../lib/redis.js';
import { emitPublic } from '../lib/realtime.js';
import { recordDetected, refreshConfirmations } from '../services/deposit.service.js';
import { refreshWithdrawalConfirmations } from '../services/withdrawal.service.js';
import { addrVersionKey } from '../services/wallet.service.js';
import { createLogger } from '../lib/logger.js';

const LIVE_POLL_MS = { TRON: 3000, ETH: 12000, BSC: 3000, BTC: 60000, SOL: 2000 };
const cursorKey = (n) => `listener:cursor:${n}`;

class NetworkListener {
  constructor(networkId) {
    this.networkId = networkId;
    this.adapter = adapterFor(networkId);
    this.log = createLogger(`listener:${networkId}`);
    this.watch = new Set();
    this.internal = new Set();
    this.addrVersion = -1;
    this.pollMs = config.chainMode === 'mock'
      ? Math.max(500, Math.floor(NETWORKS[networkId].mockBlockMs / config.mock.speed / 2))
      : LIVE_POLL_MS[networkId];
  }

  async refreshWatchSet() {
    const v = Number((await redis().get(addrVersionKey(this.networkId))) || 0);
    if (v === this.addrVersion) return;
    const rows = await WalletAddress.find({ network: this.networkId }).select('address kind').lean();
    this.watch = new Set(rows.filter((r) => r.kind === 'deposit').map((r) => r.address));
    this.internal = new Set(rows.filter((r) => r.kind !== 'deposit').map((r) => r.address));
    this.addrVersion = v;
    this.log.info(`watching ${this.watch.size} deposit addresses`);
  }

  async tick() {
    await withLock(`listener:${this.networkId}`, this.pollMs * 4, async () => {
      await this.refreshWatchSet();
      const height = await this.adapter.getHeight();
      const raw = await redis().get(cursorKey(this.networkId));
      let cursor = raw ? Number(raw) : height - 1;
      if (height > cursor) {
        const fromBlock = cursor + 1;
        const transfers = await this.adapter.scanTransfers({ fromBlock, toBlock: height, watch: this.watch });
        for (const t of transfers) {
          if (this.internal.has(t.from)) continue; // gas top-ups etc. are not client deposits
          await recordDetected(this.networkId, t, height);
        }
        // live EVM caps the range per call; advance only as far as we actually scanned
        const scannedTo = this.adapter.maxRange ? Math.min(height, fromBlock + this.adapter.maxRange - 1) : height;
        cursor = scannedTo;
        await redis().set(cursorKey(this.networkId), cursor);
        emitPublic('chain:block', { network: this.networkId, height });
      }
      await refreshConfirmations(this.networkId, height, this.adapter);
      await refreshWithdrawalConfirmations(this.networkId, this.adapter);
    });
  }

  start() {
    const loop = async () => {
      try { await this.tick(); } catch (e) { this.log.error('tick failed', { e: e.message }); }
      this.timer = setTimeout(loop, this.pollMs);
    };
    loop();
    this.log.info(`started (${this.adapter.kind}, every ${this.pollMs}ms)`);
  }
}

export function startListeners() {
  return NETWORK_IDS.map((n) => {
    const l = new NetworkListener(n);
    l.start();
    return l;
  });
}
