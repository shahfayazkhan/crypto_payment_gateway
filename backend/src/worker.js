import { connectDb } from './lib/db.js';
import { startWorkers } from './workers/index.js';

await connectDb();
await startWorkers();
