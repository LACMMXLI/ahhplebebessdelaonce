import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { query } from '../db.js';
import { config } from '../config.js';
import { requireAuth } from '../auth.js';
import { deleteImage, imageUrl, saveImage, thumbUrl } from '../storage.js';
import { HttpError, idParam, parse, precio, wrap } from '../http.js';
import { loadSettings, presentSettings, googleReviewUrl } from './public.js';

const router = Router();
router.use(requireAuth);

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 6 * 1024 * 1024, files: 1 } });

/* ---------- Categorías ---------- */
const categoriaSchema = z.object({
  nombre: z.string().trim().min(1).max(40),
  orden: z.coerce.number().int().min(0).max(9999).default(0),
  activa: z.boolean().default(true),
});

router.get('/categorias', wrap(async (_req, res) => {
  const { rows } = await query(
    `SELECT c.*, (SELECT count(*)::int FROM platillos p WHERE p.categoria_id = c.id) AS platillos
     FROM categorias c ORDER BY orden, id`);
  res.json(rows);
}));

router.post('/categorias', wrap(async (req, res) => {
  const b = parse(categoriaSchema, req.body);
  const { rows } = await query(
    'INSERT INTO categorias (nombre, orden, activa) VALUES ($1,$2,$3) RETURNING *', [b.nombre, b.orden, b.activa]);
  res.status(201).json(rows[0]);
}));

router.put('/categorias/:id', wrap(async (req, res) => {
  const b = parse(categoriaSchema, req.body);
  const { rows } = await query(
    'UPDATE categorias SET nombre=$1, orden=$2, activa=$3 WHERE id=$4 RETURNING *',
    [b.nombre, b.orden, b.activa, idParam(req)]);
  if (!rows[0]) throw new HttpError(404, 'Categoría no encontrada');
  res.json(rows[0]);
}));

router.delete('/categorias/:id', wrap(async (req, res) => {
  const id = idParam(req);
  const n = (await query('SELECT count(*)::int AS n FROM platillos WHERE categoria_id=$1', [id])).rows[0].n;
  if (n > 0) throw new HttpError(409, 'La categoría tiene platillos. Muévelos o bórralos primero.');
  const r = await query('DELETE FROM categorias WHERE id=$1', [id]);
  if (!r.rowCount) throw new HttpError(404, 'Categoría no encontrada');
  res.status(204).end();
}));

/* ---------- Platillos ---------- */
const platilloSchema = z.object({
  categoria_id: z.coerce.number().int().positive(),
  nombre: z.string().trim().min(1).max(80),
  descripcion: z.string().trim().max(400).default(''),
  precio,
  activo: z.boolean().default(false),
  agotado: z.boolean().default(false),
  orden: z.coerce.number().int().min(0).max(9999).default(0),
}).refine((d) => !d.activo || d.precio > 0, { message: 'Para publicar el platillo ponle un precio', path: ['precio'] });

const present = ({ imagen_key, ...p }) => ({ ...p, imagen_url: imageUrl(imagen_key), imagen_thumb_url: thumbUrl(imagen_key) });

const dbError = (e) => {
  if (e.code === '23503') throw new HttpError(400, 'La categoría no existe');
  if (e.code === '23514') throw new HttpError(400, 'Para publicar el platillo ponle un precio');
  throw e;
};

router.get('/platillos', wrap(async (_req, res) => {
  const { rows } = await query('SELECT * FROM platillos ORDER BY categoria_id, orden, id');
  res.json(rows.map(present));
}));

router.post('/platillos', wrap(async (req, res) => {
  const b = parse(platilloSchema, req.body);
  try {
    const { rows } = await query(
      `INSERT INTO platillos (categoria_id, nombre, descripcion, precio, activo, agotado, orden)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [b.categoria_id, b.nombre, b.descripcion, b.precio, b.activo, b.agotado, b.orden]);
    res.status(201).json(present(rows[0]));
  } catch (e) { dbError(e); }
}));

router.put('/platillos/:id', wrap(async (req, res) => {
  const b = parse(platilloSchema, req.body);
  try {
    const { rows } = await query(
      `UPDATE platillos SET categoria_id=$1, nombre=$2, descripcion=$3, precio=$4, activo=$5,
              agotado=$6, orden=$7, updated_at=now() WHERE id=$8 RETURNING *`,
      [b.categoria_id, b.nombre, b.descripcion, b.precio, b.activo, b.agotado, b.orden, idParam(req)]);
    if (!rows[0]) throw new HttpError(404, 'Platillo no encontrado');
    res.json(present(rows[0]));
  } catch (e) { dbError(e); }
}));

router.delete('/platillos/:id', wrap(async (req, res) => {
  const { rows } = await query('DELETE FROM platillos WHERE id=$1 RETURNING imagen_key', [idParam(req)]);
  if (!rows[0]) throw new HttpError(404, 'Platillo no encontrado');
  await deleteImage(rows[0].imagen_key);
  res.status(204).end();
}));

router.post('/platillos/:id/imagen', upload.single('imagen'), wrap(async (req, res) => {
  const id = idParam(req);
  if (!req.file) throw new HttpError(400, 'Falta el archivo "imagen"');
  const prev = (await query('SELECT imagen_key FROM platillos WHERE id=$1', [id])).rows[0];
  if (!prev) throw new HttpError(404, 'Platillo no encontrado');
  const key = await saveImage(req.file.buffer);
  const { rows } = await query('UPDATE platillos SET imagen_key=$1, updated_at=now() WHERE id=$2 RETURNING *', [key, id]);
  await deleteImage(prev.imagen_key);
  res.json(present(rows[0]));
}));

router.delete('/platillos/:id/imagen', wrap(async (req, res) => {
  const id = idParam(req);
  const prev = (await query('SELECT imagen_key FROM platillos WHERE id=$1', [id])).rows[0];
  if (!prev) throw new HttpError(404, 'Platillo no encontrado');
  const { rows } = await query('UPDATE platillos SET imagen_key=NULL, updated_at=now() WHERE id=$1 RETURNING *', [id]);
  await deleteImage(prev.imagen_key);
  res.json(present(rows[0]));
}));

/* ---------- Pedidos ---------- */
const ESTADOS = ['nuevo', 'preparando', 'listo', 'entregado', 'cancelado'];

router.get('/pedidos', wrap(async (req, res) => {
  const estado = req.query.estado;
  const GRUPOS = { activos: "p.estado IN ('nuevo','preparando','listo')", historial: "p.estado IN ('entregado','cancelado')" };
  if (estado && !ESTADOS.includes(estado) && !GRUPOS[estado]) throw new HttpError(400, 'Estado inválido');
  const limit = Math.min(Number(req.query.limit) || 100, 300);
  const where = GRUPOS[estado] ? `WHERE ${GRUPOS[estado]}` : estado ? 'WHERE p.estado = $2' : '';
  const params = estado && !GRUPOS[estado] ? [limit, estado] : [limit];
  const { rows } = await query(
    `SELECT p.*, COALESCE(json_agg(json_build_object(
              'nombre', i.nombre, 'cantidad', i.cantidad, 'precio_unitario', i.precio_unitario, 'nota', i.nota)
              ORDER BY i.id) FILTER (WHERE i.id IS NOT NULL), '[]') AS items
     FROM pedidos p LEFT JOIN pedido_items i ON i.pedido_id = p.id
     ${where} GROUP BY p.id ORDER BY p.created_at DESC LIMIT $1`, params);
  res.json(rows.map((p) => ({ ...p, items: p.items.map((i) => ({ ...i, precio_unitario: Number(i.precio_unitario) })) })));
}));

router.get('/pedidos/resumen', wrap(async (_req, res) => {
  // "Hoy" se calcula en la zona horaria del negocio, no en la del servidor.
  const { rows } = await query(
    `SELECT count(*) FILTER (WHERE estado='nuevo')::int AS nuevos,
            count(*) FILTER (WHERE estado='preparando')::int AS preparando,
            count(*) FILTER (WHERE estado='listo')::int AS listos,
            count(*) FILTER (WHERE estado IN ('nuevo','preparando','listo'))::int AS activos,
            count(*) FILTER (WHERE (created_at AT TIME ZONE $1)::date = (now() AT TIME ZONE $1)::date
                               AND estado <> 'cancelado')::int AS hoy,
            COALESCE(sum(total) FILTER (WHERE (created_at AT TIME ZONE $1)::date = (now() AT TIME ZONE $1)::date
                               AND estado <> 'cancelado'), 0) AS ventas_hoy
     FROM pedidos`, [config.timezone]);
  res.json(rows[0]);
}));

router.patch('/pedidos/:id/estado', wrap(async (req, res) => {
  const { estado } = parse(z.object({ estado: z.enum(ESTADOS) }), req.body);
  const { rows } = await query('UPDATE pedidos SET estado=$1, updated_at=now() WHERE id=$2 RETURNING *', [estado, idParam(req)]);
  if (!rows[0]) throw new HttpError(404, 'Pedido no encontrado');
  res.json(rows[0]);
}));

/* ---------- Ajustes del negocio ---------- */
const url = z.string().trim().max(500).refine((v) => v === '' || /^https?:\/\//i.test(v), 'Debe empezar con https://');
const ajustesSchema = z.object({
  nombre: z.string().trim().min(1).max(80),
  slogan: z.string().trim().max(200),
  telefono: z.string().trim().max(25),
  whatsapp: z.string().trim().max(20).refine((v) => v === '' || /^\d{10,15}$/.test(v), 'Solo dígitos con lada, ej. 526862029161'),
  direccion: z.string().trim().max(250),
  maps: url, facebook: url, tiktok: url, instagram: url, youtube: url,
  horario: z.string().trim().max(300),
  pedidos_activos: z.boolean(),
  google_place_id: z.string().trim().max(120).refine((v) => v === '' || /^[A-Za-z0-9_-]{10,120}$/.test(v), 'El ID de lugar de Google no parece válido (solo letras, números, guion y guion bajo)'),
}).partial();

router.get('/ajustes', wrap(async (_req, res) => {
  res.json(presentSettings(await loadSettings()));
}));

router.put('/ajustes', wrap(async (req, res) => {
  const b = parse(ajustesSchema, req.body);
  for (const [clave, valor] of Object.entries(b)) {
    await query(
      'INSERT INTO ajustes (clave, valor) VALUES ($1,$2) ON CONFLICT (clave) DO UPDATE SET valor = EXCLUDED.valor',
      [clave, String(valor)]);
  }
  res.json(presentSettings(await loadSettings()));
}));

/* ---------- Reseñas ---------- */
router.get('/resenas/resumen', wrap(async (_req, res) => {
  const tz = config.timezone;
  const [tot, dist, trend, settings] = await Promise.all([
    query(`SELECT count(*)::int AS total,
                  COALESCE(round(avg(calificacion)::numeric, 2), 0) AS promedio,
                  count(*) FILTER (WHERE destino='google')::int AS google,
                  count(*) FILTER (WHERE destino='interno')::int AS internas,
                  count(*) FILTER (WHERE destino='interno' AND estado='nuevo')::int AS pendientes,
                  count(*) FILTER (WHERE created_at > now() - interval '30 days')::int AS ultimos30
           FROM resenas`),
    query('SELECT calificacion, count(*)::int AS n FROM resenas GROUP BY calificacion'),
    query(`SELECT to_char(d, 'YYYY-MM-DD') AS dia,
                  count(r.id)::int AS total,
                  count(r.id) FILTER (WHERE r.destino='interno')::int AS internas
           FROM generate_series((now() AT TIME ZONE $1)::date - 13, (now() AT TIME ZONE $1)::date, interval '1 day') d
           LEFT JOIN resenas r ON (r.created_at AT TIME ZONE $1)::date = d::date
           GROUP BY d ORDER BY d`, [tz]),
    loadSettings(),
  ]);
  const distribucion = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const r of dist.rows) distribucion[r.calificacion] = r.n;
  res.json({
    ...tot.rows[0],
    distribucion,
    tendencia: trend.rows,
    google_configurado: Boolean(settings.google_place_id),
    enlace_google: settings.google_place_id ? googleReviewUrl(settings.google_place_id) : null,
  });
}));

router.get('/resenas', wrap(async (req, res) => {
  const tipo = req.query.tipo || 'pendientes';
  const filtros = {
    pendientes: "r.destino = 'interno' AND r.estado = 'nuevo'",
    internas: "r.destino = 'interno'",
    google: "r.destino = 'google'",
    todas: 'true',
  };
  if (!filtros[tipo]) throw new HttpError(400, 'Tipo inválido');
  const limit = Math.min(Number(req.query.limit) || 100, 300);
  const { rows } = await query(
    `SELECT r.*, p.cliente_nombre AS pedido_cliente
     FROM resenas r LEFT JOIN pedidos p ON p.id = r.pedido_id
     WHERE ${filtros[tipo]} ORDER BY r.created_at DESC LIMIT $1`, [limit]);
  res.json(rows);
}));

router.patch('/resenas/:id/estado', wrap(async (req, res) => {
  const { estado } = parse(z.object({ estado: z.enum(['nuevo', 'atendida']) }), req.body);
  const { rows } = await query("UPDATE resenas SET estado=$1 WHERE id=$2 AND destino='interno' RETURNING *", [estado, idParam(req)]);
  if (!rows[0]) throw new HttpError(404, 'Reseña no encontrada');
  res.json(rows[0]);
}));

router.delete('/resenas/:id', wrap(async (req, res) => {
  const r = await query('DELETE FROM resenas WHERE id=$1', [idParam(req)]);
  if (!r.rowCount) throw new HttpError(404, 'Reseña no encontrada');
  res.status(204).end();
}));

export default router;
