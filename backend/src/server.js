import http from 'node:http';
import { config } from './config/index.js';
import { connectDb } from './lib/db.js';
import { connectRabbit } from './lib/rabbit.js';
import { redis } from './lib/redis.js';
import { attachSocketServer } from './lib/realtime.js';
import { createApp } from './app.js';
import { ensureTreasuryWallets } from './services/wallet.service.js';
import { createLogger } from './lib/logger.js';

const log = createLogger('server');

await connectDb();
await redis().ping();
await connectRabbit();
await ensureTreasuryWallets();

const server = http.createServer(createApp());
attachSocketServer(server);
server.listen(config.port, () => log.info(`API listening on :${config.port} (chain=${config.chainMode}, mt5=${config.mt5Mode})`));

if (config.runWorkersInApi) {
  const { startWorkers } = await import('./workers/index.js');
  await startWorkers();
}

const shutdown = () => { log.info('shutting down'); server.close(() => process.exit(0)); setTimeout(() => process.exit(0), 5000); };
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
