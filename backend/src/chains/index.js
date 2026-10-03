import { config } from '../config/index.js';
import { NETWORK_IDS } from '../config/chains.js';
import { MockAdapter } from './mock/MockAdapter.js';
import { EvmAdapter } from './live/EvmAdapter.js';
import { BtcAdapter } from './live/BtcAdapter.js';
import { TronAdapter } from './live/TronAdapter.js';
import { SolanaAdapter } from './live/SolanaAdapter.js';

/**
 * Chain adapter contract (all networks implement the same surface):
 *   getHeight(): Promise<number>
 *   scanTransfers({ fromBlock, toBlock, watch:Set<string> }): Promise<Transfer[]>
 *   getTxStatus(txHash): Promise<{ found, blockNumber?, confirmations?, success? }>
 *   getBalance(address, assetCode): Promise<bigint>   (base units)
 *   send({ from, fromPath, to, assetCode, amountRaw }): Promise<{ txHash }>
 */
const live = { ETH: () => new EvmAdapter('ETH'), BSC: () => new EvmAdapter('BSC'), BTC: () => new BtcAdapter(), TRON: () => new TronAdapter(), SOL: () => new SolanaAdapter() };

const cache = {};
export function adapterFor(networkId) {
  if (!cache[networkId]) cache[networkId] = config.chainMode === 'live' ? live[networkId]() : new MockAdapter(networkId);
  return cache[networkId];
}
export const allAdapters = () => NETWORK_IDS.map(adapterFor);
