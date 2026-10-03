/**
 * Live Bitcoin adapter via Esplora (Blockstream / mempool.space).
 * Read path implemented (address polling). Sending requires UTXO selection + PSBT signing
 * with @scure/btc-signer inside the signer service — left as a TODO for the live phase.
 */
import { config } from '../../config/index.js';
import { NotImplementedError } from '../errors.js';

export class BtcAdapter {
  constructor() { this.networkId = 'BTC'; this.kind = 'live'; this.base = config.rpc.BTC; }

  async get(path) {
    const r = await fetch(this.base + path, { signal: AbortSignal.timeout(10000) });
    if (!r.ok) throw new Error(`esplora ${r.status} ${path}`);
    return path.endsWith('height') ? Number(await r.text()) : r.json();
  }

  getHeight() { return this.get('/blocks/tip/height'); }

  async scanTransfers({ toBlock, watch }) {
    const out = [];
    for (const addr of watch) {
      const txs = await this.get(`/address/${addr}/txs`);
      for (const tx of txs) {
        if (!tx.status?.confirmed || tx.status.block_height > toBlock) continue;
        tx.vout.forEach((v, i) => {
          if (v.scriptpubkey_address === addr) {
            out.push({ txHash: tx.txid, outputIndex: i, asset: 'BTC', from: tx.vin[0]?.prevout?.scriptpubkey_address || 'unknown', to: addr, amountRaw: String(v.value), blockNumber: tx.status.block_height });
          }
        });
      }
    }
    return out;
  }

  async getTxStatus(txHash) {
    try {
      const s = await this.get(`/tx/${txHash}/status`);
      if (!s.confirmed) return { found: true, confirmations: 0 };
      const h = await this.getHeight();
      return { found: true, blockNumber: s.block_height, confirmations: h - s.block_height + 1, success: true };
    } catch { return { found: false }; }
  }

  async getBalance(address) {
    const a = await this.get(`/address/${address}`);
    return BigInt(a.chain_stats.funded_txo_sum - a.chain_stats.spent_txo_sum);
  }

  async send() { throw new NotImplementedError('BTC live sending is not enabled yet (PSBT signer pending)'); }
}
