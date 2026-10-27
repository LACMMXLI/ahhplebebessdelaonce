import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import multer from 'multer';
import { config } from './config.js';
import { pool } from './db.js';
import { storageEnabled } from './storage.js';
import { HttpError } from './http.js';
import publicRoutes from './routes/public.js';
import authRoutes from './routes/auth.js';
import adminRoutes from './routes/admin.js';

export function createApp() {
  const app = express();
  app.set('trust proxy', config.trustProxy); // detrás del proxy de Coolify (para el rate limit por IP)
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors({
    origin(origin, cb) {
      // Sin cabecera Origin (curl, health checks) se permite; los navegadores deben estar en la lista.
      if (!origin || config.corsOrigins.includes(origin)) return cb(null, true);
      cb(null, false);
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    maxAge: 600,
  }));
  app.use(express.json({ limit: '50kb' }));

  app.get('/api/health', async (_req, res) => {
    try {
      await pool.query('SELECT 1');
      res.json({ ok: true, db: true, storage: storageEnabled });
    } catch {
      res.status(503).json({ ok: false, db: false, storage: storageEnabled });
    }
  });

  app.use('/api', publicRoutes);
  app.use('/api/auth', authRoutes);
  app.use('/api/admin', adminRoutes);

  app.use('/api', (_req, res) => res.status(404).json({ error: 'No encontrado' }));

  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
    if (err instanceof multer.MulterError) {
      return res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'La imagen pesa más de 6 MB' : 'Archivo inválido' });
    }
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'JSON inválido' });
    if (err.status && err.status < 500) return res.status(err.status).json({ error: err.message });
    console.error('[error]', err);
    res.status(err.status || 500).json({ error: err.status === 503 ? err.message : 'Error interno' });
  });

  return app;
}
