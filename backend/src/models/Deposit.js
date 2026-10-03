import mongoose from 'mongoose';

export const DEPOSIT_STATUS = [
  'confirming',     // seen on-chain, waiting for confirmations
  'confirmed',      // reached threshold, queued for MT5 credit
  'crediting',      // MT5 call in flight
  'credited',       // MT5 balance updated
  'credit_failed',  // MT5 call failed after retries — needs ops
  'below_minimum',  // amount < minDeposit, not credited
  'orphaned',       // dropped by a re-org
];

const depositSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  mt5Login: Number,
  network: { type: String, required: true, index: true },
  asset: { type: String, required: true, index: true },
  address: { type: String, required: true, index: true },
  fromAddress: String,
  txHash: { type: String, required: true },
  outputIndex: { type: Number, default: 0 }, // log index / vout / instruction index
  blockNumber: Number,
  amount: { type: Number, required: true },
  amountRaw: { type: String, required: true },
  confirmations: { type: Number, default: 0 },
  requiredConfirmations: { type: Number, required: true },
  status: { type: String, enum: DEPOSIT_STATUS, default: 'confirming', index: true },
  priceUsd: Number,
  amountUsd: Number,
  mt5DealId: String,
  creditedAt: Date,
  sweep: { type: mongoose.Schema.Types.ObjectId, ref: 'Sweep', index: true },
  sweptAt: Date,
  error: String,
  simulated: { type: Boolean, default: false },
}, { timestamps: true });

// Idempotency: one record per on-chain transfer
depositSchema.index({ network: 1, txHash: 1, outputIndex: 1 }, { unique: true });
depositSchema.index({ createdAt: -1 });

export const Deposit = mongoose.model('Deposit', depositSchema);
