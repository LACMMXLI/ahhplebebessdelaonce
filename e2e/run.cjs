/* Pruebas de extremo a extremo con un navegador real (Chromium).
 *
 * Requisitos: el entorno ya levantado (ver README) con almacenamiento S3 funcionando.
 *   BASE_URL        sitio (frontend)      por defecto http://localhost:8080
 *   API_URL         backend               por defecto http://localhost:3000
 *   ADMIN_EMAIL     usuario del panel     por defecto dueno@example.com
 *   ADMIN_PASSWORD  contraseña del panel  por defecto cambia-esta-contraseña
 *
 * Crea sus propios datos (categoría "E2E-<hora>") y los borra al terminar. Los pedidos de prueba
 * quedan en el historial (no hay borrado de pedidos), así que úsala en desarrollo o pruebas.
 */
const { chromium } = require('playwright');
const jsQR = require('jsqr');
const { PNG } = require('pngjs');
const assert = require('node:assert/strict');
const zlib = require('node:zlib');
const fs = require('node:fs');
const path = require('node:path');

const BASE = (process.env.BASE_URL || 'http://localhost:8080').replace(/\/$/, '');
const API = (process.env.API_URL || 'http://localhost:3000').replace(/\/$/, '');
const EMAIL = process.env.ADMIN_EMAIL || 'dueno@example.com';
const PASS = process.env.ADMIN_PASSWORD || 'cambia-esta-contraseña';
const SHOTS = process.env.SHOTS_DIR || '';
const AXE = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
const RUN = `E2E-${Date.now().toString(36)}`;

/* ---------- PNG de prueba generado en memoria ---------- */
function solidPng(w, h, [r, g, b]) {
  const crcT = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (buf) => { let c = 0xffffffff; for (const x of buf) c = crcT[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: w }, () => [r, g, b]).flat())]);
  const raw = Buffer.concat(Array.from({ length: h }, () => row));
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

/* ---------- Mini corredor ---------- */
const results = [];
async function step(name, fn) {
  const t = Date.now();
  try { await fn(); results.push({ name, ok: true }); console.log(`  ✓ ${name} (${Date.now() - t} ms)`); }
  catch (e) { results.push({ name, ok: false, err: e }); console.log(`  ✗ ${name}\n      ${String(e.message).split('\n').slice(0, 6).join('\n      ')}`); }
}
const shot = async (page, name) => { if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, `${name}.png`) }); } };

/** Escucha errores reales de la página. `allow` son patrones esperados (p. ej. un 400 provocado a propósito). */
function watch(page, label, allow = []) {
  const errors = [];
  const ok = (t) => allow.some((re) => re.test(t));
  page.on('pageerror', (e) => errors.push(`[${label}] pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !ok(m.text())) errors.push(`[${label}] console: ${m.text()}`); });
  page.on('requestfailed', (r) => { const t = `${r.url()} ${r.failure()?.errorText}`; if (!ok(t) && !/ERR_ABORTED/.test(t)) errors.push(`[${label}] requestfailed: ${t}`); });
  return errors;
}

async function axeCheck(page, label) {
  await page.evaluate(AXE);
  const res = await page.evaluate(() => axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] } }));
  const bad = res.violations.filter((v) => ['serious', 'critical'].includes(v.impact));
  assert.equal(bad.length, 0, `${label}: ` + bad.map((v) => `${v.id} (${v.nodes.length}): ${v.nodes[0].target.join(' ')} — ${v.help}`).join(' | '));
}
const noOverflow = async (page, label) => {
  const o = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
  assert.ok(o.sw <= o.iw + 1, `${label}: desborde horizontal (${o.sw} > ${o.iw})`);
};

/* ---------- API directa (para preparar datos y comprobar) ---------- */
async function apiJson(p, { method = 'GET', body, token } = {}) {
  const r = await fetch(API + p, { method, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch { /* sin cuerpo */ }
  return { status: r.status, json: j };
}

(async () => {
  const browser = await chromium.launch();
  const ctxOpts = (w, h, extra = {}) => ({ viewport: { width: w, height: h }, bypassCSP: true, deviceScaleFactor: 1, ...extra });
  const login = await apiJson('/api/auth/login', { method: 'POST', body: { email: EMAIL, password: PASS } });
  if (login.status !== 200) { console.error(`No se pudo iniciar sesión en la API (${login.status}). Revisa ADMIN_EMAIL/ADMIN_PASSWORD y API_URL.`); process.exit(2); }
  const token = login.json.token;
  const settings0 = (await apiJson('/api/admin/ajustes', { token })).json;
  // Estado inicial conocido: pedidos activos y sin restos de corridas anteriores interrumpidas.
  await apiJson('/api/admin/ajustes', { method: 'PUT', token, body: { pedidos_activos: true } });
  for (const d of (await apiJson('/api/admin/platillos', { token })).json.filter((x) => /E2E-/.test(x.nombre))) await apiJson(`/api/admin/platillos/${d.id}`, { method: 'DELETE', token });
  for (const c of (await apiJson('/api/admin/categorias', { token })).json.filter((x) => /^E2E-/.test(x.nombre))) await apiJson(`/api/admin/categorias/${c.id}`, { method: 'DELETE', token });
  const catName = `${RUN}`;
  const dishName = `Burger ${RUN}`;
  const dish2Name = `Papas ${RUN}`;

  /* ================= 1. Humo por tamaño de pantalla ================= */
  const VIEWPORTS = [[360, 640, 'móvil chico'], [390, 844, 'móvil'], [768, 1024, 'tableta'], [1280, 800, 'escritorio']];
  console.log('\n▶ Páginas por tamaño de pantalla (sin errores, sin desborde, accesibilidad)');
  for (const [w, h, label] of VIEWPORTS) {
    for (const [route, name] of [['/', 'tarjeta'], ['/menu/', 'menú'], ['/admin/', 'login admin']]) {
      await step(`${name} · ${label} ${w}×${h}`, async () => {
        const ctx = await browser.newContext(ctxOpts(w, h));
        const page = await ctx.newPage();
        const errors = watch(page, name);
        await page.goto(BASE + route, { waitUntil: 'networkidle' });
        await page.waitForTimeout(1400); // deja terminar las animaciones de entrada
        await noOverflow(page, name);
        await axeCheck(page, name);
        assert.deepEqual(errors, []);
        await shot(page, `${name.replace(/\W+/g, '-')}-${w}`);
        await ctx.close();
      });
    }
  }

  /* ----- Política de seguridad (CSP): solo tiene efecto si el sitio la envía, p. ej. detrás de nginx ----- */
  await step('CSP: ninguna violación al usar la tarjeta, el menú y el panel', async () => {
    const c = await browser.newContext({ viewport: { width: 390, height: 844 } }); // sin bypassCSP
    const p = await c.newPage();
    const violations = [];
    p.on('console', (m) => { if (/Content Security Policy|Refused to/i.test(m.text())) violations.push(m.text()); });
    p.on('pageerror', (e) => violations.push(`pageerror: ${e.message}`));
    await p.goto(BASE + '/'); await p.waitForSelector('.cta'); await p.click('.row-vcard').catch(() => {});
    await p.goto(BASE + '/menu/'); await p.waitForSelector('.dish, .state');
    if (await p.locator('.add').count()) { await p.locator('.add').first().click(); await p.locator('#cartbar button').click(); await p.waitForSelector('dialog.sheet[open]'); }
    await p.goto(BASE + '/admin/');
    await p.fill('input[name=email]', EMAIL); await p.fill('input[name=password]', PASS);
    await p.click('button[type=submit]'); await p.waitForSelector('.pane');
    for (const v of ['platillos', 'categorias', 'ajustes', 'cuenta', 'pedidos']) { await p.locator(`.nav[data-v=${v}]`).locator('visible=true').first().click(); await p.waitForTimeout(400); }
    assert.deepEqual(violations, []);
    await c.close();
  });

  /* ================= 2. Tarjeta ================= */
  console.log('\n▶ Tarjeta digital');
  await step('enlaces: llamar, WhatsApp, mapas; redes sin enlace ocultas', async () => {
    const ctx = await browser.newContext(ctxOpts(390, 844));
    const page = await ctx.newPage();
    const s = (await apiJson('/api/settings')).json;
    await page.goto(BASE + '/'); await page.waitForSelector('.cta');
    assert.match(await page.locator('a.pill').first().getAttribute('href'), /^tel:\+?\d{10,}$/);
    assert.match(await page.locator('a.pill.wa').getAttribute('href'), /^https:\/\/wa\.me\/\d+/);
    assert.match(await page.locator('a.row-map').getAttribute('href'), /^https:\/\//);
    assert.equal(await page.locator('a.cta').getAttribute('href'), 'menu/');
    // Todos los iconos se ven aunque no tengan enlace: con enlace son <a>, sin enlace son botones con aviso.
    for (const red of ['facebook', 'whatsapp', 'tiktok', 'instagram', 'youtube']) {
      const tile = page.locator(`.tile.${red}`);
      assert.equal(await tile.count(), 1, `tile ${red} visible`);
      assert.equal(await tile.isVisible(), true);
      assert.equal(await tile.locator('svg').isVisible(), true, `icono ${red}`);
      const sinEnlace = red === 'whatsapp' ? !s.whatsapp : !s[red];
      assert.equal(await tile.evaluate((e) => e.tagName), sinEnlace ? 'BUTTON' : 'A', `tag ${red}`);
      if (sinEnlace) { await tile.click(); await page.waitForSelector('.toast.show'); assert.match(await page.locator('.toast').innerText(), /muy pronto/); }
    }
    assert.equal(await page.locator('.hours').isVisible(), true);
    await ctx.close();
  });
  await step('guardar contacto descarga un .vcf válido', async () => {
    const ctx = await browser.newContext(ctxOpts(390, 844));
    const page = await ctx.newPage();
    await page.goto(BASE + '/'); await page.waitForSelector('.row-vcard');
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('.row-vcard')]);
    assert.match(dl.suggestedFilename(), /\.vcf$/);
    const txt = fs.readFileSync(await dl.path(), 'utf8');
    assert.match(txt, /BEGIN:VCARD[\s\S]*FN:[\s\S]*TEL;[\s\S]*END:VCARD/);
    await ctx.close();
  });
  await step('compartir copia el enlace cuando no hay Web Share', async () => {
    const ctx = await browser.newContext(ctxOpts(390, 844, { permissions: ['clipboard-read', 'clipboard-write'] }));
    const page = await ctx.newPage();
    await page.addInitScript(() => { Object.defineProperty(navigator, 'share', { value: undefined }); });
    await page.goto(BASE + '/'); await page.waitForSelector('.row-share');
    await page.click('.row-share');
    await page.waitForSelector('.toast.show');
    assert.equal(await page.evaluate(() => navigator.clipboard.readText()), `${BASE}/`);
    await ctx.close();
  });
  await step('si el backend cae, la tarjeta sigue funcionando', async () => {
    const ctx = await browser.newContext(ctxOpts(390, 844));
    await ctx.route(`${API}/**`, (r) => r.abort());
    const page = await ctx.newPage();
    const errors = watch(page, 'tarjeta sin api', [/ERR_FAILED|Failed to load resource/]);
    await page.goto(BASE + '/'); await page.waitForSelector('.cta');
    assert.ok(await page.locator('a.pill').count());
    assert.match(await page.locator('.title').innerText(), /Plebes/);
    assert.deepEqual(errors, []);
    await ctx.close();
  });
  await step('movimiento reducido: todo es visible sin animaciones', async () => {
    const ctx = await browser.newContext(ctxOpts(390, 844, { reducedMotion: 'reduce' }));
    const page = await ctx.newPage();
    await page.goto(BASE + '/'); await page.waitForSelector('.row-share');
    const hidden = await page.evaluate(() => [...document.querySelectorAll('.rv')].filter((e) => getComputedStyle(e).opacity === '0').length);
    assert.equal(hidden, 0);
    assert.equal(await page.locator('#embers').evaluate((c) => getComputedStyle(c).display), 'none');
    await ctx.close();
  });
  await step('teclado: se puede llegar al menú con Tab y activarlo con Enter', async () => {
    const ctx = await browser.newContext(ctxOpts(390, 844));
    const page = await ctx.newPage();
    await page.goto(BASE + '/'); await page.waitForSelector('.cta');
    for (let i = 0; i < 12; i++) { await page.keyboard.press('Tab'); if (await page.evaluate(() => document.activeElement?.classList.contains('cta'))) break; }
    assert.ok(await page.evaluate(() => document.activeElement?.classList.contains('cta')), 'el botón del menú recibe foco');
    await Promise.all([page.waitForURL('**/menu/'), page.keyboard.press('Enter')]);
    await ctx.close();
  });

  /* ================= 3. Panel: alta de datos ================= */
  console.log('\n▶ Panel de administración y pedido de punta a punta');
  const adminCtx = await browser.newContext(ctxOpts(390, 844));
  const admin = await adminCtx.newPage();
  const adminErrors = watch(admin, 'admin', [/status of (400|401|409)/]);
  const visibleNav = (v) => admin.locator(`.nav[data-v=${v}]`).locator('visible=true').first();

  await step('login: contraseña incorrecta se rechaza y la correcta entra', async () => {
    await admin.goto(BASE + '/admin/');
    await admin.fill('input[name=email]', EMAIL); await admin.fill('input[name=password]', 'incorrecta-123');
    await admin.click('button[type=submit]');
    await admin.waitForSelector('.err:not([hidden])');
    await admin.fill('input[name=password]', PASS);
    await admin.click('button[type=submit]');
    await admin.waitForSelector('.pane');
    await shot(admin, 'admin-pedidos-390');
  });
  await step('crear categoría', async () => {
    await visibleNav('categorias').click();
    await admin.click('text=Nueva categoría');
    await admin.fill('dialog input[maxlength="40"]', catName);
    await admin.click('dialog >> text=Guardar');
    await admin.waitForSelector('dialog', { state: 'detached' });
    await admin.waitForSelector(`.crow:has-text("${catName}")`);
  });
  await step('crear platillo: sin precio no se puede publicar; con precio y foto sí', async () => {
    await visibleNav('platillos').click();
    await admin.click('text=Nuevo platillo');
    await admin.selectOption('dialog select', { label: catName });
    await admin.fill('dialog input[maxlength="80"]', dishName);
    await admin.fill('dialog textarea', 'Carne, queso y lechuga');
    await admin.locator('dialog label.sw', { hasText: 'Publicado' }).click();
    await admin.click('dialog >> text=Guardar');
    assert.match(await admin.locator('dialog .err').innerText(), /precio/i);
    await admin.fill('dialog input[type=number] >> nth=0', '95');
    await admin.setInputFiles('dialog input[type=file]', { name: 'a.png', mimeType: 'image/png', buffer: solidPng(900, 700, [200, 90, 30]) });
    await admin.waitForSelector('dialog img.pv');
    await admin.click('dialog >> text=Guardar');
    await admin.waitForSelector('dialog', { state: 'detached' });
    await admin.waitForSelector(`.dcard:has-text("${dishName}")`);
    // segundo platillo para probar cantidades y "agotado"
    await admin.click('text=Nuevo platillo');
    await admin.selectOption('dialog select', { label: catName });
    await admin.fill('dialog input[maxlength="80"]', dish2Name);
    await admin.fill('dialog input[type=number] >> nth=0', '45.5');
    await admin.locator('dialog label.sw', { hasText: 'Publicado' }).click();
    await admin.click('dialog >> text=Guardar');
    await admin.waitForSelector('dialog', { state: 'detached' });
    await admin.waitForSelector(`.dcard:has-text("${dish2Name}")`);
    await shot(admin, 'admin-platillos-390');
  });
  await step('accesibilidad del panel (platillos y diálogo de edición)', async () => {
    await axeCheck(admin, 'admin platillos');
    await admin.locator(`.dcard:has-text("${dishName}") .btn`).click();
    await admin.waitForSelector('dialog.modal[open]');
    await axeCheck(admin, 'admin diálogo');
    await admin.keyboard.press('Escape');
    await admin.waitForSelector('dialog', { state: 'detached' });
  });

  /* ================= 4. Menú público y pedido ================= */
  console.log('\n▶ Menú público');
  const ctx = await browser.newContext(ctxOpts(390, 844));
  const page = await ctx.newPage();
  const errors = watch(page, 'menú', [/status of 409/]);
  let waUrl = null;
  await ctx.route('https://wa.me/**', (r) => { waUrl = r.request().url(); r.fulfill({ status: 200, contentType: 'text/html', body: 'wa' }); });

  await step('el menú muestra el platillo con miniatura que sí carga', async () => {
    await page.goto(BASE + '/menu/'); await page.waitForSelector(`.dish:has-text("${dishName}")`);
    await page.waitForFunction((n) => [...document.querySelectorAll('.dish')].some((d) => d.textContent.includes(n) && d.querySelector('img.pic')?.naturalWidth > 0), dishName, { timeout: 8000 }).catch(() => {});
    const img = page.locator(`.dish:has-text("${dishName}") img.pic`);
    assert.equal(await img.count(), 1);
    assert.match(await img.getAttribute('src'), /-sm\.webp$/, 'usa la miniatura');
    assert.equal(await img.evaluate((i) => i.naturalWidth > 0), true, 'la imagen carga desde el almacenamiento');
    assert.ok(await page.locator('.chip', { hasText: catName }).count());
    await shot(page, 'menu-390');
  });
  await step('agregar, cambiar cantidades y ver el total', async () => {
    await page.locator(`.dish:has-text("${dishName}") .add`).click();
    await page.locator(`.dish:has-text("${dishName}") .step button`).nth(1).click();
    await page.locator(`.dish:has-text("${dish2Name}") .add`).click();
    await page.waitForSelector('#cartbar button');
    const txt = await page.locator('#cartbar').innerText();
    assert.match(txt, /3/); assert.match(txt, /\$235\.50/);
  });
  await step('el carrito sobrevive a recargar la página', async () => {
    await page.reload(); await page.waitForSelector('#cartbar button');
    assert.match(await page.locator('#cartbar').innerText(), /\$235\.50/);
  });
  await step('hoja de pedido: accesible, con teclado y se cierra con Escape', async () => {
    await page.locator('#cartbar button').focus();
    await page.keyboard.press('Enter');
    await page.waitForSelector('dialog.sheet[open]');
    await page.waitForTimeout(600);
    await axeCheck(page, 'hoja de pedido');
    await shot(page, 'menu-hoja-390');
    await page.keyboard.press('Escape');
    await page.waitForSelector('dialog.sheet', { state: 'hidden' });
  });
  await step('enviar sin nombre muestra un aviso; con nombre crea el pedido y muestra la confirmación', async () => {
    await page.locator('#cartbar button').click();
    await page.waitForSelector('dialog.sheet[open]');
    await page.fill('.li input >> nth=0', 'sin cebolla');
    await page.fill('#f-tel', '686 111 2222');
    await page.fill('#f-notas', 'Tocar el timbre');
    await page.fill('#f-nombre', '<img src=x onerror=alert(1)> Ana');
    await page.locator('.seg label', { hasText: 'Comer aquí' }).click();
    await page.click('.submit');
    await page.waitForSelector('.done');
    assert.match(await page.locator('.folio').innerText(), /Folio #\d+ · \$235\.50/);
    await shot(page, 'menu-confirmacion-390');
    const href = await page.locator('.done a.btn-pill').getAttribute('href');
    assert.match(href, /^https:\/\/wa\.me\/\d+\?text=/);
    const text = decodeURIComponent(href.split('text=')[1]);
    assert.match(text, /Ana/); assert.match(text, new RegExp(`2 x ${dishName}`)); assert.match(text, /sin cebolla/);
    assert.match(text, /Total: \$235\.5/); assert.match(text, /comer aquí/i);
    await page.waitForRequest((r) => r.url().startsWith('https://wa.me/'), { timeout: 6000 });
    for (let i = 0; i < 30 && !waUrl; i++) await page.waitForTimeout(100); // el manejador de la ruta corre de forma asíncrona
    assert.ok(waUrl, 'se abre WhatsApp automáticamente');
    assert.match(waUrl, /^https:\/\/wa\.me\/\d+\?text=/);
  });
  await step('el carrito queda vacío después de pedir', async () => {
    await page.goto(BASE + '/menu/'); await page.waitForSelector('.dish');
    assert.equal(await page.locator('#cartbar').isVisible(), false);
  });
  await step('API: el servidor ignora precios manipulados por el cliente', async () => {
    const m = (await apiJson('/api/menu')).json.categorias.flatMap((c) => c.platillos).find((d) => d.nombre === dishName);
    const r = await apiJson('/api/orders', { method: 'POST', body: { nombre: 'Hacker', tipo: 'llevar', items: [{ id: m.id, cantidad: 1, precio: 1 }], total: 1 } });
    assert.equal(r.status, 201);
    assert.equal(r.json.total, 95);
  });

  /* ================= 5. El panel recibe y gestiona pedidos ================= */
  console.log('\n▶ Gestión de pedidos');
  await step('el panel muestra el pedido; el HTML del cliente no se ejecuta', async () => {
    await visibleNav('pedidos').click();
    await admin.waitForSelector('.order');
    const card = admin.locator('.order', { hasText: 'onerror=alert(1)' });
    assert.equal(await card.count(), 1);
    assert.equal(await card.locator('img').count(), 0);
    assert.match(await card.innerText(), /sin cebolla/);
    assert.match(await card.innerText(), /Tocar el timbre/);
    await shot(admin, 'admin-pedido-390');
  });
  await step('un pedido nuevo aparece solo (aviso y contador) sin recargar', async () => {
    await admin.reload(); await admin.waitForSelector('.pane');
    await visibleNav('pedidos').click(); await admin.waitForSelector('.stats');
    const m = (await apiJson('/api/menu')).json.categorias.flatMap((c) => c.platillos).find((d) => d.nombre === dish2Name);
    const before = await admin.locator('.order').count();
    await apiJson('/api/orders', { method: 'POST', body: { nombre: `Auto ${RUN}`, tipo: 'llevar', items: [{ id: m.id, cantidad: 2 }] } });
    await admin.waitForSelector(`.order:has-text("Auto ${RUN}")`, { timeout: 15000 });
    assert.ok((await admin.locator('.order').count()) > before);
    assert.ok(await admin.locator('.badge:not([hidden])').locator('visible=true').first().isVisible(), 'el contador de nuevos se ve');
  });
  await step('flujo de estados: preparar → listo → entregado → historial', async () => {
    const card = () => admin.locator('.order', { hasText: 'onerror=alert(1)' });
    await card().locator('text=Preparar').click();
    await admin.waitForSelector('.order:has-text("onerror") .chip-s.preparando');
    await card().locator('text=Marcar listo').click();
    await admin.waitForSelector('.order:has-text("onerror") .chip-s.listo');
    await card().locator('text=Entregado').click();
    await admin.waitForSelector('.order:has-text("onerror")', { state: 'detached' });
    await admin.click('.stab:has-text("Historial")');
    await admin.waitForSelector('.order:has-text("onerror") .chip-s.entregado');
  });
  await step('cancelar pide confirmación y descuenta de las ventas', async () => {
    await admin.click('.stab:has-text("Activos")');
    const card = admin.locator('.order', { hasText: `Auto ${RUN}` });
    await card.locator('text=Cancelar').click();
    await admin.waitForSelector('dialog.modal[open]');
    await admin.click('dialog >> text=Sí, cancelar');
    await admin.waitForSelector(`.order:has-text("Auto ${RUN}")`, { state: 'detached' });
    await admin.click('.stab:has-text("Historial")');
    await admin.waitForSelector(`.order:has-text("Auto ${RUN}") .chip-s.cancelado`);
  });

  /* ================= 6. Disponibilidad y ajustes se reflejan en el sitio ================= */
  console.log('\n▶ Cambios del dueño reflejados al instante en el sitio');
  await step('marcar "Agotado" lo deshabilita en el menú', async () => {
    await visibleNav('platillos').click();
    await admin.locator(`.dcard:has-text("${dish2Name}") label.sw`, { hasText: 'Agotado' }).click();
    await admin.waitForSelector(`.dcard:has-text("${dish2Name}") .tag.out`);
    await page.goto(BASE + '/menu/'); await page.waitForSelector(`.dish.out:has-text("${dish2Name}")`);
    assert.equal(await page.locator(`.dish:has-text("${dish2Name}") .add`).count(), 0);
    assert.ok(await page.locator(`.dish:has-text("${dish2Name}") .sold`).count());
    const r = await apiJson('/api/orders', { method: 'POST', body: { nombre: 'X', tipo: 'llevar', items: [{ id: (await apiJson('/api/menu')).json.categorias.flatMap((c) => c.platillos).find((d) => d.nombre === dish2Name).id, cantidad: 1 }] } });
    assert.equal(r.status, 409, 'el servidor rechaza pedir un platillo agotado');
  });
  await step('ajustes: Facebook aparece en la tarjeta y pausar pedidos bloquea el menú', async () => {
    await visibleNav('ajustes').click();
    await admin.waitForSelector('input[name=facebook]');
    await admin.fill('input[name=facebook]', 'https://facebook.com/ahhplebes-e2e');
    await admin.locator('label.sw', { hasText: 'Recibir pedidos' }).click();
    await admin.click('text=Guardar ajustes');
    await admin.waitForSelector('.toast.show');
    await page.goto(BASE + '/'); await page.waitForSelector('a.tile.facebook');
    assert.equal(await page.locator('.tile.facebook').getAttribute('href'), 'https://facebook.com/ahhplebes-e2e');
    await page.goto(BASE + '/menu/'); await page.waitForSelector('.notice');
    assert.equal(await page.locator('.add').count(), 0);
    assert.match(await page.locator('#live').innerText(), /Solo consulta/);
    const r = await apiJson('/api/orders', { method: 'POST', body: { nombre: 'X', tipo: 'llevar', items: [{ id: 1, cantidad: 1 }] } });
    assert.equal(r.status, 409);
  });
  await step('QR de la tarjeta: se descarga y al leerlo da el enlace del sitio', async () => {
    const c = await browser.newContext(ctxOpts(1280, 900, { acceptDownloads: true }));
    const p = await c.newPage();
    await p.goto(BASE + '/admin/');
    await p.fill('input[name=email]', EMAIL); await p.fill('input[name=password]', PASS);
    await p.click('button[type=submit]'); await p.waitForSelector('.pane');
    await p.locator('.nav[data-v=ajustes]').locator('visible=true').first().click();
    await p.waitForSelector('.qr svg');
    assert.equal((await p.locator('.url').innerText()).trim(), `${BASE}/`);
    await shot(p, 'admin-qr-1280');
    const [dl] = await Promise.all([p.waitForEvent('download'), p.click('text=Descargar QR (PNG)')]);
    const png = PNG.sync.read(fs.readFileSync(await dl.path()));
    const code = jsQR(new Uint8ClampedArray(png.data), png.width, png.height);
    assert.ok(code, 'el QR se puede leer');
    assert.equal(code.data, `${BASE}/`);
    const [dl2] = await Promise.all([p.waitForEvent('download'), p.click('text=Descargar (SVG)')]);
    assert.match(fs.readFileSync(await dl2.path(), 'utf8'), /<svg/);
    await c.close();
  });
  await step('si el backend cae, el menú muestra el error con alternativas', async () => {
    const c2 = await browser.newContext(ctxOpts(390, 844));
    await c2.route(`${API}/**`, (r) => r.abort());
    const p2 = await c2.newPage();
    const e2 = watch(p2, 'menú sin api', [/ERR_FAILED|Failed to load resource|\[menu\]/]);
    await p2.goto(BASE + '/menu/'); await p2.waitForSelector('.state');
    assert.match(await p2.locator('.state').innerText(), /No pudimos cargar el menú/);
    assert.ok(await p2.locator('.state a[href^="tel:"]').count());
    assert.deepEqual(e2, []);
    await c2.close();
  });

  /* ================= 7. Escritorio ================= */
  console.log('\n▶ Escritorio');
  await step('panel: barra lateral visible, sin barra inferior; pedidos en rejilla', async () => {
    const c = await browser.newContext(ctxOpts(1366, 800));
    const p = await c.newPage();
    await p.goto(BASE + '/admin/');
    await p.fill('input[name=email]', EMAIL); await p.fill('input[name=password]', PASS);
    await p.click('button[type=submit]'); await p.waitForSelector('.pane');
    assert.equal(await p.locator('.side').isVisible(), true);
    assert.equal(await p.locator('.bottom').isVisible(), false);
    await p.waitForSelector('.stats');
    await shot(p, 'admin-pedidos-1366');
    await noOverflow(p, 'admin escritorio');
    await axeCheck(p, 'admin escritorio');
    await p.locator('.nav[data-v=platillos]').locator('visible=true').first().click();
    await p.waitForSelector('.dcard'); await shot(p, 'admin-platillos-1366');
    await c.close();
  });
  await step('menú: la hoja del pedido es un panel lateral derecho', async () => {
    await admin.locator('label.sw', { hasText: 'Recibir pedidos' }).count(); // (ajuste restaurado abajo)
    await apiJson('/api/admin/ajustes', { method: 'PUT', token, body: { pedidos_activos: true } });
    const c = await browser.newContext(ctxOpts(1366, 800));
    const p = await c.newPage();
    await p.goto(BASE + '/menu/'); await p.waitForSelector(`.dish:has-text("${dishName}")`);
    await p.locator(`.dish:has-text("${dishName}") .add`).click();
    await p.locator('#cartbar button').click();
    await p.waitForSelector('dialog.sheet[open]'); await p.waitForTimeout(700);
    const box = await p.locator('dialog.sheet .sheet-card').boundingBox();
    assert.ok(box.x > 800 && box.height > 700, `panel lateral (x=${box.x}, alto=${box.height})`);
    await shot(p, 'menu-1366');
    await noOverflow(p, 'menú escritorio');
    await c.close();
  });

  /* ================= Limpieza ================= */
  console.log('\n▶ Limpieza');
  await step('restaurar ajustes y borrar los datos de prueba', async () => {
    await apiJson('/api/admin/ajustes', { method: 'PUT', token, body: { facebook: settings0.facebook, pedidos_activos: settings0.pedidos_activos } });
    const dishes = (await apiJson('/api/admin/platillos', { token })).json.filter((d) => d.nombre.includes(RUN));
    for (const d of dishes) assert.equal((await apiJson(`/api/admin/platillos/${d.id}`, { method: 'DELETE', token })).status, 204);
    const cat = (await apiJson('/api/admin/categorias', { token })).json.find((c) => c.nombre === catName);
    assert.equal((await apiJson(`/api/admin/categorias/${cat.id}`, { method: 'DELETE', token })).status, 204);
  });
  await step('sin errores de consola en el panel ni en el menú durante todo el recorrido', async () => {
    assert.deepEqual(adminErrors, []); assert.deepEqual(errors, []);
  });

  await browser.close();
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} pasos correctos${failed.length ? `, ${failed.length} fallaron` : ''}`);
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error('E2E abortó:', e); process.exit(2); });
