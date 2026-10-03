import amqp from 'amqplib';
import { config } from '../config/index.js';
import { createLogger } from './logger.js';

const log = createLogger('rabbit');

export const EXCHANGE = 'gateway.events';
export const QUEUES = {
  DEPOSIT_CONFIRMED: 'deposit.confirmed',   // → credit MT5
  WITHDRAWAL_APPROVED: 'withdrawal.approved', // → sign + broadcast
  SWEEP_RUN: 'sweep.run',                   // → run sweep cycle now
  WEBHOOK_OUT: 'webhook.out',               // → deliver to CRM / RMS
};
const RETRY_DELAYS = [2000, 5000, 15000, 60000, 300000];

let conn;
let pubChannel;

export async function connectRabbit() {
  if (conn) return conn;
  conn = await amqp.connect(config.rabbitUrl);
  conn.on('error', (e) => log.error(e.message));
  conn.on('close', () => { log.warn('connection closed'); conn = null; pubChannel = null; });
  const ch = await conn.createChannel();
  await ch.assertExchange(EXCHANGE, 'direct', { durable: true });
  await ch.assertExchange(`${EXCHANGE}.dlx`, 'direct', { durable: true });
  for (const q of Object.values(QUEUES)) {
    await ch.assertQueue(q, { durable: true, deadLetterExchange: `${EXCHANGE}.dlx`, deadLetterRoutingKey: q });
    await ch.bindQueue(q, EXCHANGE, q);
    // parking queue for messages that exhausted all retries
    await ch.assertQueue(`${q}.dead`, { durable: true });
    await ch.bindQueue(`${q}.dead`, `${EXCHANGE}.dlx`, q);
  }
  await ch.close();
  log.info('connected');
  return conn;
}

export async function publish(queue, payload, headers = {}) {
  await connectRabbit();
  if (!pubChannel) pubChannel = await conn.createConfirmChannel();
  pubChannel.publish(EXCHANGE, queue, Buffer.from(JSON.stringify(payload)), {
    persistent: true, contentType: 'application/json', headers,
  });
  await pubChannel.waitForConfirms();
}

/**
 * Consume with retry/backoff. Handler throws → message is re-published with an
 * attempt counter after a delay; after the last attempt it is dead-lettered.
 */
export async function consume(queue, handler, { prefetch = 5 } = {}) {
  await connectRabbit();
  const ch = await conn.createChannel();
  await ch.prefetch(prefetch);
  await ch.consume(queue, async (msg) => {
    if (!msg) return;
    const attempt = Number(msg.properties.headers?.['x-attempt'] || 0);
    try {
      await handler(JSON.parse(msg.content.toString()), { attempt });
      ch.ack(msg);
    } catch (err) {
      log.error(`${queue} handler failed`, { attempt, err: err.message });
      if (attempt >= RETRY_DELAYS.length) {
        ch.nack(msg, false, false); // → DLX → <queue>.dead
      } else {
        ch.ack(msg);
        setTimeout(() => publish(queue, JSON.parse(msg.content.toString()), { 'x-attempt': attempt + 1 })
          .catch((e) => log.error('retry publish failed', { e: e.message })), RETRY_DELAYS[attempt]);
      }
    }
  });
  log.info(`consuming ${queue}`);
}
