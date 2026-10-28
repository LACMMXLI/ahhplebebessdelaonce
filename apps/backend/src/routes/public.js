import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { query, tx } from '../db.js';
import { imageUrl, thumbUrl } from '../storage.js';
import { HttpError, parse, wrap } from '../http.js';

const router = Router();

export async function loadSettings() {
  const { rows } = await query('SELECT clave, valor FROM ajustes');
  return Object.fromEntries(rows.map((r) => [r.clave, r.valor]));
}

router.get('/settings', wrap(async (_req, res) => {
  const s = await loadSettings();
  res.set('Cache-Control', 'no-cache'); // ETag: el navegador revalida y los cambios del dueño se ven al instante
  res.json({ ...s, pedidos_activos: s.pedidos_activos !== 'false' });
}));

router.get('/menu', wrap(async (_req, res) => {
  const [cats, dishes] = await Promise.all([
    query('SELECT id, nombre FROM categorias WHERE activa ORDER BY orden, id'),
    query(`SELECT id, categoria_id, nombre, descripcion, precio, imagen_key, agotado
           FROM platillos WHERE activo ORDER BY orden, id`),
  ]);
  const categorias = cats.rows
    .map((c) => ({
      ...c,
      platillos: dishes.rows
        .filter((d) => d.categoria_id === c.id)
        .map(({ imagen_key, categoria_id, ...d }) => ({ ...d, imagen_url: imageUrl(imagen_key), imagen_thumb_url: thumbUrl(imagen_key) })),
    }))
    .filter((c) => c.platillos.length > 0);
  res.set('Cache-Control', 'no-cache');
  res.json({ categorias });
}));

const orderSchema = z.object({
  nombre: z.string().trim().min(1, 'Escribe tu nombre').max(60),
  telefono: z.string().trim().max(25).optional().default(''),
  tipo: z.enum(['llevar', 'aqui']),
  notas: z.string().trim().max(300).optional().default(''),
  items: z.array(z.object({
    id: z.number().int().positive(),
    cantidad: z.number().int().min(1).max(20),
    nota: z.string().trim().max(120).optional().default(''),
  })).min(1, 'El carrito está vacío').max(30),
});

const orderLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false,
  message: { error: 'Demasiados pedidos seguidos. Intenta en unos minutos o llámanos.' },
});

const money = (n) => `$${Number(n).toFixed(2).replace(/\.00$/, '')}`;

export function whatsappMessage(pedido, items) {
  const lines = [
    `¡Hola! Quiero hacer un pedido (#${pedido.id})`,
    `Nombre: ${pedido.cliente_nombre}`,
    `Tipo: ${pedido.tipo === 'llevar' ? 'Para llevar' : 'Para comer aquí'}`,
    '',
    ...items.map((i) => `• ${i.cantidad} x ${i.nombre} — ${money(i.precio_unitario * i.cantidad)}${i.nota ? ` (${i.nota})` : ''}`),
    '',
    `Total: ${money(pedido.total)}`,
  ];
  if (pedido.notas) lines.push(`Notas: ${pedido.notas}`);
  return lines.join('\n');
}

router.post('/orders', orderLimiter, wrap(async (req, res) => {
  const body = parse(orderSchema, req.body);
  const settings = await loadSettings();
  if (settings.pedidos_activos === 'false') {
    throw new HttpError(409, 'Por el momento no estamos recibiendo pedidos en línea.');
  }

  // Los precios se leen SIEMPRE de la base de datos; el cliente solo manda ids y cantidades.
  const ids = [...new Set(body.items.map((i) => i.id))];
  const { rows } = await query(
    'SELECT id, nombre, precio FROM platillos WHERE id = ANY($1) AND activo AND NOT agotado', [ids]
  );
  const byId = new Map(rows.map((r) => [r.id, r]));
  const faltantes = ids.filter((id) => !byId.has(id));
  if (faltantes.length) {
    throw new HttpError(409, 'Algunos platillos ya no están disponibles. Actualiza el menú e inténtalo de nuevo.');
  }

  const items = body.items.map((i) => ({
    platillo_id: i.id,
    nombre: byId.get(i.id).nombre,
    precio_unitario: byId.get(i.id).precio,
    cantidad: i.cantidad,
    nota: i.nota,
  }));
  const total = Math.round(items.reduce((s, i) => s + i.precio_unitario * i.cantidad, 0) * 100) / 100;

  const pedido = await tx(async (db) => {
    const p = (await db.query(
      `INSERT INTO pedidos (cliente_nombre, cliente_telefono, tipo, notas, total)
       VALUES ($1,$2,$3,$4,$5) RETURNING id, cliente_nombre, tipo, notas, total`,
      [body.nombre, body.telefono, body.tipo, body.notas, total]
    )).rows[0];
    for (const i of items) {
      await db.query(
        `INSERT INTO pedido_items (pedido_id, platillo_id, nombre, precio_unitario, cantidad, nota)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [p.id, i.platillo_id, i.nombre, i.precio_unitario, i.cantidad, i.nota]
      );
    }
    return p;
  });

  const digits = String(settings.whatsapp || '').replace(/\D/g, '');
  const text = whatsappMessage(pedido, items);
  res.status(201).json({
    folio: pedido.id,
    total,
    whatsapp_url: digits ? `https://wa.me/${digits}?text=${encodeURIComponent(text)}` : null,
  });
}));

export default router;
