import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import sharp from 'sharp';

// S3 falso: guarda lo que recibe para verificar subidas y borrados.
const s3 = { puts: [], dels: [] };
const s3Server = http.createServer((req, res) => {
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    if (req.method === 'PUT' && req.url.includes('/platillos/')) s3.puts.push({ url: req.url, size: Buffer.concat(chunks).length });
    if (req.method === 'DELETE') s3.dels.push(req.url);
    res.writeHead(200).end();
  });
});
await new Promise((r) => s3Server.listen(0, r));

Object.assign(process.env, {
  DATABASE_URL: process.env.TEST_DATABASE_URL || 'postgres://postgres@/plebes_test?host=/tmp&port=54329',
  JWT_SECRET: 'x'.repeat(40),
  CORS_ORIGINS: 'https://menu.example.com',
  ADMIN_EMAIL: 'dueno@example.com',
  ADMIN_PASSWORD: 'contraseña-larga-123',
  S3_ENDPOINT: `http://127.0.0.1:${s3Server.address().port}`,
  S3_ACCESS_KEY: 'k', S3_SECRET_KEY: 's', S3_BUCKET: 'platillos',
  S3_PUBLIC_URL: 'https://files.example.com',
});

const { pool, migrate, query } = await import('../src/db.js');
const { createApp } = await import('../src/app.js');
const { hashPassword } = await import('../src/auth.js');

let server, base, token;

const api = async (path, { method = 'GET', body, auth = false, headers = {}, raw } = {}) => {
  const h = { ...headers };
  if (auth) h.Authorization = `Bearer ${token}`;
  if (body && !raw) h['Content-Type'] = 'application/json';
  const r = await fetch(base + path, { method, headers: h, body: raw ?? (body ? JSON.stringify(body) : undefined) });
  const text = await r.text();
  let json; try { json = JSON.parse(text); } catch { json = null; }
  return { status: r.status, json, headers: r.headers };
};

before(async () => {
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await migrate();
  await query('INSERT INTO usuarios (email, nombre, password_hash) VALUES ($1,$2,$3)',
    [process.env.ADMIN_EMAIL, 'Dueño', hashPassword(process.env.ADMIN_PASSWORD)]);
  server = createApp().listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  server.close();
  s3Server.close();
  await pool.end();
});

test('health responde con db y storage', async () => {
  const r = await api('/api/health');
  assert.equal(r.status, 200);
  assert.deepEqual(r.json, { ok: true, db: true, storage: true });
});

test('seed: menú público vacío (los ejemplos están ocultos y sin precio)', async () => {
  const r = await api('/api/menu');
  assert.equal(r.status, 200);
  assert.deepEqual(r.json.categorias, []);
  const adm = await api('/api/settings');
  assert.equal(adm.json.telefono, '686 202 9161');
  assert.equal(adm.json.whatsapp, '526862029161');
  assert.equal(adm.json.facebook, '');
});

test('rutas admin exigen token', async () => {
  for (const p of ['/api/admin/platillos', '/api/admin/pedidos', '/api/admin/ajustes', '/api/auth/me']) {
    assert.equal((await api(p)).status, 401, p);
  }
  assert.equal((await api('/api/admin/platillos', { headers: { Authorization: 'Bearer basura' } })).status, 401);
});

test('login: credenciales incorrectas y correctas', async () => {
  const mal = await api('/api/auth/login', { method: 'POST', body: { email: 'dueno@example.com', password: 'nope' } });
  assert.equal(mal.status, 401);
  const noUser = await api('/api/auth/login', { method: 'POST', body: { email: 'otro@example.com', password: 'nope' } });
  assert.equal(noUser.status, 401);
  assert.equal(noUser.json.error, mal.json.error);
  const ok = await api('/api/auth/login', { method: 'POST', body: { email: 'DUENO@example.com', password: process.env.ADMIN_PASSWORD } });
  assert.equal(ok.status, 200);
  token = ok.json.token;
  assert.equal((await api('/api/auth/me', { auth: true })).json.user.email, 'dueno@example.com');
});

let burger, snacks;
test('platillos: no se puede publicar sin precio; con precio sí', async () => {
  const cats = (await api('/api/admin/categorias', { auth: true })).json;
  burger = cats.find((c) => c.nombre === 'Burgers');
  snacks = cats.find((c) => c.nombre === 'Snacks');
  const base = { categoria_id: burger.id, nombre: 'Clásica', descripcion: 'Con queso', orden: 1 };

  const sinPrecio = await api('/api/admin/platillos', { method: 'POST', auth: true, body: { ...base, precio: 0, activo: true } });
  assert.equal(sinPrecio.status, 400);
  assert.match(sinPrecio.json.error, /precio/i);

  const ok = await api('/api/admin/platillos', { method: 'POST', auth: true, body: { ...base, precio: '89.5', activo: true } });
  assert.equal(ok.status, 201);
  assert.equal(ok.json.precio, 89.5);
  burger.platillo = ok.json;

  const raro = await api('/api/admin/platillos', { method: 'POST', auth: true, body: { ...base, categoria_id: 99999, precio: 10 } });
  assert.equal(raro.status, 400);
  const neg = await api('/api/admin/platillos', { method: 'POST', auth: true, body: { ...base, precio: -5 } });
  assert.equal(neg.status, 400);

  const menu = (await api('/api/menu')).json.categorias;
  assert.equal(menu.length, 1);
  assert.equal(menu[0].nombre, 'Burgers');
  assert.equal(menu[0].platillos[0].nombre, 'Clásica');
  assert.equal(menu[0].platillos[0].imagen_url, null);
});

test('imagen: sube, se reencoda a webp, y se borra al reemplazar', async () => {
  const png = await sharp({ create: { width: 2400, height: 1600, channels: 3, background: '#c33' } }).png().toBuffer();
  const form = new FormData();
  form.append('imagen', new Blob([png], { type: 'image/png' }), 'x.png');
  const r = await fetch(`${base}/api/admin/platillos/${burger.platillo.id}/imagen`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form });
  const j = await r.json();
  assert.equal(r.status, 200);
  assert.match(j.imagen_url, /^https:\/\/files\.example\.com\/platillos\/platillos\/[0-9a-f-]+\.webp$/);
  assert.match(j.imagen_thumb_url, /-sm\.webp$/);
  assert.equal(s3.puts.length, 2, 'imagen grande + miniatura');
  assert.ok(s3.puts[0].size < png.length);
  assert.ok(s3.puts[1].size < s3.puts[0].size, 'la miniatura pesa menos');
  const menuImg = (await api('/api/menu')).json.categorias[0].platillos[0];
  assert.equal(menuImg.imagen_thumb_url, j.imagen_thumb_url);

  const form2 = new FormData();
  form2.append('imagen', new Blob([Buffer.from('esto no es una imagen')], { type: 'image/png' }), 'x.png');
  const bad = await fetch(`${base}/api/admin/platillos/${burger.platillo.id}/imagen`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form2 });
  assert.equal(bad.status, 400);

  const form3 = new FormData();
  form3.append('imagen', new Blob([png], { type: 'image/png' }), 'y.png');
  await fetch(`${base}/api/admin/platillos/${burger.platillo.id}/imagen`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form3 });
  assert.equal(s3.puts.length, 4);
  assert.equal(s3.dels.length, 2, 'la imagen anterior y su miniatura se borran');

  const del = await api(`/api/admin/platillos/${burger.platillo.id}/imagen`, { method: 'DELETE', auth: true });
  assert.equal(del.json.imagen_url, null);
  assert.equal(del.json.imagen_thumb_url, null);
  assert.equal(s3.dels.length, 4);
});

test('pedidos: el precio sale de la BD, no del cliente', async () => {
  const p2 = (await api('/api/admin/platillos', { method: 'POST', auth: true,
    body: { categoria_id: snacks.id, nombre: 'Papas', precio: 40, activo: true } })).json;
  const pedido = {
    nombre: 'Ana', telefono: '6861112222', tipo: 'llevar', notas: 'sin cebolla',
    items: [{ id: burger.platillo.id, cantidad: 2, nota: 'sin jitomate' }, { id: p2.id, cantidad: 1 }],
    total: 1, precio: 1, // campos que el servidor debe ignorar
  };
  const r = await api('/api/orders', { method: 'POST', body: pedido });
  assert.equal(r.status, 201);
  assert.equal(r.json.total, 2 * 89.5 + 40);
  const url = new URL(r.json.whatsapp_url);
  assert.equal(url.origin + url.pathname, 'https://wa.me/526862029161');
  const text = url.searchParams.get('text');
  assert.match(text, /Ana/);
  assert.match(text, /2 x Clásica/);
  assert.match(text, /Total: \$219/);
  assert.match(text, /sin jitomate/);

  const lista = (await api('/api/admin/pedidos?estado=activos', { auth: true })).json;
  assert.equal(lista.length, 1);
  assert.equal(lista[0].items.length, 2);
  assert.equal(lista[0].estado, 'nuevo');
  const res1 = (await api('/api/admin/pedidos/resumen', { auth: true })).json;
  assert.equal(res1.nuevos, 1);
  assert.equal(res1.hoy, 1);
  assert.equal(res1.ventas_hoy, 219);

  const est = await api(`/api/admin/pedidos/${r.json.folio}/estado`, { method: 'PATCH', auth: true, body: { estado: 'preparando' } });
  assert.equal(est.json.estado, 'preparando');
  const res2 = (await api('/api/admin/pedidos/resumen', { auth: true })).json;
  assert.equal(res2.nuevos, 0);
  assert.equal(res2.preparando, 1);
  assert.equal(res2.activos, 1);
  assert.equal((await api(`/api/admin/pedidos/${r.json.folio}/estado`, { method: 'PATCH', auth: true, body: { estado: 'volando' } })).status, 400);

  // un pedido ya hecho conserva nombre y precio aunque el platillo cambie
  await api(`/api/admin/platillos/${p2.id}`, { method: 'PUT', auth: true,
    body: { categoria_id: snacks.id, nombre: 'Papas XL', precio: 99, activo: true } });
  const sigue = (await api('/api/admin/pedidos', { auth: true })).json[0];
  assert.equal(sigue.items.find((i) => i.nombre === 'Papas').precio_unitario, 40);
});

test('pedidos: validaciones y platillos no disponibles', async () => {
  const ok = { nombre: 'Luis', tipo: 'aqui', items: [{ id: burger.platillo.id, cantidad: 1 }] };
  assert.equal((await api('/api/orders', { method: 'POST', body: { ...ok, items: [] } })).status, 400);
  assert.equal((await api('/api/orders', { method: 'POST', body: { ...ok, nombre: '' } })).status, 400);
  assert.equal((await api('/api/orders', { method: 'POST', body: { ...ok, tipo: 'volando' } })).status, 400);
  assert.equal((await api('/api/orders', { method: 'POST', body: { ...ok, items: [{ id: burger.platillo.id, cantidad: 0 }] } })).status, 400);
  assert.equal((await api('/api/orders', { method: 'POST', body: { ...ok, items: [{ id: 99999, cantidad: 1 }] } })).status, 409);

  await api(`/api/admin/platillos/${burger.platillo.id}`, { method: 'PUT', auth: true,
    body: { categoria_id: burger.id, nombre: 'Clásica', precio: 89.5, activo: true, agotado: true } });
  assert.equal((await api('/api/orders', { method: 'POST', body: ok })).status, 409);
  assert.equal((await api('/api/menu')).json.categorias.find((c) => c.nombre === 'Burgers').platillos[0].agotado, true);
});

test('cancelar un pedido lo saca de las ventas de hoy', async () => {
  const lista = (await api('/api/admin/pedidos?estado=activos', { auth: true })).json;
  await api(`/api/admin/pedidos/${lista[0].id}/estado`, { method: 'PATCH', auth: true, body: { estado: 'cancelado' } });
  const hist = (await api('/api/admin/pedidos?estado=historial', { auth: true })).json;
  assert.equal(hist.length, 1);
  assert.equal(hist[0].estado, 'cancelado');
  assert.equal((await api('/api/admin/pedidos?estado=raro', { auth: true })).status, 400);
  const r = (await api('/api/admin/pedidos/resumen', { auth: true })).json;
  assert.equal(r.ventas_hoy, 0);
  assert.equal(r.hoy, 0);
  assert.equal(r.activos, 0);
});

test('ajustes: validación, persistencia y pausa de pedidos', async () => {
  assert.equal((await api('/api/admin/ajustes', { method: 'PUT', auth: true, body: { facebook: 'javascript:alert(1)' } })).status, 400);
  assert.equal((await api('/api/admin/ajustes', { method: 'PUT', auth: true, body: { whatsapp: '686-202' } })).status, 400);
  const r = await api('/api/admin/ajustes', { method: 'PUT', auth: true,
    body: { facebook: 'https://facebook.com/ahhplebes', horario: 'L-D 6pm a 12am', pedidos_activos: false } });
  assert.equal(r.status, 200);
  const pub = (await api('/api/settings')).json;
  assert.equal(pub.facebook, 'https://facebook.com/ahhplebes');
  assert.equal(pub.pedidos_activos, false);
  const blocked = await api('/api/orders', { method: 'POST', body: { nombre: 'X', tipo: 'llevar', items: [{ id: burger.platillo.id, cantidad: 1 }] } });
  assert.equal(blocked.status, 409);
  await api('/api/admin/ajustes', { method: 'PUT', auth: true, body: { pedidos_activos: true } });
});

test('categorías: no se borra una con platillos', async () => {
  assert.equal((await api(`/api/admin/categorias/${burger.id}`, { method: 'DELETE', auth: true })).status, 409);
  const nueva = await api('/api/admin/categorias', { method: 'POST', auth: true, body: { nombre: 'Sushi', orden: 5 } });
  assert.equal(nueva.status, 201);
  assert.equal((await api(`/api/admin/categorias/${nueva.json.id}`, { method: 'DELETE', auth: true })).status, 204);
});

test('cambio de contraseña', async () => {
  const mal = await api('/api/auth/password', { method: 'POST', auth: true, body: { actual: 'incorrecta', nueva: 'otra-contraseña-larga' } });
  assert.equal(mal.status, 403);
  const corta = await api('/api/auth/password', { method: 'POST', auth: true, body: { actual: process.env.ADMIN_PASSWORD, nueva: 'corta' } });
  assert.equal(corta.status, 400);
  const ok = await api('/api/auth/password', { method: 'POST', auth: true, body: { actual: process.env.ADMIN_PASSWORD, nueva: 'otra-contraseña-larga' } });
  assert.equal(ok.status, 200);
  const login = await api('/api/auth/login', { method: 'POST', body: { email: 'dueno@example.com', password: 'otra-contraseña-larga' } });
  assert.equal(login.status, 200);
});

test('CORS: solo el origen del frontend; JSON inválido y rutas inexistentes', async () => {
  const bueno = await api('/api/menu', { headers: { Origin: 'https://menu.example.com' } });
  assert.equal(bueno.headers.get('access-control-allow-origin'), 'https://menu.example.com');
  const malo = await api('/api/menu', { headers: { Origin: 'https://evil.example.com' } });
  assert.equal(malo.headers.get('access-control-allow-origin'), null);
  assert.equal((await api('/api/orders', { method: 'POST', raw: '{no json', headers: { 'Content-Type': 'application/json' } })).status, 400);
  assert.equal((await api('/api/nada')).status, 404);
});

// Va al final: agota el límite de intentos fallidos de esta IP.
test('login: los accesos correctos no agotan el límite, los fallidos sí', async () => {
  for (let i = 0; i < 12; i++) {
    const ok = await api('/api/auth/login', { method: 'POST', body: { email: 'dueno@example.com', password: 'otra-contraseña-larga' } });
    assert.equal(ok.status, 200, `intento ${i}`);
  }
  const sigue = await api('/api/auth/login', { method: 'POST', body: { email: 'dueno@example.com', password: 'otra-contraseña-larga' } });
  assert.notEqual(sigue.status, 429);
  let ultimo;
  for (let i = 0; i < 12; i++) ultimo = await api('/api/auth/login', { method: 'POST', body: { email: 'dueno@example.com', password: 'mala' } });
  assert.equal(ultimo.status, 429, 'tras 10 fallos se bloquea');
});
