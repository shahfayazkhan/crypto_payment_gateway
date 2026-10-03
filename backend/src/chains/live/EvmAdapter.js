/**
 * Live EVM adapter (ETH Sepolia / BSC Testnet).
 *  - USDT deposits: ERC20 Transfer logs filtered by `to` topic (chunked).
 *  - Native deposits: block scan (only needed if you enable ETH/BNB as depositable).
 *  - Sends: signed with keys from the signer boundary.
 */
import { JsonRpcProvider, Contract, Wallet, zeroPadValue, getAddress, id as keccakId, hexlify } from 'ethers';
import { config } from '../../config/index.js';
import { NETWORKS, ASSETS, assetsOnNetwork, nativeAssetOf } from '../../config/chains.js';
import { privateKeyFor } from '../../signer/keys.js';
import { InsufficientFundsError } from '../errors.js';

const TRANSFER_TOPIC = keccakId('Transfer(address,address,uint256)');
const ERC20_ABI = ['function balanceOf(address) view returns (uint256)', 'function transfer(address,uint256) returns (bool)'];

export class EvmAdapter {
  constructor(networkId) {
    this.networkId = networkId;
    this.kind = 'live';
    this.provider = new JsonRpcProvider(config.rpc[networkId], NETWORKS[networkId].chainId, { staticNetwork: true });
    this.tokens = assetsOnNetwork(networkId).filter((a) => a.type === 'token' && a.contract);
    this.maxRange = 200;
  }

  getHeight() { return this.provider.getBlockNumber(); }

  async scanTransfers({ fromBlock, toBlock, watch }) {
    if (!watch.size) return [];
    toBlock = Math.min(toBlock, fromBlock + this.maxRange - 1);
    const out = [];
    const topics = [...watch].map((a) => zeroPadValue(getAddress(a), 32));
    for (const token of this.tokens) {
      for (let i = 0; i < topics.length; i += 100) {
        const logs = await this.provider.getLogs({
          address: token.contract, fromBlock, toBlock, topics: [TRANSFER_TOPIC, null, topics.slice(i, i + 100)],
        });
        for (const l of logs) {
          out.push({
            txHash: l.transactionHash, outputIndex: l.index, asset: token.code,
            from: getAddress('0x' + l.topics[1].slice(26)), to: getAddress('0x' + l.topics[2].slice(26)),
            amountRaw: BigInt(l.data).toString(), blockNumber: l.blockNumber,
          });
        }
      }
    }
    const native = nativeAssetOf(this.networkId);
    if (native.depositable) {
      for (let b = fromBlock; b <= toBlock; b++) {
        const block = await this.provider.getBlock(b, true);
        for (const tx of block?.prefetchedTransactions || []) {
          if (tx.to && watch.has(getAddress(tx.to)) && tx.value > 0n) {
            out.push({ txHash: tx.hash, outputIndex: 0, asset: native.code, from: tx.from, to: getAddress(tx.to), amountRaw: tx.value.toString(), blockNumber: b });
          }
        }
      }
    }
    return out;
  }

  async getTxStatus(txHash) {
    const r = await this.provider.getTransactionReceipt(txHash);
    if (!r) return { found: false };
    const height = await this.getHeight();
    return { found: true, blockNumber: r.blockNumber, confirmations: height - r.blockNumber + 1, success: r.status === 1 };
  }

  async getBalance(address, assetCode) {
    const a = ASSETS[assetCode];
    if (a.type === 'native') return this.provider.getBalance(address);
    return new Contract(a.contract, ERC20_ABI, this.provider).balanceOf(address);
  }

  async send({ fromPath, to, assetCode, amountRaw }) {
    const pk = privateKeyFor(this.networkId, fromPath);
    const wallet = new Wallet(hexlify(pk), this.provider);
    const a = ASSETS[assetCode];
    try {
      const tx = a.type === 'native'
        ? await wallet.sendTransaction({ to, value: BigInt(amountRaw) })
        : await new Contract(a.contract, ERC20_ABI, wallet).transfer(to, BigInt(amountRaw));
      return { txHash: tx.hash };
    } catch (e) {
      if (e.code === 'INSUFFICIENT_FUNDS') throw new InsufficientFundsError(e.shortMessage || e.message);
      throw e;
    }
  }
}
