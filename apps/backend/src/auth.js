import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { config } from './config.js';

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };

export function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, SCRYPT.keylen, SCRYPT);
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`;
}

export function verifyPassword(password, stored) {
  const [alg, saltB64, hashB64] = String(stored).split('$');
  if (alg !== 'scrypt' || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, 'base64');
  const actual = crypto.scryptSync(password, Buffer.from(saltB64, 'base64'), expected.length, SCRYPT);
  return crypto.timingSafeEqual(actual, expected);
}

export const signToken = (user) =>
  jwt.sign({ sub: user.id, email: user.email }, config.jwtSecret, { expiresIn: config.jwtTtl, algorithm: 'HS256' });

export function requireAuth(req, res, next) {
  const m = /^Bearer (.+)$/.exec(req.headers.authorization || '');
  if (!m) return res.status(401).json({ error: 'No autenticado' });
  try {
    const p = jwt.verify(m[1], config.jwtSecret, { algorithms: ['HS256'] });
    req.user = { id: p.sub, email: p.email };
    next();
  } catch {
    res.status(401).json({ error: 'Sesión inválida o vencida' });
  }
}
