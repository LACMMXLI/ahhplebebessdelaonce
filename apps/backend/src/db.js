import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { config } from './config.js';

// NUMERIC llega como string por defecto; los precios se manejan como número.
pg.types.setTypeParser(1700, (v) => (v === null ? null : Number(v)));

export const pool = new pg.Pool({ connectionString: config.databaseUrl, max: 10 });

export const query = (text, params) => pool.query(text, params);

export async function tx(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const out = await fn(client);
    await client.query('COMMIT');
    return out;
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'migrations');

/** Aplica las migraciones pendientes en orden. Un lock evita carreras entre réplicas. */
export async function migrate() {
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock(727001)');
    await client.query(
      'CREATE TABLE IF NOT EXISTS migraciones (nombre TEXT PRIMARY KEY, aplicada TIMESTAMPTZ NOT NULL DEFAULT now())'
    );
    const hechas = new Set((await client.query('SELECT nombre FROM migraciones')).rows.map((r) => r.nombre));
    const archivos = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
    for (const f of archivos) {
      if (hechas.has(f)) continue;
      await client.query('BEGIN');
      try {
        await client.query(fs.readFileSync(path.join(dir, f), 'utf8'));
        await client.query('INSERT INTO migraciones (nombre) VALUES ($1)', [f]);
        await client.query('COMMIT');
        console.log(`[db] migración aplicada: ${f}`);
      } catch (e) {
        await client.query('ROLLBACK');
        throw new Error(`Migración ${f} falló: ${e.message}`);
      }
    }
  } finally {
    await client.query('SELECT pg_advisory_unlock(727001)').catch(() => {});
    client.release();
  }
}
