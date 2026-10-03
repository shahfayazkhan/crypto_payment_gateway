import mongoose from 'mongoose';

export const SWEEP_STATUS = ['pending', 'gas_topup', 'sweeping', 'completed', 'failed'];

const sweepSchema = new mongoose.Schema({
  network: { type: String, required: true, index: true },
  asset: { type: String, required: true },
  fromAddresses: [String],
  toAddress: { type: String, required: true },
  destination: { type: String, enum: ['hot', 'cold'], required: true },
  amount: Number,
  amountUsd: Number,
  gasTopupTxHash: String,
  gasTopupAmount: Number,
  txHash: String,
  blockNumber: Number,
  confirmations: { type: Number, default: 0 },
  status: { type: String, enum: SWEEP_STATUS, default: 'pending', index: true },
  deposits: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Deposit' }],
  error: String,
  completedAt: Date,
  trigger: { type: String, enum: ['schedule', 'manual'], default: 'schedule' },
}, { timestamps: true });

sweepSchema.index({ createdAt: -1 });

export const Sweep = mongoose.model('Sweep', sweepSchema);
