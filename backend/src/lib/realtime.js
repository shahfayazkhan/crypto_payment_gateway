import { Server } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { Emitter } from '@socket.io/redis-emitter';
import jwt from 'jsonwebtoken';
import { config } from '../config/index.js';
import { newRedis, redis } from './redis.js';
import { createLogger } from './logger.js';

const log = createLogger('realtime');
let io;      // set in the API process
let emitter; // used by any process (API or worker) — goes through Redis

/** Rooms: `user:<id>` for a client, `backoffice` for finance/admin, `public` for everyone. */
export function attachSocketServer(httpServer) {
  io = new Server(httpServer, { cors: { origin: config.corsOrigin, credentials: true } });
  io.adapter(createAdapter(newRedis(), newRedis()));
  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      const user = jwt.verify(token, config.jwtSecret);
      socket.data.user = user;
      next();
    } catch {
      next(new Error('unauthorized'));
    }
  });
  io.on('connection', (socket) => {
    const { sub, role } = socket.data.user;
    socket.join('public');
    socket.join(`user:${sub}`);
    if (role === 'finance' || role === 'admin') socket.join('backoffice');
    sendSnapshot(socket).catch(() => {});
    log.info('socket connected', { sub, role });
  });
  return io;
}

/** Give a freshly connected client the latest prices + block heights instead of waiting for the next tick. */
async function sendSnapshot(socket) {
  const prices = await redis().hgetall('prices:usd');
  if (Object.keys(prices).length) socket.emit('price:update', Object.fromEntries(Object.entries(prices).map(([k, v]) => [k, Number(v)])));
  for (const n of ['TRON', 'ETH', 'BSC', 'BTC', 'SOL']) {
    const h = await redis().get(`listener:cursor:${n}`);
    if (h) socket.emit('chain:block', { network: n, height: Number(h) });
  }
}

function getEmitter() {
  if (!emitter) emitter = new Emitter(newRedis());
  return emitter;
}

/** Emit an event to specific rooms from any process. */
export function emitTo(rooms, event, payload) {
  try {
    getEmitter().to(rooms).emit(event, payload);
  } catch (e) {
    log.error('emit failed', { event, e: e.message });
  }
}

export const emitToUser = (userId, event, payload) => emitTo([`user:${userId}`, 'backoffice'], event, payload);
export const emitToBackoffice = (event, payload) => emitTo(['backoffice'], event, payload);
export const emitPublic = (event, payload) => emitTo(['public'], event, payload);
