import mongoose from 'mongoose';

export const WITHDRAWAL_STATUS = [
  'pending_review',     // MT5 debited, waiting for finance approval
  'approved',           // queued for signing
  'processing',         // signer working
  'awaiting_liquidity', // hot wallet short — needs cold → hot top-up
  'broadcast',          // tx sent, waiting confirmations
  'completed',
  'rejected',           // refunded to MT5
  'cancelled',          // client cancelled, refunded to MT5
  'failed',
];

const withdrawalSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  mt5Login: { type: Number, required: true },
  network: { type: String, required: true },
  asset: { type: String, required: true, index: true },
  toAddress: { type: String, required: true },
  amount: { type: Number, required: true },      // gross, debited from client
  fee: { type: Number, required: true },
  netAmount: { type: Number, required: true },   // sent on-chain
  priceUsd: Number,
  amountUsd: Number,
  status: { type: String, enum: WITHDRAWAL_STATUS, default: 'pending_review', index: true },
  mt5DebitDealId: String,
  mt5RefundDealId: String,
  fromAddress: String,
  txHash: String,
  blockNumber: Number,
  confirmations: { type: Number, default: 0 },
  requiredConfirmations: Number,
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  reviewedAt: Date,
  reviewNote: String,
  error: String,
  completedAt: Date,
}, { timestamps: true });

withdrawalSchema.index({ createdAt: -1 });

export const Withdrawal = mongoose.model('Withdrawal', withdrawalSchema);
