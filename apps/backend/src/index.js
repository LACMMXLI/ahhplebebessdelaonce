import { config } from './config.js';
import { migrate, pool, query } from './db.js';
import { hashPassword } from './auth.js';
import { initStorage } from './storage.js';
import { createApp } from './app.js';

/** Crea el primer usuario administrador desde variables de entorno, solo si no existe ninguno. */
async function seedAdmin() {
  const { rows } = await query('SELECT count(*)::int AS n FROM usuarios');
  if (rows[0].n > 0) return;
  if (!config.adminEmail || !config.adminPassword) {
    console.warn('[admin] No hay usuarios. Define ADMIN_EMAIL y ADMIN_PASSWORD para crear el primero.');
    return;
  }
  if (config.adminPassword.length < 10) throw new Error('ADMIN_PASSWORD debe tener al menos 10 caracteres');
  await query('INSERT INTO usuarios (email, nombre, password_hash) VALUES ($1,$2,$3)',
    [config.adminEmail.toLowerCase(), 'Administrador', hashPassword(config.adminPassword)]);
  console.log(`[admin] usuario inicial creado: ${config.adminEmail}`);
}

// El servidor arranca aunque la base o el almacenamiento tarden: reintenta la preparación en segundo plano.
async function prepare() {
  for (let i = 1; ; i++) {
    try {
      await migrate();
      await seedAdmin();
      break;
    } catch (e) {
      console.error(`[init] intento ${i} falló: ${e.message}`);
      await new Promise((r) => setTimeout(r, Math.min(i * 2000, 15000)));
    }
  }
  await initStorage();
}

const app = createApp();
const server = app.listen(config.port, () => console.log(`[api] escuchando en :${config.port}`));
prepare();

const stop = () => server.close(() => pool.end().finally(() => process.exit(0)));
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
