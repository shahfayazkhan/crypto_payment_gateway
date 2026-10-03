import mongoose from 'mongoose';

const webhookDeliverySchema = new mongoose.Schema({
  event: { type: String, required: true, index: true },
  url: String,
  payload: mongoose.Schema.Types.Mixed,
  status: { type: String, enum: ['pending', 'delivered', 'failed'], default: 'pending', index: true },
  attempts: { type: Number, default: 0 },
  responseCode: Number,
  lastError: String,
  deliveredAt: Date,
}, { timestamps: true });

webhookDeliverySchema.index({ createdAt: -1 });

export const WebhookDelivery = mongoose.model('WebhookDelivery', webhookDeliverySchema);
