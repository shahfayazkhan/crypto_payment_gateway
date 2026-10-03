import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';

dayjs.extend(relativeTime);

export const usd = (n, digits = 2) =>
  n === undefined || n === null ? '—' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: digits, minimumFractionDigits: digits }).format(n);
export const usdCompact = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1 }).format(n || 0);
export const crypto = (n, max = 8) => (n === undefined || n === null ? '—' : new Intl.NumberFormat('en-US', { maximumFractionDigits: max }).format(n));
export const short = (s, a = 6, b = 4) => (!s ? '—' : s.length <= a + b + 1 ? s : `${s.slice(0, a)}…${s.slice(-b)}`);
export const ago = (d) => (d ? dayjs(d).fromNow() : '—');
export const dt = (d) => (d ? dayjs(d).format('DD MMM YYYY, HH:mm') : '—');

export const ASSET_META = {
  USDT_TRC20: { symbol: 'USDT', net: 'TRC20', color: '#26A17B', networkColor: '#EF0027' },
  USDT_ERC20: { symbol: 'USDT', net: 'ERC20', color: '#26A17B', networkColor: '#627EEA' },
  USDT_BEP20: { symbol: 'USDT', net: 'BEP20', color: '#26A17B', networkColor: '#FDE047' },
  BTC: { symbol: 'BTC', net: 'Bitcoin', color: '#F7931A', networkColor: '#F7931A' },
  SOL: { symbol: 'SOL', net: 'Solana', color: '#9945FF', networkColor: '#14F195' },
  TRX: { symbol: 'TRX', net: 'gas', color: '#EF0027' },
  ETH: { symbol: 'ETH', net: 'gas', color: '#627EEA' },
  BNB: { symbol: 'BNB', net: 'gas', color: '#F3BA2F' },
};
export const EXPLORER = {
  TRON: 'https://nile.tronscan.org/#/transaction/',
  ETH: 'https://sepolia.etherscan.io/tx/',
  BSC: 'https://testnet.bscscan.com/tx/',
  BTC: 'https://mempool.space/testnet/tx/',
  SOL: 'https://explorer.solana.com/tx/',
};
