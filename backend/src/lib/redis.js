import Redis from 'ioredis';
import { config } from '../config/index.js';
import { createLogger } from './logger.js';

const log = createLogger('redis');
let client;

export function redis() {
  if (!client) {
    client = new Redis(config.redisUrl, { maxRetriesPerRequest: null });
    client.on('error', (e) => log.error(e.message));
  }
  return client;
}

/** New dedicated connection (needed for pub/sub adapters). */
export const newRedis = () => new Redis(config.redisUrl, { maxRetriesPerRequest: null });

/**
 * Simple distributed lock (SET NX PX). Good enough for single-Redis setups;
 * swap for Redlock if you run Redis Cluster.
 */
export async function withLock(key, ttlMs, fn) {
  const token = Math.random().toString(36).slice(2);
  const ok = await redis().set(`lock:${key}`, token, 'PX', ttlMs, 'NX');
  if (!ok) return { locked: false };
  try {
    return { locked: true, result: await fn() };
  } finally {
    // release only if we still own it
    await redis().eval(
      "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
      1, `lock:${key}`, token,
    );
  }
}
