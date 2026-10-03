import mongoose from 'mongoose';
import { config } from '../config/index.js';
import { createLogger } from './logger.js';

const log = createLogger('mongo');

export async function connectDb() {
  mongoose.set('strictQuery', true);
  await mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 10000 });
  log.info('connected', { db: mongoose.connection.name });
  return mongoose.connection;
}
