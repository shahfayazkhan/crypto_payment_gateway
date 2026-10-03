/**
 * Client for the .NET MT5 Bridge. Assumed REST contract (adjust paths to match your bridge):
 *   GET  /api/v1/accounts/{login}                → { login, name, group, balance, credit, equity, margin, freeMargin, leverage, currency }
 *   POST /api/v1/accounts/{login}/balance        { type: 'deposit'|'withdrawal', amount, comment, idempotencyKey }
 *                                                → { dealId, balance }
 * The bridge should map this to IMTManagerAPI.DealerBalance (DEAL_BALANCE) and enforce idempotency.
 */
import { config } from '../../config/index.js';
import { HttpError } from '../../lib/errors.js';

async function call(path, init = {}) {
  const res = await fetch(`${config.mt5BridgeUrl}${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', 'x-api-key': config.mt5BridgeApiKey, ...(init.headers || {}) },
    signal: AbortSignal.timeout(10000),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new HttpError(res.status === 422 ? 422 : 502, body.message || `MT5 bridge HTTP ${res.status}`);
  return body;
}

export const bridgeMt5 = {
  getAccount: (login) => call(`/api/v1/accounts/${login}`),
  deposit: (login, amount, comment, idempotencyKey) =>
    call(`/api/v1/accounts/${login}/balance`, { method: 'POST', body: JSON.stringify({ type: 'deposit', amount, comment, idempotencyKey }) }),
  withdraw: (login, amount, comment, idempotencyKey) =>
    call(`/api/v1/accounts/${login}/balance`, { method: 'POST', body: JSON.stringify({ type: 'withdrawal', amount, comment, idempotencyKey }) }),
};
