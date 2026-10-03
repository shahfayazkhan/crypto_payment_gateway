import { Router } from 'express';
import mongoose from 'mongoose';
import auth from './auth.routes.js';
import client from './client.routes.js';
import admin from './admin.routes.js';
import dev from './dev.routes.js';
import { publicChainConfig } from '../config/chains.js';
import { redis } from '../lib/redis.js';

const r = Router();

r.get('/health', async (_req, res) => {
  const mongo = mongoose.connection.readyState === 1;
  const red = await redis().ping().then(() => true).catch(() => false);
  res.status(mongo && red ? 200 : 503).json({ ok: mongo && red, mongo, redis: red, time: new Date().toISOString() });
});
r.get('/meta', (_req, res) => res.json(publicChainConfig()));
r.use('/auth', auth);
r.use('/client', client);
r.use('/admin', admin);
r.use('/dev', dev);

export default r;
