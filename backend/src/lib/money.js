/** Decimal <-> base-unit helpers. Base units are kept as BigInt / strings to avoid float drift. */
export function toRaw(amount, decimals) {
  const s = typeof amount === 'number' ? amount.toFixed(decimals) : String(amount);
  const [int, frac = ''] = s.split('.');
  const padded = (frac + '0'.repeat(decimals)).slice(0, decimals);
  return BigInt(int + padded).toString();
}

export function fromRaw(raw, decimals) {
  const neg = String(raw).startsWith('-');
  const s = String(raw).replace('-', '').padStart(decimals + 1, '0');
  const int = s.slice(0, s.length - decimals);
  const frac = s.slice(s.length - decimals).replace(/0+$/, '');
  return Number(`${neg ? '-' : ''}${int}${frac ? '.' + frac : ''}`);
}

export const round = (n, dp = 2) => Math.round(n * 10 ** dp) / 10 ** dp;
