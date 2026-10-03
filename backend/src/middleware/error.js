import { ZodError } from 'zod';
import { createLogger } from '../lib/logger.js';

const log = createLogger('http');

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, _next) {
  if (err instanceof ZodError) {
    return res.status(400).json({ error: 'Validation failed', details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) });
  }
  if (err.name === 'CastError') return res.status(400).json({ error: 'Invalid id' });
  const status = err.status || 500;
  if (status >= 500) log.error(`${req.method} ${req.originalUrl}`, { err: err.message, stack: err.stack?.split('\n')[1]?.trim() });
  res.status(status).json({ error: status >= 500 && process.env.NODE_ENV === 'production' ? 'Internal error' : err.message, details: err.details });
}
