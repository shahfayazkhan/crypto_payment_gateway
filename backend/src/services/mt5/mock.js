import crypto from 'node:crypto';
import { Mt5Account, Mt5Deal } from '../../models/index.js';
import { HttpError } from '../../lib/errors.js';
import { round } from '../../lib/money.js';

const view = (a) => {
  const equity = round(a.balance + a.credit + a.floatingPnl);
  return {
    login: a.login, name: a.name, group: a.group, currency: a.currency, leverage: a.leverage,
    balance: round(a.balance), credit: a.credit, equity, margin: a.margin,
    freeMargin: round(equity - a.margin), floatingPnl: a.floatingPnl,
  };
};

export const mockMt5 = {
  async getAccount(login) {
    const a = await Mt5Account.findOne({ login });
    if (!a) throw new HttpError(404, `MT5 account ${login} not found`);
    return view(a);
  },

  async balanceOperation(login, type, amount, comment, idempotencyKey) {
    // Idempotent: the same key never produces two deals
    const existing = idempotencyKey && (await Mt5Deal.findOne({ idempotencyKey }));
    if (existing) return { dealId: existing.dealId, balance: existing.balanceAfter, duplicate: true };

    const signed = type === 'deposit' ? amount : -amount;
    const filter = { login };
    if (type === 'withdrawal') {
      // atomic free-margin check: balance + credit + pnl - margin >= amount
      filter.$expr = { $gte: [{ $subtract: [{ $add: ['$balance', '$credit', '$floatingPnl'] }, '$margin'] }, amount] };
    }
    const a = await Mt5Account.findOneAndUpdate(filter, { $inc: { balance: round(signed) } }, { returnDocument: 'after' });
    if (!a) {
      const exists = await Mt5Account.exists({ login });
      throw new HttpError(exists ? 422 : 404, exists ? 'Insufficient free margin on MT5 account' : `MT5 account ${login} not found`);
    }
    const dealId = String(Date.now()).slice(-9) + crypto.randomInt(100, 999);
    await Mt5Deal.create({ dealId, login, type, amount, comment, idempotencyKey, balanceAfter: a.balance });
    return { dealId, balance: round(a.balance) };
  },

  deposit(login, amount, comment, key) { return this.balanceOperation(login, 'deposit', amount, comment, key); },
  withdraw(login, amount, comment, key) { return this.balanceOperation(login, 'withdrawal', amount, comment, key); },
};
