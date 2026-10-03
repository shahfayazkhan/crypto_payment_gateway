import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { User } from '../models/index.js';
import { requireAuth, signToken } from '../middleware/auth.js';
import { unauthorized } from '../lib/errors.js';
import { audit } from '../services/audit.service.js';

const r = Router();

r.post('/login', async (req, res) => {
  const { email, password } = z.object({ email: z.string().email(), password: z.string().min(1) }).parse(req.body);
  const user = await User.findOne({ email: email.toLowerCase() }).select('+passwordHash');
  if (!user || user.status !== 'active' || !(await bcrypt.compare(password, user.passwordHash))) throw unauthorized('Invalid credentials');
  audit(user, 'auth.login', 'User', user._id, {}, req.ip);
  res.json({ token: signToken(user), user: user.toJSON() });
});

r.get('/me', requireAuth, async (req, res) => {
  res.json(await User.findById(req.user.sub));
});

/** Demo accounts for the login screen (dev only). */
r.get('/demo-accounts', async (_req, res) => {
  if (process.env.NODE_ENV === 'production') return res.json([]);
  const users = await User.find({}).sort({ role: 1, createdAt: 1 }).limit(6).lean();
  res.json(users.map((u) => ({ email: u.email, role: u.role, name: u.name, password: 'Passw0rd!' })));
});

export default r;
