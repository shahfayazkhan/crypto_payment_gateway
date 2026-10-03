import 'dotenv/config';

const bool = (v, d = false) => (v === undefined ? d : ['1', 'true', 'yes', 'on'].includes(String(v).toLowerCase()));
const num = (v, d) => (v === undefined || v === '' ? d : Number(v));

export const config = {
  env: process.env.NODE_ENV || 'development',
  port: num(process.env.PORT, 4000),
  corsOrigin: (process.env.CORS_ORIGIN || 'http://localhost:3000').split(','),
  jwtSecret: process.env.JWT_SECRET || 'dev-secret',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '12h',
  runWorkersInApi: bool(process.env.RUN_WORKERS_IN_API, true),

  mongoUri: process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/crypto_gateway?replicaSet=rs0&directConnection=true',
  redisUrl: process.env.REDIS_URL || 'redis://127.0.0.1:6379',
  rabbitUrl: process.env.RABBITMQ_URL || 'amqp://guest:guest@127.0.0.1:5672',

  chainMode: process.env.CHAIN_MODE || 'mock',
  mt5Mode: process.env.MT5_MODE || 'mock',
  mt5BridgeUrl: process.env.MT5_BRIDGE_URL || 'http://localhost:5080',
  mt5BridgeApiKey: process.env.MT5_BRIDGE_API_KEY || '',
  priceMode: process.env.PRICE_MODE || 'mock',

  mock: {
    speed: num(process.env.MOCK_SPEED, 1),
    autoTraffic: bool(process.env.MOCK_AUTO_TRAFFIC, false),
    trafficIntervalMs: num(process.env.MOCK_TRAFFIC_INTERVAL_MS, 8000),
  },

  mnemonic: process.env.MASTER_MNEMONIC || 'test test test test test test test test test test test junk',
  btcNetwork: process.env.BTC_NETWORK || 'testnet',

  coldWallets: {
    TRON: process.env.COLD_WALLET_TRON || 'TPL66VK2gCXNCD7EJg9pgJRfqcRazjhUZY',
    ETH: process.env.COLD_WALLET_ETH || '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed',
    BSC: process.env.COLD_WALLET_BSC || '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed',
    BTC: process.env.COLD_WALLET_BTC || 'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx',
    SOL: process.env.COLD_WALLET_SOL || '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM',
  },

  rpc: {
    ETH: process.env.ETH_RPC_URL || 'https://ethereum-sepolia-rpc.publicnode.com',
    BSC: process.env.BSC_RPC_URL || 'https://bsc-testnet-rpc.publicnode.com',
    TRON: process.env.TRON_API_URL || 'https://nile.trongrid.io',
    TRON_API_KEY: process.env.TRON_API_KEY || '',
    BTC: process.env.BTC_ESPLORA_URL || 'https://blockstream.info/testnet/api',
    SOL: process.env.SOL_RPC_URL || 'https://api.devnet.solana.com',
  },
  contracts: {
    USDT_ERC20: process.env.USDT_ERC20_CONTRACT || '0x7169D38820dfd117C3FA1f22a697dBA58d90BA06',
    USDT_BEP20: process.env.USDT_BEP20_CONTRACT || '0x337610d27c682E347C9cD60BD4b3b107C9d34dDd',
    USDT_TRC20: process.env.USDT_TRC20_CONTRACT || 'TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf',
  },

  treasury: {
    sweepIntervalMs: num(process.env.SWEEP_INTERVAL_MS, 30000),
    hotWalletTargetUsd: num(process.env.HOT_WALLET_TARGET_USD, 25000),
    withdrawalAutoApproveUsd: num(process.env.WITHDRAWAL_AUTO_APPROVE_USD, 0),
    withdrawalDailyLimitUsd: num(process.env.WITHDRAWAL_DAILY_LIMIT_USD, 50000),
  },

  webhooks: {
    urls: (process.env.WEBHOOK_URLS ?? 'http://localhost:4000/api/dev/webhook-sink').split(',').map((s) => s.trim()).filter(Boolean),
    secret: process.env.WEBHOOK_SECRET || 'whsec_dev_change_me',
  },
};

export const isMock = () => config.chainMode === 'mock';
