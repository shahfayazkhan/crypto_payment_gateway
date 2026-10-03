import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true, select: false },
  name: { type: String, required: true },
  role: { type: String, enum: ['client', 'finance', 'admin'], default: 'client', index: true },
  status: { type: String, enum: ['active', 'suspended'], default: 'active' },
  mt5Login: { type: Number, index: true, sparse: true },
  country: String,
  // Per-client HD index; the same index is used on every network
  derivationIndex: { type: Number, index: true, sparse: true },
  withdrawalDailyLimitUsd: Number,
}, { timestamps: true });

userSchema.methods.toJSON = function toJSON() {
  const o = this.toObject();
  delete o.passwordHash;
  return o;
};

export const User = mongoose.model('User', userSchema);
