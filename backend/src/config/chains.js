import { config } from './index.js';

/**
 * Network definitions.
 * - confirmations: blocks required before a deposit is credited to MT5
 * - mockBlockMs:   block interval used by the chain simulator (scaled by MOCK_SPEED)
 * - gasAsset:      native coin used to pay fees (needed for token sweeps)
 */
export const NETWORKS = {
  TRON: {
    id: 'TRON', name: 'TRON (Nile)', native: 'TRX', model: 'account', curve: 'secp256k1',
    coinType: 195, confirmations: 19, mockBlockMs: 3000,
    explorerTx: 'https://nile.tronscan.org/#/transaction/',
    gasPerTokenTransfer: 15, // TRX (energy burn estimate without staking)
    nativeTransferFee: 0.3,
  },
  ETH: {
    id: 'ETH', name: 'Ethereum (Sepolia)', native: 'ETH', model: 'account', curve: 'secp256k1',
    coinType: 60, chainId: 11155111, confirmations: 12, mockBlockMs: 6000,
    explorerTx: 'https://sepolia.etherscan.io/tx/',
    gasPerTokenTransfer: 0.0015,
    nativeTransferFee: 0.00042,
  },
  BSC: {
    id: 'BSC', name: 'BNB Smart Chain (Testnet)', native: 'BNB', model: 'account', curve: 'secp256k1',
    coinType: 60, chainId: 97, confirmations: 15, mockBlockMs: 3000,
    explorerTx: 'https://testnet.bscscan.com/tx/',
    gasPerTokenTransfer: 0.0005,
    nativeTransferFee: 0.000105,
  },
  BTC: {
    id: 'BTC', name: 'Bitcoin (Testnet)', native: 'BTC', model: 'utxo', curve: 'secp256k1',
    coinType: config.btcNetwork === 'mainnet' ? 0 : 1, confirmations: 2, mockBlockMs: 20000,
    explorerTx: 'https://mempool.space/testnet/tx/',
    nativeTransferFee: 0.00002,
  },
  SOL: {
    id: 'SOL', name: 'Solana (Devnet)', native: 'SOL', model: 'account', curve: 'ed25519',
    coinType: 501, confirmations: 32, mockBlockMs: 1000,
    explorerTx: 'https://explorer.solana.com/tx/',
    nativeTransferFee: 0.000005,
  },
};

/**
 * Asset definitions. `depositable` assets get client deposit addresses.
 * Gas-only natives (TRX/ETH/BNB) exist so the treasury can track fee balances.
 */
export const ASSETS = {
  USDT_TRC20: {
    code: 'USDT_TRC20', symbol: 'USDT', label: 'USDT (TRC20)', network: 'TRON', type: 'token', decimals: 6,
    contract: config.contracts.USDT_TRC20, priceKey: 'USDT', depositable: true,
    minDeposit: 10, minWithdrawal: 20, withdrawalFee: 1, sweepThreshold: 50,
  },
  USDT_ERC20: {
    code: 'USDT_ERC20', symbol: 'USDT', label: 'USDT (ERC20)', network: 'ETH', type: 'token', decimals: 6,
    contract: config.contracts.USDT_ERC20, priceKey: 'USDT', depositable: true,
    minDeposit: 20, minWithdrawal: 50, withdrawalFee: 5, sweepThreshold: 200,
  },
  USDT_BEP20: {
    code: 'USDT_BEP20', symbol: 'USDT', label: 'USDT (BEP20)', network: 'BSC', type: 'token', decimals: 18,
    contract: config.contracts.USDT_BEP20, priceKey: 'USDT', depositable: true,
    minDeposit: 10, minWithdrawal: 20, withdrawalFee: 0.5, sweepThreshold: 50,
  },
  BTC: {
    code: 'BTC', symbol: 'BTC', label: 'Bitcoin', network: 'BTC', type: 'native', decimals: 8,
    priceKey: 'BTC', depositable: true,
    minDeposit: 0.0002, minWithdrawal: 0.0005, withdrawalFee: 0.0001, sweepThreshold: 0.002,
  },
  SOL: {
    code: 'SOL', symbol: 'SOL', label: 'Solana', network: 'SOL', type: 'native', decimals: 9,
    priceKey: 'SOL', depositable: true,
    minDeposit: 0.1, minWithdrawal: 0.2, withdrawalFee: 0.01, sweepThreshold: 1,
  },
  // gas-only natives
  TRX: { code: 'TRX', symbol: 'TRX', label: 'TRX (gas)', network: 'TRON', type: 'native', decimals: 6, priceKey: 'TRX', depositable: false },
  ETH: { code: 'ETH', symbol: 'ETH', label: 'ETH (gas)', network: 'ETH', type: 'native', decimals: 18, priceKey: 'ETH', depositable: false },
  BNB: { code: 'BNB', symbol: 'BNB', label: 'BNB (gas)', network: 'BSC', type: 'native', decimals: 18, priceKey: 'BNB', depositable: false },
};

export const DEPOSIT_ASSETS = Object.values(ASSETS).filter((a) => a.depositable);
export const NETWORK_IDS = Object.keys(NETWORKS);

export const getAsset = (code) => {
  const a = ASSETS[code];
  if (!a) throw Object.assign(new Error(`Unknown asset ${code}`), { status: 400 });
  return a;
};
export const getNetwork = (id) => {
  const n = NETWORKS[id];
  if (!n) throw Object.assign(new Error(`Unknown network ${id}`), { status: 400 });
  return n;
};
export const nativeAssetOf = (networkId) => ASSETS[NETWORKS[networkId].native];
export const assetsOnNetwork = (networkId) => Object.values(ASSETS).filter((a) => a.network === networkId);

/** Public view for the frontend */
export const publicChainConfig = () => ({
  networks: Object.values(NETWORKS).map(({ id, name, native, confirmations, explorerTx, model }) => ({
    id, name, native, confirmations, explorerTx, model,
  })),
  assets: DEPOSIT_ASSETS.map(({ code, symbol, label, network, decimals, minDeposit, minWithdrawal, withdrawalFee }) => ({
    code, symbol, label, network, decimals, minDeposit, minWithdrawal, withdrawalFee,
  })),
  mode: { chain: config.chainMode, mt5: config.mt5Mode, price: config.priceMode },
});
