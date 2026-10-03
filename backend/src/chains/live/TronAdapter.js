/**
 * Live TRON adapter via TronGrid (Nile testnet by default).
 * Read path: TRC20 transfer polling per watched address. Sending (TriggerSmartContract +
 * signing) belongs in the signer service — TODO for the live phase (use tronweb there).
 */
import { config } from '../../config/index.js';
import { assetsOnNetwork } from '../../config/chains.js';
import { NotImplementedError } from '../errors.js';

export class TronAdapter {
  constructor() {
    this.networkId = 'TRON';
    this.kind = 'live';
    this.base = config.rpc.TRON;
    this.token = assetsOnNetwork('TRON').find((a) => a.code === 'USDT_TRC20');
  }

  async req(path, body) {
    const r = await fetch(this.base + path, {
      method: body ? 'POST' : 'GET',
      headers: { 'content-type': 'application/json', ...(config.rpc.TRON_API_KEY ? { 'TRON-PRO-API-KEY': config.rpc.TRON_API_KEY } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) throw new Error(`trongrid ${r.status} ${path}`);
    return r.json();
  }

  async getHeight() {
    const b = await this.req('/wallet/getnowblock', {});
    return b.block_header.raw_data.number;
  }

  async scanTransfers({ toBlock, watch }) {
    const out = [];
    for (const addr of watch) {
      const j = await this.req(`/v1/accounts/${addr}/transactions/trc20?only_to=true&limit=50&contract_address=${this.token.contract}`);
      for (const t of j.data || []) {
        const info = await this.req('/wallet/gettransactioninfobyid', { value: t.transaction_id });
        if (!info.blockNumber || info.blockNumber > toBlock) continue;
        out.push({ txHash: t.transaction_id, outputIndex: 0, asset: 'USDT_TRC20', from: t.from, to: t.to, amountRaw: t.value, blockNumber: info.blockNumber });
      }
    }
    return out;
  }

  async getTxStatus(txHash) {
    const info = await this.req('/wallet/gettransactioninfobyid', { value: txHash });
    if (!info.blockNumber) return { found: false };
    const h = await this.getHeight();
    return { found: true, blockNumber: info.blockNumber, confirmations: h - info.blockNumber + 1, success: info.receipt?.result !== 'REVERT' };
  }

  async getBalance(address, assetCode) {
    const j = await this.req(`/v1/accounts/${address}`);
    const acc = j.data?.[0];
    if (!acc) return 0n;
    if (assetCode === 'TRX') return BigInt(acc.balance || 0);
    const entry = (acc.trc20 || []).find((o) => o[this.token.contract]);
    return BigInt(entry ? entry[this.token.contract] : 0);
  }

  async send() { throw new NotImplementedError('TRON live sending is not enabled yet (signer pending)'); }
}
