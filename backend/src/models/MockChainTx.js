import mongoose from 'mongoose';

/**
 * The mock blockchain ledger. A transfer becomes "mined" once the simulated
 * block height (Redis) reaches blockNumber.
 */
const mockChainTxSchema = new mongoose.Schema({
  network: { type: String, required: true, index: true },
  txHash: { type: String, required: true, index: true },
  asset: { type: String, required: true },
  from: { type: String, required: true, index: true },
  to: { type: String, required: true, index: true },
  amountRaw: { type: String, required: true },
  amount: Number,
  feeRaw: { type: String, default: '0' }, // charged in native asset to `from`
  blockNumber: { type: Number, required: true, index: true },
  outputIndex: { type: Number, default: 0 },
  memo: String,
}, { timestamps: true });

mockChainTxSchema.index({ network: 1, blockNumber: 1 });
mockChainTxSchema.index({ txHash: 1, outputIndex: 1 }, { unique: true });

export const MockChainTx = mongoose.model('MockChainTx', mockChainTxSchema);
