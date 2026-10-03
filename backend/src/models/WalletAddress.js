import mongoose from 'mongoose';

/**
 * Every address the gateway controls or watches.
 * kind: deposit (per client), hot (treasury hot wallet / gas station), cold (watch-only)
 */
const walletAddressSchema = new mongoose.Schema({
  network: { type: String, required: true, index: true },
  address: { type: String, required: true },
  kind: { type: String, enum: ['deposit', 'hot', 'cold'], required: true, index: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  derivationPath: String,
  derivationIndex: Number,
  label: String,
  lastSweptAt: Date,
}, { timestamps: true });

walletAddressSchema.index({ network: 1, address: 1 }, { unique: true });
walletAddressSchema.index({ user: 1, network: 1, kind: 1 });

export const WalletAddress = mongoose.model('WalletAddress', walletAddressSchema);
