import jwt from 'jsonwebtoken';
import { config } from '../config/index.js';
import { unauthorized, forbidden } from '../lib/errors.js';

export function requireAuth(req, _res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) return next(unauthorized());
  try {
    req.user = jwt.verify(token, config.jwtSecret);
    next();
  } catch {
    next(unauthorized('Invalid or expired token'));
  }
}

export const requireRole = (...roles) => (req, _res, next) =>
  roles.includes(req.user?.role) ? next() : next(forbidden(`Requires role: ${roles.join(' | ')}`));

export const signToken = (user) =>
  jwt.sign({ sub: String(user._id), role: user.role, email: user.email, name: user.name, mt5Login: user.mt5Login }, config.jwtSecret, { expiresIn: config.jwtExpiresIn });
