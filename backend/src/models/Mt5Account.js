import mongoose from 'mongoose';

/** Mock MT5 server state (used only when MT5_MODE=mock). */
const mt5AccountSchema = new mongoose.Schema({
  login: { type: Number, required: true, unique: true },
  name: String,
  group: { type: String, default: 'real\\standard' },
  currency: { type: String, default: 'USD' },
  leverage: { type: Number, default: 100 },
  balance: { type: Number, default: 0 },
  credit: { type: Number, default: 0 },
  margin: { type: Number, default: 0 },
  floatingPnl: { type: Number, default: 0 },
}, { timestamps: true });

const mt5DealSchema = new mongoose.Schema({
  dealId: { type: String, required: true, unique: true },
  login: { type: Number, required: true, index: true },
  type: { type: String, enum: ['deposit', 'withdrawal'], required: true },
  amount: Number,
  comment: String,
  idempotencyKey: { type: String, unique: true, sparse: true },
  balanceAfter: Number,
}, { timestamps: true });

export const Mt5Account = mongoose.model('Mt5Account', mt5AccountSchema);
export const Mt5Deal = mongoose.model('Mt5Deal', mt5DealSchema);
