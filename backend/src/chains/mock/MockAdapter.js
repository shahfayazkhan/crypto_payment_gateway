import { MockChainTx } from '../../models/index.js';
import { ASSETS, nativeAssetOf } from '../../config/chains.js';
import { InsufficientFundsError } from '../errors.js';
import * as chain from './mockChain.js';

export class MockAdapter {
  constructor(networkId) {
    this.networkId = networkId;
    this.kind = 'mock';
  }

  getHeight() { return chain.getHeight(this.networkId); }

  /** Transfers into watched addresses within [fromBlock, toBlock]. */
  async scanTransfers({ fromBlock, toBlock, watch }) {
    if (!watch.size) return [];
    const rows = await MockChainTx.find({
      network: this.networkId,
      blockNumber: { $gte: fromBlock, $lte: toBlock },
      to: { $in: [...watch] },
    }).lean();
    return rows.map((r) => ({
      txHash: r.txHash, outputIndex: r.outputIndex, asset: r.asset, from: r.from, to: r.to,
      amountRaw: r.amountRaw, blockNumber: r.blockNumber,
    }));
  }

  async getTxStatus(txHash) {
    const tx = await chain.getTx(txHash);
    if (!tx) return { found: false };
    const height = await this.getHeight();
    const mined = height >= tx.blockNumber;
    return { found: true, blockNumber: tx.blockNumber, confirmations: mined ? height - tx.blockNumber + 1 : 0, success: true };
  }

  getBalance(address, assetCode) { return chain.balanceRaw(this.networkId, address, assetCode); }

  /**
   * from: string | [{ address, amountRaw }] (multi-input for UTXO consolidation)
   * The mock ignores `fromPath` — live adapters use it to fetch the key from the signer.
   */
  async send({ from, to, assetCode, amountRaw }) {
    const inputs = Array.isArray(from) ? from : [{ address: from, amountRaw: BigInt(amountRaw) }];
    const native = nativeAssetOf(this.networkId);
    const fee = chain.feeFor(this.networkId, assetCode);
    for (const [i, inp] of inputs.entries()) {
      const bal = await this.getBalance(inp.address, assetCode);
      const need = BigInt(inp.amountRaw) + (assetCode === native.code && i === 0 ? fee : 0n);
      if (bal < need) {
        throw new InsufficientFundsError(`Insufficient ${ASSETS[assetCode].symbol} on ${inp.address}`, { have: String(bal), need: String(need) });
      }
    }
    if (assetCode !== native.code) {
      const gas = await this.getBalance(inputs[0].address, native.code);
      if (gas < fee) throw new InsufficientFundsError(`Insufficient ${native.symbol} for gas on ${inputs[0].address}`, { have: String(gas), need: String(fee) });
    }
    return chain.createTransfer({ networkId: this.networkId, assetCode, inputs, to });
  }
}
