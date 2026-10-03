import crypto from 'node:crypto';
import { config } from '../config/index.js';
import { WebhookDelivery } from '../models/index.js';
import { publish, QUEUES } from '../lib/rabbit.js';
import { createLogger } from '../lib/logger.js';

const log = createLogger('webhooks');

/**
 * Events consumed by CRM / RMS:
 *  deposit.detected · deposit.credited · deposit.credit_failed
 *  withdrawal.requested · withdrawal.approved · withdrawal.rejected · withdrawal.completed · withdrawal.failed
 *  sweep.completed
 */
export async function emitWebhook(event, data) {
  const payload = { id: crypto.randomUUID(), event, createdAt: new Date().toISOString(), data };
  for (const url of config.webhooks.urls) {
    const d = await WebhookDelivery.create({ event, url, payload });
    await publish(QUEUES.WEBHOOK_OUT, { deliveryId: d.id }).catch((e) => log.error('enqueue failed', { e: e.message }));
  }
}

export function sign(body, ts = Math.floor(Date.now() / 1000)) {
  const sig = crypto.createHmac('sha256', config.webhooks.secret).update(`${ts}.${body}`).digest('hex');
  return `t=${ts},v1=${sig}`;
}

/** Called by the webhook worker. Throws on failure so RabbitMQ retries with backoff. */
export async function deliver(deliveryId) {
  const d = await WebhookDelivery.findById(deliveryId);
  if (!d || d.status === 'delivered') return;
  const body = JSON.stringify(d.payload);
  d.attempts += 1;
  try {
    const res = await fetch(d.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-gateway-signature': sign(body), 'x-gateway-event': d.event },
      body,
      signal: AbortSignal.timeout(8000),
    });
    d.responseCode = res.status;
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    d.status = 'delivered';
    d.deliveredAt = new Date();
    d.lastError = undefined;
    await d.save();
  } catch (e) {
    d.lastError = e.message;
    d.status = d.attempts >= 6 ? 'failed' : 'pending';
    await d.save();
    throw e;
  }
}
