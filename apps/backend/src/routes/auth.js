import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { query } from '../db.js';
import { hashPassword, requireAuth, signToken, verifyPassword } from '../auth.js';
import { HttpError, parse, wrap } from '../http.js';

const router = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false,
  message: { error: 'Demasiados intentos. Espera unos minutos.' },
});

// Hash de relleno para que el tiempo de respuesta no delate si el correo existe.
const DUMMY = hashPassword('relleno-para-igualar-tiempos');

router.post('/login', loginLimiter, wrap(async (req, res) => {
  const { email, password } = parse(z.object({
    email: z.string().trim().toLowerCase().email(),
    password: z.string().min(1).max(200),
  }), req.body);
  const user = (await query('SELECT id, email, nombre, password_hash FROM usuarios WHERE email=$1', [email])).rows[0];
  const ok = verifyPassword(password, user ? user.password_hash : DUMMY);
  if (!user || !ok) throw new HttpError(401, 'Correo o contraseña incorrectos');
  res.json({ token: signToken(user), user: { id: user.id, email: user.email, nombre: user.nombre } });
}));

router.get('/me', requireAuth, wrap(async (req, res) => {
  const user = (await query('SELECT id, email, nombre FROM usuarios WHERE id=$1', [req.user.id])).rows[0];
  if (!user) throw new HttpError(401, 'Sesión inválida');
  res.json({ user });
}));

router.post('/password', requireAuth, loginLimiter, wrap(async (req, res) => {
  const { actual, nueva } = parse(z.object({
    actual: z.string().min(1).max(200),
    nueva: z.string().min(10, 'Mínimo 10 caracteres').max(200),
  }), req.body);
  const user = (await query('SELECT id, password_hash FROM usuarios WHERE id=$1', [req.user.id])).rows[0];
  if (!user || !verifyPassword(actual, user.password_hash)) throw new HttpError(403, 'La contraseña actual no es correcta');
  await query('UPDATE usuarios SET password_hash=$1 WHERE id=$2', [hashPassword(nueva), user.id]);
  res.json({ ok: true });
}));

export default router;
