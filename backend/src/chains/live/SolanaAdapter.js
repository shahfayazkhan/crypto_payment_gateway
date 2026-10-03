/**
 * Live Solana adapter via JSON-RPC (devnet by default). Uses slot as "block".
 * Read path via getSignaturesForAddress + getTransaction balance deltas.
 * Sending (SystemProgram.transfer) belongs in the signer service — TODO for the live phase.
 */
import { config } from '../../config/index.js';
import { NotImplementedError } from '../errors.js';

export class SolanaAdapter {
  constructor() { this.networkId = 'SOL'; this.kind = 'live'; this.url = config.rpc.SOL; }

  async rpc(method, params = []) {
    const r = await fetch(this.url, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }), signal: AbortSignal.timeout(10000),
    });
    const j = await r.json();
    if (j.error) throw new Error(j.error.message);
    return j.result;
  }

  getHeight() { return this.rpc('getSlot', [{ commitment: 'confirmed' }]); }

  async scanTransfers({ toBlock, watch }) {
    const out = [];
    for (const addr of watch) {
      const sigs = await this.rpc('getSignaturesForAddress', [addr, { limit: 20, commitment: 'confirmed' }]);
      for (const s of sigs) {
        if (s.err || s.slot > toBlock) continue;
        const tx = await this.rpc('getTransaction', [s.signature, { maxSupportedTransactionVersion: 0, commitment: 'confirmed' }]);
        const keys = tx.transaction.message.accountKeys.map((k) => (typeof k === 'string' ? k : k.pubkey));
        const i = keys.indexOf(addr);
        const delta = BigInt(tx.meta.postBalances[i]) - BigInt(tx.meta.preBalances[i]);
        if (i > 0 && delta > 0n) out.push({ txHash: s.signature, outputIndex: 0, asset: 'SOL', from: keys[0], to: addr, amountRaw: delta.toString(), blockNumber: s.slot });
      }
    }
    return out;
  }

  async getTxStatus(sig) {
    const [st] = (await this.rpc('getSignatureStatuses', [[sig], { searchTransactionHistory: true }])).value;
    if (!st) return { found: false };
    const h = await this.getHeight();
    return { found: true, blockNumber: st.slot, confirmations: st.confirmationStatus === 'finalized' ? 32 : h - st.slot + 1, success: !st.err };
  }

  async getBalance(address) {
    return BigInt((await this.rpc('getBalance', [address])).value);
  }

  async send() { throw new NotImplementedError('SOL live sending is not enabled yet (signer pending)'); }
}
