import { h, api as rawApi, ApiError, money, toast } from './lib.js';
import { icon } from './icons.js';
import { ripples, closeDialog } from './fx.js';
import qrcode from './vendor/qrcode.js';

const app = document.getElementById('app');
const TOKEN_KEY = 'plebes_admin_token';
let token = null;
try { token = sessionStorage.getItem(TOKEN_KEY); } catch { /* sin almacenamiento */ }

let view = 'pedidos';
let pollTimer;
let lastNuevos = null;
let lastResenas = null;
let audioCtx;
const state = { nuevos: 0, resenas: 0, online: true, refreshOrders: null, refreshResenas: null, drawNav: null, go: null };

/* ---------- Acceso a la API con la sesión ---------- */
async function api(path, opts = {}) {
  try {
    const r = await rawApi(path, { ...opts, token });
    setOnline(true);
    return r;
  } catch (e) {
    if (e instanceof ApiError && e.status === 401 && token) logout('Tu sesión venció. Entra de nuevo.');
    if (e instanceof ApiError && e.status === 0) setOnline(false);
    throw e;
  }
}
const fail = (e) => toast(e.message || 'Algo salió mal', 'error');

function setOnline(ok) {
  state.online = ok;
  document.querySelectorAll('.netdot').forEach((n) => { n.classList.toggle('off', !ok); n.textContent = ok ? 'Conectado' : 'Sin conexión'; });
}

function logout(msg) {
  token = null; lastNuevos = null; lastResenas = null; state.nuevos = 0; state.resenas = 0;
  try { sessionStorage.removeItem(TOKEN_KEY); } catch { /* ignorar */ }
  clearInterval(pollTimer);
  document.title = 'Panel · Los Plebes de la Once';
  renderLogin(msg);
}

/* ---------- Aviso sonoro de pedido nuevo ---------- */
function beep() {
  try {
    audioCtx ??= new (window.AudioContext || window.webkitAudioContext)();
    const now = audioCtx.currentTime;
    [880, 1175].forEach((f, i) => {
      const o = audioCtx.createOscillator(); const g = audioCtx.createGain();
      o.type = 'sine'; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, now + i * 0.18);
      g.gain.exponentialRampToValueAtTime(0.18, now + i * 0.18 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.18 + 0.28);
      o.connect(g); g.connect(audioCtx.destination);
      o.start(now + i * 0.18); o.stop(now + i * 0.18 + 0.3);
    });
  } catch { /* sin audio */ }
}

/* ---------- Diálogos ---------- */
function modal(title, body, footer) {
  const dlg = h('dialog', { class: 'modal', 'aria-label': title });
  const close = () => closeDialog(dlg);
  dlg.append(h('div', { class: 'm-in' },
    h('div', { class: 'm-head' }, h('h2', {}, title), h('button', { class: 'x rp', type: 'button', onclick: close, 'aria-label': 'Cerrar' }, icon('close'))),
    h('div', { class: 'm-body' }, body),
    footer ? h('div', { class: 'm-foot' }, footer(close)) : null));
  dlg.addEventListener('close', () => dlg.remove());
  dlg.addEventListener('click', (e) => { if (e.target === dlg) close(); });
  document.body.append(dlg);
  dlg.showModal();
  return { dlg, close };
}

function ask(title, text, okLabel = 'Confirmar', danger = true) {
  return new Promise((resolve) => {
    let answered = false;
    const { dlg } = modal(title, h('p', { style: 'margin:0;line-height:1.5' }, text), (close) => [
      h('button', { class: 'btn', type: 'button', onclick: () => { answered = true; resolve(false); close(); } }, 'Cancelar'),
      h('button', { class: `btn ${danger ? 'danger' : 'primary'}`, type: 'button', onclick: () => { answered = true; resolve(true); close(); } }, okLabel),
    ]);
    dlg.addEventListener('close', () => { if (!answered) resolve(false); });
  });
}

const field = (label, input, help) => h('div', { class: 'fld' }, h('label', {}, label, input), help ? h('span', { class: 'help' }, help) : null);
const sw = (label, props, cls = '') => h('label', { class: `sw ${cls}` }, h('input', { type: 'checkbox', ...props }), label);
const errBox = () => h('p', { class: 'err', role: 'alert', hidden: true });
const showErr = (box, msg) => { box.textContent = msg; box.hidden = !msg; };

/* ---------- Acceso ---------- */
function renderLogin(msg) {
  const err = errBox(); if (msg) showErr(err, msg);
  const btn = h('button', { class: 'btn primary rp', type: 'submit' }, 'Entrar');
  app.replaceChildren(h('div', { class: 'login' },
    h('form', { onsubmit: async (e) => {
      e.preventDefault();
      btn.disabled = true; showErr(err, '');
      const fd = new FormData(e.currentTarget);
      try {
        const r = await rawApi('/api/auth/login', { method: 'POST', body: { email: fd.get('email'), password: fd.get('password') } });
        token = r.token; state.email = r.user.email;
        try { sessionStorage.setItem(TOKEN_KEY, token); } catch { /* ignorar */ }
        try { audioCtx ??= new (window.AudioContext || window.webkitAudioContext)(); } catch { /* sin audio */ } // se habilita con este gesto
        renderShell();
      } catch (ex) { showErr(err, ex.message); btn.disabled = false; }
    } },
      h('div', { class: 'lg' }, h('i'), h('img', { src: '../assets/logo.webp', alt: '' })),
      h('h1', {}, 'Panel de administración'),
      h('p', { class: 'sub' }, 'Pedidos, platillos y ajustes del negocio'),
      field('Correo', h('input', { name: 'email', type: 'email', required: true, autocomplete: 'username', inputMode: 'email' })),
      field('Contraseña', h('input', { name: 'password', type: 'password', required: true, autocomplete: 'current-password' })),
      err, btn)));
}

/* ---------- Estructura ---------- */
const TABS = [['pedidos', 'Pedidos', 'receipt'], ['platillos', 'Platillos', 'grid'], ['categorias', 'Categorías', 'tag'], ['resenas', 'Reseñas', 'star'], ['ajustes', 'Ajustes', 'sliders'], ['cuenta', 'Cuenta', 'lock']];
const views = { pedidos: viewPedidos, platillos: viewPlatillos, categorias: viewCategorias, resenas: viewResenas, ajustes: viewAjustes, cuenta: viewCuenta };

function renderShell() {
  const pane = h('main', { class: 'pane', id: 'pane', tabindex: '-1' });
  const title = h('h1', {});
  const navBtn = (k, label, ic) => h('button', { class: 'nav rp', type: 'button', dataset: { v: k }, onclick: () => go(k) },
    icon(ic), label, (k === 'pedidos' || k === 'resenas') ? h('span', { class: `badge${k === 'resenas' ? ' amber' : ''}`, hidden: true }, '0') : null);
  const side = h('aside', { class: 'side', 'aria-label': 'Navegación' },
    h('div', { class: 'brand' }, h('img', { src: '../assets/logo.webp', alt: '' }), h('div', {}, h('b', {}, 'Los Plebes'), h('small', {}, 'Panel del negocio'))),
    ...TABS.map(([k, l, i]) => navBtn(k, l, i)),
    h('div', { class: 'sp' }),
    h('a', { class: 'nav rp', href: '../menu/', target: '_blank', rel: 'noopener' }, icon('external'), 'Ver menú'),
    h('a', { class: 'nav rp', href: '../', target: '_blank', rel: 'noopener' }, icon('external'), 'Ver tarjeta'),
    h('div', { class: 'who' }, h('span', { class: 'netdot' }, 'Conectado')));
  const bottom = h('nav', { class: 'bottom', 'aria-label': 'Secciones' }, ...TABS.map(([k, l, i]) => navBtn(k, l, i)));
  const top = h('header', { class: 'topbar' },
    h('div', { class: 'brand-m' }, h('img', { src: '../assets/logo.webp', alt: '', width: 38, height: 38 })),
    title, h('span', { class: 'sp' }), h('span', { class: 'netdot' }, 'Conectado'),
    h('a', { class: 'iconbtn rp', href: '../menu/', target: '_blank', rel: 'noopener', 'aria-label': 'Ver menú público' }, icon('external')));
  app.replaceChildren(h('div', { class: 'shell' }, side, h('div', {}, top, pane)), bottom);

  state.drawNav = () => {
    document.querySelectorAll('.nav[data-v]').forEach((b) => {
      b.setAttribute('aria-current', b.dataset.v === view ? 'page' : 'false');
      const bd = b.querySelector('.badge');
      if (bd) {
        const n = b.dataset.v === 'pedidos' ? state.nuevos : state.resenas;
        bd.textContent = String(n); bd.hidden = !n;
        bd.setAttribute('aria-label', b.dataset.v === 'pedidos' ? `${n} pedidos nuevos` : `${n} comentarios por atender`);
      }
    });
    title.textContent = TABS.find(([k]) => k === view)[1];
  };
  const go = (k) => { view = k; state.refreshOrders = null; state.refreshResenas = null; state.drawNav(); load(); pane.focus({ preventScroll: true }); scrollTo(0, 0); };
  const load = () => { pane.replaceChildren(h('p', { class: 'loading' }, 'Cargando…')); views[view](pane).catch((e) => { pane.replaceChildren(h('div', { class: 'empty' }, h('p', {}, e.message), h('button', { class: 'btn', type: 'button', onclick: load }, 'Reintentar'))); }); };
  state.go = go;
  state.drawNav(); load();
  clearInterval(pollTimer);
  pollTimer = setInterval(poll, 10000);
  poll();
}

async function poll() {
  if (!token || document.hidden) return;
  try {
    const r = await api('/api/admin/pedidos/resumen');
    if (lastNuevos !== null && r.nuevos > lastNuevos) {
      beep(); toast('🔔 ¡Llegó un pedido nuevo!');
      state.refreshOrders?.();
    }
    lastNuevos = r.nuevos;
    if (state.nuevos !== r.nuevos) { state.nuevos = r.nuevos; state.drawNav?.(); }
    document.title = `${r.nuevos ? `(${r.nuevos}) ` : ''}Panel · Los Plebes de la Once`;
  } catch { /* se reintenta en el siguiente ciclo */ }
  try {
    const rv = await api('/api/admin/resenas/resumen');
    if (lastResenas !== null && rv.pendientes > lastResenas) {
      beep(); toast('⭐ Un cliente dejó retroalimentación');
      state.refreshResenas?.();
    }
    lastResenas = rv.pendientes;
    if (state.resenas !== rv.pendientes) { state.resenas = rv.pendientes; state.drawNav?.(); }
  } catch { /* se reintenta en el siguiente ciclo */ }
}

/* ---------- Pedidos ---------- */
const SIGUIENTE = { nuevo: ['preparando', 'Preparar'], preparando: ['listo', 'Marcar listo'], listo: ['entregado', 'Entregado'] };
const PRIO = { nuevo: 0, preparando: 1, listo: 2 };

function hace(iso) {
  const m = Math.floor((Date.now() - new Date(iso)) / 60000);
  if (m < 1) return 'ahora';
  if (m < 60) return `hace ${m} min`;
  const hr = Math.floor(m / 60);
  if (hr < 24) return `hace ${hr} h`;
  return new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}
setInterval(() => document.querySelectorAll('time[data-ts]').forEach((t) => { t.textContent = hace(t.dataset.ts); }), 30000);

async function viewPedidos(pane) {
  let filtro = 'activos';
  let known = null;
  const stats = h('section', { class: 'stats', 'aria-label': 'Resumen' });
  const tabs = h('div', { class: 'seg-tabs', role: 'tablist', 'aria-label': 'Filtrar pedidos' });
  const list = h('div', { class: 'orders', 'aria-live': 'polite' });

  const stat = (cls, n, label) => h('div', { class: `stat ${cls}` }, h('b', {}, n), h('span', {}, label));

  async function draw() {
    const [res, pedidos] = await Promise.all([api('/api/admin/pedidos/resumen'), api(`/api/admin/pedidos?estado=${filtro}&limit=100`)]);
    stats.replaceChildren(
      stat(`s-new${res.nuevos ? ' pulse' : ''}`, String(res.nuevos), 'Nuevos'),
      stat('s-prep', String(res.preparando), 'En preparación'),
      stat('s-ready', String(res.listos), 'Listos para entregar'),
      stat('s-sales', money(res.ventas_hoy), `Ventas de hoy · ${res.hoy} pedido${res.hoy === 1 ? '' : 's'}`));
    const T = [['activos', 'Activos', res.activos], ['nuevo', 'Nuevos', res.nuevos], ['preparando', 'Preparando', res.preparando], ['listo', 'Listos', res.listos], ['historial', 'Historial', null]];
    tabs.replaceChildren(...T.map(([k, l, n]) => h('button', { class: 'stab rp', type: 'button', role: 'tab', 'aria-selected': String(filtro === k),
      onclick: () => { filtro = k; draw().catch(fail); } }, l, n !== null ? h('em', {}, String(n)) : null)));
    const sorted = filtro === 'historial' ? pedidos
      : [...pedidos].sort((a, b) => (PRIO[a.estado] - PRIO[b.estado]) || (new Date(a.created_at) - new Date(b.created_at)));
    const fresh = new Set(known ? sorted.filter((p) => !known.has(p.id)).map((p) => p.id) : []);
    known = new Set([...(known || []), ...sorted.map((p) => p.id)]);
    list.replaceChildren(...(sorted.length ? sorted.map((p) => orderCard(p, fresh.has(p.id)))
      : [h('div', { class: 'empty' }, icon('receipt'), h('p', {}, filtro === 'historial' ? 'Aún no hay pedidos entregados o cancelados.' : 'No hay pedidos en esta sección.'))]));
  }

  async function mover(p, estado, btn) {
    btn.disabled = true;
    try { await api(`/api/admin/pedidos/${p.id}/estado`, { method: 'PATCH', body: { estado } }); await draw(); poll(); }
    catch (e) { btn.disabled = false; fail(e); }
  }

  function orderCard(p, isFresh) {
    const next = SIGUIENTE[p.estado];
    const tel = (p.cliente_telefono || '').replace(/[^+\d]/g, '');
    return h('article', { class: `order ${p.estado}${isFresh ? ' fresh' : ''}`, dataset: { id: p.id } },
      h('div', { class: 'o-head' },
        h('div', {}, h('h3', {}, h('span', {}, `#${p.id}`), ` ${p.cliente_nombre}`),
          h('div', { class: 'o-meta' }, h('time', { dataset: { ts: p.created_at } }, hace(p.created_at)),
            h('span', {}, p.tipo === 'llevar' ? '🥡 Para llevar' : '🍽️ Comer aquí'),
            tel ? h('a', { href: `tel:${tel}` }, p.cliente_telefono) : null)),
        h('span', { class: `chip-s ${p.estado}` }, p.estado)),
      h('ul', { class: 'o-items' }, ...p.items.map((i) => h('li', {},
        h('span', {}, h('span', { class: 'q' }, `${i.cantidad}×`), i.nombre, i.nota ? h('small', {}, i.nota) : null),
        h('span', {}, money(i.cantidad * i.precio_unitario))))),
      p.notas ? h('div', { class: 'o-note' }, p.notas) : null,
      h('div', { class: 'o-foot' }, h('span', { class: 'o-total' }, money(p.total)),
        h('div', { class: 'o-acts' },
          ['nuevo', 'preparando', 'listo'].includes(p.estado) ? h('button', { class: 'btn danger sm', type: 'button', onclick: async (e) => {
            if (await ask(`¿Cancelar el pedido #${p.id}?`, 'El cliente no recibirá aviso automático. Avísale por teléfono o WhatsApp si es necesario.', 'Sí, cancelar')) mover(p, 'cancelado', e.target);
          } }, 'Cancelar') : null,
          next ? h('button', { class: 'btn green rp', type: 'button', onclick: (e) => mover(p, next[0], e.currentTarget) }, next[1]) : null,
          (p.estado === 'cancelado' || p.estado === 'entregado') ? h('button', { class: 'btn sm', type: 'button', onclick: (e) => mover(p, 'nuevo', e.currentTarget) }, 'Reabrir') : null)));
  }

  state.refreshOrders = () => draw().catch(() => {});
  pane.replaceChildren(h('div', { class: 'pane-head' }, h('h2', {}, 'Pedidos'), h('span', { class: 'muted' }, 'Se actualiza solo cada 10 segundos')), stats, tabs, list);
  await draw();
}

/* ---------- Platillos ---------- */
async function viewPlatillos(pane) {
  const [cats, all] = await Promise.all([api('/api/admin/categorias'), api('/api/admin/platillos')]);
  let dishes = all; let q = ''; let cat = 0;
  const grid = h('div', { class: 'dgrid' });
  const bar = h('div', { class: 'cats-bar', role: 'tablist', 'aria-label': 'Categorías' });

  const body = (d, extra) => ({ categoria_id: d.categoria_id, nombre: d.nombre, descripcion: d.descripcion, precio: d.precio, activo: d.activo, agotado: d.agotado, orden: d.orden, ...extra });
  const reload = async () => { dishes = await api('/api/admin/platillos'); draw(); };
  const toggle = async (d, extra, input) => {
    try { await api(`/api/admin/platillos/${d.id}`, { method: 'PUT', body: body(d, extra) }); await reload(); }
    catch (ex) { input.checked = !input.checked; fail(ex); }
  };

  const card = (d) => {
    const catName = cats.find((c) => c.id === d.categoria_id)?.nombre || '';
    const src = d.imagen_thumb_url || d.imagen_url;
    return h('article', { class: `dcard${d.activo ? '' : ' hidden-d'}` },
      h('div', { class: 'dimg' },
        src ? h('img', { src, alt: d.nombre, loading: 'lazy', onerror: (e) => e.target.remove() }) : icon('image'),
        h('div', { class: 'tags' }, !d.activo ? h('span', { class: 'tag off' }, 'Oculto') : null, d.agotado ? h('span', { class: 'tag out' }, 'Agotado') : null)),
      h('div', { class: 'dbody' },
        h('div', {}, h('h3', {}, d.nombre), h('div', { class: 'muted' }, catName)),
        h('div', { class: 'dmeta' }, d.precio > 0 ? h('span', { class: 'p' }, money(d.precio)) : h('span', { class: 'p none' }, 'Sin precio')),
        h('div', { class: 'dsw' },
          sw('Publicado', { checked: d.activo, onchange: (e) => toggle(d, { activo: e.target.checked }, e.target) }),
          sw('Agotado', { checked: d.agotado, onchange: (e) => toggle(d, { agotado: e.target.checked }, e.target) }, 'warn')),
        h('div', { class: 'dfoot' }, h('button', { class: 'btn sm rp', type: 'button', onclick: () => editDish(d, cats, reload) }, 'Editar'))));
  };

  function draw() {
    const term = q.trim().toLowerCase();
    const shown = dishes.filter((d) => (!cat || d.categoria_id === cat) && (!term || `${d.nombre} ${d.descripcion}`.toLowerCase().includes(term)));
    grid.replaceChildren(...(shown.length ? shown.map(card)
      : [h('div', { class: 'empty', style: 'grid-column:1/-1' }, icon('grid'), h('p', {}, dishes.length ? 'No hay platillos con ese filtro.' : cats.length ? 'Aún no hay platillos. Crea el primero.' : 'Primero crea una categoría.'))]));
    bar.replaceChildren(...[[0, 'Todas'], ...cats.map((c) => [c.id, c.nombre])].map(([id, name]) =>
      h('button', { class: 'stab rp', type: 'button', role: 'tab', 'aria-selected': String(cat === id), onclick: () => { cat = id; draw(); } }, name,
        h('em', {}, String(id ? dishes.filter((d) => d.categoria_id === id).length : dishes.length)))));
  }

  pane.replaceChildren(
    h('div', { class: 'pane-head' }, h('h2', {}, 'Platillos'),
      h('div', { class: 'tools' },
        h('div', { class: 'search' }, icon('search'), h('input', { type: 'search', placeholder: 'Buscar platillo…', 'aria-label': 'Buscar platillo', oninput: (e) => { q = e.target.value; draw(); } })),
        h('button', { class: 'btn primary rp', type: 'button', disabled: !cats.length, onclick: () => editDish(null, cats, reload) }, icon('plus'), 'Nuevo platillo'))),
    bar, grid);
  draw();
}

function editDish(d, cats, onSaved) {
  const isNew = !d;
  let current = d;
  let pendingFile = null;
  const err = errBox();
  const imgBox = h('div', { class: 'imgbox' });

  const upload = async (file) => {
    const fd = new FormData(); fd.append('imagen', file);
    return api(`/api/admin/platillos/${current.id}/imagen`, { method: 'POST', form: fd, timeout: 60000 });
  };
  const drawImg = () => {
    const url = pendingFile ? URL.createObjectURL(pendingFile) : (current?.imagen_thumb_url || current?.imagen_url);
    imgBox.replaceChildren(
      url ? h('img', { class: 'pv', src: url, alt: 'Foto del platillo' }) : h('div', { class: 'pv' }, icon('image')),
      h('div', { class: 'bt' },
        h('span', { class: 'btn sm filebtn' }, url ? 'Cambiar foto' : 'Elegir foto',
          h('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp', 'aria-label': 'Elegir foto del platillo', onchange: async (e) => {
            const f = e.target.files[0]; if (!f) return;
            if (f.size > 6 * 1024 * 1024) { showErr(err, 'La foto pesa más de 6 MB'); return; }
            if (isNew) { pendingFile = f; drawImg(); return; }
            try { current = await upload(f); drawImg(); toast('Foto actualizada ✓'); onSaved(); } catch (ex) { fail(ex); }
          } })),
        url ? h('button', { class: 'btn sm danger', type: 'button', onclick: async () => {
          if (pendingFile) { pendingFile = null; drawImg(); return; }
          try { current = await api(`/api/admin/platillos/${current.id}/imagen`, { method: 'DELETE' }); drawImg(); onSaved(); } catch (ex) { fail(ex); }
        } }, 'Quitar foto') : null));
  };
  drawImg();

  const f = {
    categoria_id: h('select', { required: true }, ...cats.map((c) => h('option', { value: c.id, selected: c.id === (d?.categoria_id ?? cats[0]?.id) }, c.nombre))),
    nombre: h('input', { required: true, maxLength: 80, value: d?.nombre || '', autocomplete: 'off' }),
    descripcion: h('textarea', { rows: 3, maxLength: 400, value: d?.descripcion || '' }),
    precio: h('input', { type: 'number', min: 0, max: 100000, step: '0.5', inputMode: 'decimal', value: d?.precio ?? '', placeholder: '0.00' }),
    orden: h('input', { type: 'number', min: 0, max: 9999, step: 1, inputMode: 'numeric', value: d?.orden ?? 0 }),
    activo: h('input', { type: 'checkbox', checked: d?.activo || false }),
    agotado: h('input', { type: 'checkbox', checked: d?.agotado || false }),
  };

  modal(isNew ? 'Nuevo platillo' : 'Editar platillo', h('div', { class: 'form' },
    field('Nombre', f.nombre), field('Descripción', f.descripcion),
    h('div', { class: 'row2' }, field('Categoría', f.categoria_id), field('Precio (MXN)', f.precio, 'Obligatorio para publicarlo.')),
    h('div', { class: 'row2' }, field('Orden', f.orden, 'El número menor aparece primero.'),
      h('div', { class: 'sw-row', style: 'align-self:center' }, h('label', { class: 'sw' }, f.activo, 'Publicado'), h('label', { class: 'sw warn' }, f.agotado, 'Agotado'))),
    h('div', { class: 'fld' }, h('span', { class: 'lb' }, 'Foto'), imgBox), err),
  (close) => [
    !isNew ? h('button', { class: 'btn danger', type: 'button', style: 'margin-right:auto', onclick: async () => {
      if (!(await ask(`¿Borrar "${d.nombre}"?`, 'Se borra el platillo y su foto. Los pedidos anteriores no se modifican.', 'Sí, borrar'))) return;
      try { await api(`/api/admin/platillos/${d.id}`, { method: 'DELETE' }); close(); toast('Platillo borrado'); onSaved(); } catch (ex) { fail(ex); }
    } }, 'Borrar') : null,
    h('button', { class: 'btn', type: 'button', onclick: close }, 'Cancelar'),
    h('button', { class: 'btn primary rp', type: 'button', onclick: async (e) => {
      showErr(err, '');
      const payload = { categoria_id: Number(f.categoria_id.value), nombre: f.nombre.value.trim(), descripcion: f.descripcion.value,
        precio: f.precio.value === '' ? 0 : Number(f.precio.value), orden: Number(f.orden.value) || 0, activo: f.activo.checked, agotado: f.agotado.checked };
      if (!payload.nombre) { showErr(err, 'Escribe el nombre del platillo'); f.nombre.focus(); return; }
      if (payload.activo && !(payload.precio > 0)) { showErr(err, 'Para publicar el platillo ponle un precio.'); f.precio.focus(); return; }
      const btn = e.currentTarget; btn.disabled = true;
      try {
        const saved = isNew ? await api('/api/admin/platillos', { method: 'POST', body: payload })
          : await api(`/api/admin/platillos/${d.id}`, { method: 'PUT', body: payload });
        if (pendingFile) {
          current = saved;
          try { await upload(pendingFile); } catch (ex) { toast(`Platillo guardado, pero la foto falló: ${ex.message}`, 'error'); }
        }
        close(); toast('Guardado ✓'); onSaved();
      } catch (ex) { showErr(err, ex.message); btn.disabled = false; }
    } }, 'Guardar'),
  ]);
}

/* ---------- Categorías ---------- */
async function viewCategorias(pane) {
  const list = h('div', { class: 'clist' });
  const draw = async () => {
    const cats = await api('/api/admin/categorias');
    list.replaceChildren(...(cats.length ? cats.map((c) => h('div', { class: 'crow' },
      h('div', { class: 't' }, h('b', {}, c.nombre), h('span', { class: 'muted' }, `${c.platillos} platillo${c.platillos === 1 ? '' : 's'} · orden ${c.orden}${c.activa ? '' : ' · oculta'}`)),
      h('div', { class: 'acts' },
        h('button', { class: 'btn sm rp', type: 'button', onclick: () => editCat(c, draw) }, 'Editar'),
        h('button', { class: 'btn sm danger', type: 'button', onclick: async () => {
          if (!(await ask(`¿Borrar la categoría "${c.nombre}"?`, c.platillos ? 'Tiene platillos: muévelos o bórralos primero.' : 'Esta acción no se puede deshacer.', 'Sí, borrar'))) return;
          try { await api(`/api/admin/categorias/${c.id}`, { method: 'DELETE' }); toast('Categoría borrada'); draw(); } catch (e) { fail(e); }
        } }, 'Borrar'))))
      : [h('div', { class: 'empty' }, icon('tag'), h('p', {}, 'No hay categorías. Crea la primera.'))]));
  };
  pane.replaceChildren(h('div', { class: 'pane-head' }, h('h2', {}, 'Categorías'),
    h('button', { class: 'btn primary rp', type: 'button', onclick: () => editCat(null, draw) }, icon('plus'), 'Nueva categoría')), list);
  await draw();
}

function editCat(c, onSaved) {
  const nombre = h('input', { required: true, maxLength: 40, value: c?.nombre || '', autocomplete: 'off' });
  const orden = h('input', { type: 'number', min: 0, step: 1, inputMode: 'numeric', value: c?.orden ?? 0 });
  const activa = h('input', { type: 'checkbox', checked: c ? c.activa : true });
  const err = errBox();
  modal(c ? 'Editar categoría' : 'Nueva categoría',
    h('div', { class: 'form' }, field('Nombre', nombre), field('Orden', orden, 'El número menor aparece primero.'), h('label', { class: 'sw' }, activa, 'Visible en el menú'), err),
    (close) => [h('button', { class: 'btn', type: 'button', onclick: close }, 'Cancelar'),
      h('button', { class: 'btn primary rp', type: 'button', onclick: async () => {
        if (!nombre.value.trim()) { showErr(err, 'Escribe el nombre'); nombre.focus(); return; }
        const body = { nombre: nombre.value.trim(), orden: Number(orden.value) || 0, activa: activa.checked };
        try {
          await api(c ? `/api/admin/categorias/${c.id}` : '/api/admin/categorias', { method: c ? 'PUT' : 'POST', body });
          close(); toast('Guardado ✓'); onSaved();
        } catch (e) { showErr(err, e.message); }
      } }, 'Guardar')]);
}

/* ---------- Reseñas ---------- */
const fechaLarga = (iso) => new Date(iso).toLocaleString('es-MX', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const starsEl = (n) => h('span', { class: 'rstars', role: 'img', 'aria-label': `${n} de 5 estrellas` },
  [1, 2, 3, 4, 5].map((i) => { const st = icon('star'); if (i > n) st.classList.add('off'); return st; }));

function contactoEl(texto) {
  if (!texto) return null;
  const digitos = texto.replace(/\D/g, '');
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(texto)) return h('a', { href: `mailto:${texto}` }, texto);
  if (digitos.length >= 8) {
    const wa = digitos.length === 10 ? `52${digitos}` : digitos;
    return h('span', {}, h('a', { href: `tel:+${wa}` }, texto), ' · ', h('a', { href: `https://wa.me/${wa}`, target: '_blank', rel: 'noopener noreferrer' }, 'WhatsApp'));
  }
  return h('span', {}, texto);
}

async function viewResenas(pane) {
  let tipo = 'pendientes';
  const banner = h('div');
  const stats = h('section', { class: 'stats', 'aria-label': 'Resumen de reseñas' });
  const nota = h('p', { class: 'muted', style: 'margin:-2px 0 14px' }, '"Enviadas a Google" cuenta a los clientes que dieron 4 o 5 estrellas y fueron dirigidos a tu enlace; Google no avisa cuántos llegaron a publicar su reseña.');
  const charts = h('div', { class: 'rcharts' });
  const tabs = h('div', { class: 'seg-tabs', role: 'tablist', 'aria-label': 'Filtrar reseñas' });
  const list = h('div', { class: 'rlist', 'aria-live': 'polite' });
  const stat = (cls, n, label) => h('div', { class: `stat ${cls}` }, h('b', {}, n), h('span', {}, label));

  const distribucion = (m) => {
    const max = Math.max(1, ...Object.values(m.distribucion));
    const rows = [5, 4, 3, 2, 1].map((n) => {
      const v = m.distribucion[n];
      const fill = h('i', { style: 'width:0%' });
      requestAnimationFrame(() => requestAnimationFrame(() => { fill.style.width = `${(v / max) * 100}%`; }));
      return h('div', { class: `dist-row ${n >= 4 ? 'hi' : 'lo'}` }, h('span', { class: 'n' }, `${n} ★`), h('div', { class: 'track' }, fill), h('span', { class: 'v' }, String(v)));
    });
    return h('section', { class: 'card' }, h('h3', {}, 'Calificaciones'), ...rows,
      h('p', { class: 'muted', style: 'margin:10px 0 0' }, '4 y 5 estrellas van a Google; 1 a 3 quedan como retroalimentación privada.'));
  };

  const tendencia = (m) => {
    const max = Math.max(1, ...m.tendencia.map((d) => d.total));
    const resumen = `Calificaciones de los últimos 14 días: ${m.tendencia.map((d) => `${d.dia} ${d.total}`).join(', ')}`;
    return h('section', { class: 'card' }, h('h3', {}, 'Últimos 14 días'),
      h('div', { class: 'trend', role: 'img', 'aria-label': resumen },
        m.tendencia.map((d) => h('div', { class: 'tcol', title: `${d.dia}: ${d.total} calificaciones (${d.internas} para atender)` },
          h('div', { class: 'tbar' },
            h('i', { class: 'g', style: `height:${((d.total - d.internas) / max) * 100}%` }),
            h('i', { class: 'r', style: `height:${(d.internas / max) * 100}%` })),
          h('span', {}, String(Number(d.dia.slice(8))))))),
      h('p', { class: 'muted legend' }, h('span', { class: 'dot g' }), 'Enviadas a Google', h('span', { class: 'dot r' }), 'Retroalimentación'));
  };

  const item = (r) => {
    const interno = r.destino === 'interno';
    const mover = async (estado, btn) => {
      btn.disabled = true;
      try { await api(`/api/admin/resenas/${r.id}/estado`, { method: 'PATCH', body: { estado } }); await draw(); poll(); }
      catch (e) { btn.disabled = false; fail(e); }
    };
    return h('article', { class: `rev ${interno ? (r.estado === 'nuevo' ? 'pend' : 'done') : 'goog'}`, dataset: { id: r.id } },
      h('div', { class: 'rev-head' },
        h('div', {}, starsEl(r.calificacion), h('div', { class: 'muted' }, fechaLarga(r.created_at))),
        h('span', { class: `chip-s ${interno ? (r.estado === 'nuevo' ? 'nuevo' : 'listo') : 'entregado'}` },
          interno ? (r.estado === 'nuevo' ? 'Por atender' : 'Atendida') : 'Enviada a Google')),
      interno ? h('blockquote', { class: 'rev-msg' }, r.comentario || 'El cliente no dejó mensaje.') : null,
      interno && (r.nombre || r.contacto || r.pedido_id) ? h('div', { class: 'rev-meta' },
        r.nombre ? h('span', {}, `👤 ${r.nombre}`) : null,
        r.contacto ? h('span', {}, '📞 ', contactoEl(r.contacto)) : null,
        r.pedido_id ? h('span', {}, `🧾 Pedido #${r.pedido_id}${r.pedido_cliente ? ` · ${r.pedido_cliente}` : ''}`) : null) : null,
      h('div', { class: 'rev-acts' },
        interno ? h('button', { class: `btn sm rp ${r.estado === 'nuevo' ? 'green' : ''}`, type: 'button',
          onclick: (e) => mover(r.estado === 'nuevo' ? 'atendida' : 'nuevo', e.currentTarget) }, r.estado === 'nuevo' ? 'Marcar atendida' : 'Reabrir') : null,
        h('button', { class: 'btn sm danger', type: 'button', onclick: async () => {
          if (!(await ask('¿Borrar esta reseña?', 'Se elimina del historial y de las métricas. Úsalo para spam o pruebas.', 'Sí, borrar'))) return;
          try { await api(`/api/admin/resenas/${r.id}`, { method: 'DELETE' }); toast('Reseña borrada'); await draw(); poll(); } catch (e) { fail(e); }
        } }, 'Borrar')));
  };

  async function draw() {
    const [m, items] = await Promise.all([api('/api/admin/resenas/resumen'), api(`/api/admin/resenas?tipo=${tipo}`)]);
    banner.replaceChildren(...(m.google_configurado ? [] : [h('div', { class: 'card warn' },
      h('b', {}, 'Falta el ID de Google de tu negocio'),
      h('p', { class: 'muted', style: 'margin:6px 0 10px' }, 'Mientras no lo captures, las calificaciones de 4 y 5 estrellas se cuentan pero no se envía a nadie a Google.'),
      h('button', { class: 'btn sm primary rp', type: 'button', onclick: () => state.go?.('ajustes') }, 'Configurarlo en Ajustes'))]));
    const pct = m.total ? Math.round((m.google / m.total) * 100) : 0;
    stats.replaceChildren(
      stat('s-sales', m.total ? m.promedio.toFixed(1) : '–', `Calificación promedio · ${m.total} en total`),
      stat(`s-new${m.pendientes ? ' pulse' : ''}`, String(m.pendientes), 'Retroalimentación por atender'),
      stat('s-ready', String(m.google), `Enviadas a Google · ${pct}% del total`),
      stat('s-prep', String(m.ultimos30), 'Calificaciones en 30 días'));
    charts.replaceChildren(distribucion(m), tendencia(m));
    const T = [['pendientes', 'Por atender', m.pendientes], ['internas', 'Retroalimentación (1-3★)', m.internas], ['google', 'Enviadas a Google (4-5★)', m.google], ['todas', 'Todas', m.total]];
    tabs.replaceChildren(...T.map(([k, l, n]) => h('button', { class: 'stab rp', type: 'button', role: 'tab', 'aria-selected': String(tipo === k),
      onclick: () => { tipo = k; draw().catch(fail); } }, l, h('em', {}, String(n)))));
    const vacio = { pendientes: '¡Todo al día! No hay retroalimentación por atender.', internas: 'Aún no hay retroalimentación de clientes.', google: 'Todavía no hay clientes enviados a Google.', todas: 'Aún no hay calificaciones.' }[tipo];
    list.replaceChildren(...(items.length ? items.map(item) : [h('div', { class: 'empty' }, icon('star'), h('p', {}, vacio))]));
  }

  state.refreshResenas = () => draw().catch(() => {});
  pane.replaceChildren(h('div', { class: 'pane-head' }, h('h2', {}, 'Reseñas'), h('span', { class: 'muted' }, `Enlace para calificar: ${location.origin}/resenas/`)),
    banner, stats, nota, charts, tabs, list);
  await draw();
}

/* ---------- Enlace y código QR ---------- */
function qrCard(url, { key, title, desc, file }) {
  const qr = qrcode(0, 'M');
  qr.addData(url); qr.make();
  const n = qr.getModuleCount();
  const margin = 4;
  const svg = qr.createSvgTag({ cellSize: 8, margin: margin * 8, scalable: true });
  const holder = h('div', { class: 'qr', role: 'img', 'aria-label': `Código QR que abre ${url}` });
  holder.innerHTML = svg; // SVG generado por la biblioteca a partir de nuestra propia URL
  const download = (blob, name) => {
    const a = h('a', { href: URL.createObjectURL(blob), download: name });
    document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
  const png = () => {
    const size = 1024; const cell = Math.floor(size / (n + margin * 2));
    const px = cell * (n + margin * 2);
    const c = document.createElement('canvas'); c.width = c.height = px;
    const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, px, px); g.fillStyle = '#000';
    for (let r = 0; r < n; r++) for (let col = 0; col < n; col++) if (qr.isDark(r, col)) g.fillRect((col + margin) * cell, (r + margin) * cell, cell, cell);
    c.toBlob((b) => b && download(b, `${file}.png`), 'image/png');
  };
  return h('section', { class: 'card qr-card', dataset: { qr: key } },
    holder,
    h('div', { class: 'qr-info' },
      h('h3', {}, title),
      h('p', { class: 'muted' }, desc),
      h('code', { class: 'url' }, url),
      h('div', { class: 'tools' },
        h('button', { class: 'btn sm rp', type: 'button', onclick: async () => {
          try { await navigator.clipboard.writeText(url); toast('Enlace copiado ✓'); } catch { toast(url); }
        } }, 'Copiar enlace'),
        h('button', { class: 'btn sm rp', type: 'button', onclick: png }, 'Descargar QR (PNG)'),
        h('button', { class: 'btn sm rp', type: 'button', onclick: () => download(new Blob([svg], { type: 'image/svg+xml' }), `${file}.svg`) }, 'Descargar (SVG)'))));
}

/* ---------- Ajustes ---------- */
async function viewAjustes(pane) {
  const s = await api('/api/admin/ajustes');
  const inp = (k, props = {}) => h('input', { name: k, value: s[k] ?? '', ...props });
  const err = errBox();
  const placeInput = inp('google_place_id', { placeholder: 'ChIJ…', autocomplete: 'off', spellcheck: false, maxLength: 120 });
  const testLink = h('a', { class: 'btn sm rp', target: '_blank', rel: 'noopener noreferrer' }, icon('external'), 'Probar el enlace de reseña');
  const refreshTest = () => {
    const v = placeInput.value.trim();
    const ok = /^[A-Za-z0-9_-]{10,120}$/.test(v);
    testLink.hidden = !ok;
    if (ok) testLink.href = `https://search.google.com/local/writereview?placeid=${encodeURIComponent(v)}`;
  };
  placeInput.addEventListener('input', refreshTest); refreshTest();
  const save = h('button', { class: 'btn primary rp', type: 'submit' }, 'Guardar ajustes');
  const form = h('form', { class: 'form', onsubmit: async (e) => {
    e.preventDefault(); showErr(err, '');
    const body = Object.fromEntries(new FormData(form));
    body.pedidos_activos = form.elements.pedidos_activos.checked;
    save.disabled = true;
    try { await api('/api/admin/ajustes', { method: 'PUT', body }); toast('Ajustes guardados ✓'); } catch (ex) { showErr(err, ex.message); }
    save.disabled = false;
  } },
    h('div', { class: 'row2' },
      h('section', { class: 'card form' }, h('h3', {}, 'Pedidos en línea'),
        h('label', { class: 'sw' }, h('input', { type: 'checkbox', name: 'pedidos_activos', checked: s.pedidos_activos }), 'Recibir pedidos desde el menú'),
        h('span', { class: 'help muted' }, 'Apágalo cuando estén cerrados o saturados: el menú se sigue viendo, pero sin botón de agregar.')),
      h('section', { class: 'card form' }, h('h3', {}, 'Contacto'),
        field('Teléfono (se muestra)', inp('telefono', { maxLength: 25, type: 'tel' })),
        field('WhatsApp para pedidos', inp('whatsapp', { inputMode: 'numeric', placeholder: '526862029161' }), 'Solo números, con lada de país. Ahí llegan los pedidos.'))),
    h('section', { class: 'card form' }, h('h3', {}, 'Negocio'),
      field('Nombre', inp('nombre', { required: true, maxLength: 80 })),
      field('Eslogan', inp('slogan', { maxLength: 200 })),
      h('div', { class: 'row2' },
        field('Horario', inp('horario', { maxLength: 300, placeholder: 'Ej. Lunes a domingo, 6 pm a 12 am' })),
        field('Enlace de Google Maps', inp('maps', { type: 'url', placeholder: 'https://…' }))),
      h('div', { class: 'row2' },
        field('Dirección', inp('direccion', { maxLength: 250 })),
        field('Enlace de Google Reseñas', inp('google_reviews', { type: 'url', placeholder: 'https://g.page/r/…/review' })))),
    h('section', { class: 'card form' }, h('h3', {}, 'Reseñas de Google'),
      h('span', { class: 'help muted' }, 'Quien califique con 4 o 5 estrellas será enviado a tu enlace de Google. De 1 a 3 estrellas queda como retroalimentación privada (no se publica) y la ves en la pestaña Reseñas.'),
      field('ID de lugar de Google (Place ID)', placeInput, 'Búscalo con el "Place ID Finder" de Google (developers.google.com/maps/documentation/javascript/examples/places-placeid-finder): escribe el nombre del negocio y copia el ID, que empieza con ChIJ. Mientras esté vacío no se envía a nadie a Google.'),
      h('div', {}, testLink)),
    h('section', { class: 'card form' }, h('h3', {}, 'Redes sociales'),
      h('span', { class: 'help muted' }, 'Todos los iconos se ven en la tarjeta. Los que dejes vacíos avisarán "muy pronto" al tocarlos.'),
      h('div', { class: 'row2' },
        field('Facebook', inp('facebook', { type: 'url', placeholder: 'https://facebook.com/…' })),
        field('Instagram', inp('instagram', { type: 'url', placeholder: 'https://instagram.com/…' })),
        field('TikTok', inp('tiktok', { type: 'url', placeholder: 'https://tiktok.com/@…' })),
        field('YouTube', inp('youtube', { type: 'url', placeholder: 'https://youtube.com/@…' })))),
    err, h('div', {}, save));
  pane.replaceChildren(h('div', { class: 'pane-head' }, h('h2', {}, 'Ajustes')),
    qrCard(`${location.origin}/`, { key: 'tarjeta', file: 'qr-los-plebes', title: 'Tu tarjeta: enlace, QR y NFC',
      desc: 'Graba este enlace en tu etiqueta NFC e imprime el QR para tu local, tus mesas y tus bolsas.' }),
    form);
}

/* ---------- Usuarios del sistema ---------- */
function editarUsuario(onSaved) {
  const email = h('input', { type: 'email', required: true, maxLength: 120, autocomplete: 'off', inputMode: 'email' });
  const nombre = h('input', { maxLength: 60, autocomplete: 'off' });
  const clave = h('input', { type: 'password', required: true, minLength: 10, autocomplete: 'new-password' });
  const err = errBox();
  modal('Nuevo usuario', h('div', { class: 'form' },
    field('Correo (con este entra al panel)', email), field('Nombre (opcional)', nombre),
    field('Contraseña', clave, 'Mínimo 10 caracteres. Compártesela a la persona; podrá cambiarla en Cuenta.'), err),
  (close) => [h('button', { class: 'btn', type: 'button', onclick: close }, 'Cancelar'),
    h('button', { class: 'btn primary rp', type: 'button', onclick: async (e) => {
      showErr(err, '');
      if (!email.value.trim() || clave.value.length < 10) { showErr(err, 'Escribe el correo y una contraseña de al menos 10 caracteres'); return; }
      const btn = e.currentTarget; btn.disabled = true;
      try { await api('/api/admin/usuarios', { method: 'POST', body: { email: email.value, nombre: nombre.value, password: clave.value } }); close(); toast('Usuario creado ✓'); onSaved(); }
      catch (ex) { showErr(err, ex.message); btn.disabled = false; }
    } }, 'Crear usuario')]);
}

function cambiarClaveUsuario(u) {
  const clave = h('input', { type: 'password', required: true, minLength: 10, autocomplete: 'new-password' });
  const err = errBox();
  modal(`Nueva contraseña para ${u.email}`, h('div', { class: 'form' }, field('Contraseña nueva', clave, 'Mínimo 10 caracteres.'), err),
  (close) => [h('button', { class: 'btn', type: 'button', onclick: close }, 'Cancelar'),
    h('button', { class: 'btn primary rp', type: 'button', onclick: async (e) => {
      showErr(err, '');
      if (clave.value.length < 10) { showErr(err, 'Mínimo 10 caracteres'); return; }
      const btn = e.currentTarget; btn.disabled = true;
      try { await api(`/api/admin/usuarios/${u.id}/password`, { method: 'PUT', body: { password: clave.value } }); close(); toast('Contraseña actualizada ✓'); }
      catch (ex) { showErr(err, ex.message); btn.disabled = false; }
    } }, 'Guardar')]);
}

async function usuariosCard() {
  const list = h('div', { class: 'clist' });
  const draw = async () => {
    const usuarios = await api('/api/admin/usuarios');
    list.replaceChildren(...usuarios.map((u) => h('div', { class: 'crow' },
      h('div', { class: 't' }, h('b', {}, u.nombre || u.email), h('span', { class: 'muted' }, u.nombre ? u.email : '', u.yo ? (u.nombre ? ' · ' : '') + 'Tú' : '')),
      u.yo ? null : h('div', { class: 'acts' },
        h('button', { class: 'btn sm rp', type: 'button', onclick: () => cambiarClaveUsuario(u) }, 'Contraseña'),
        h('button', { class: 'btn sm danger', type: 'button', onclick: async () => {
          if (!(await ask(`¿Borrar a ${u.email}?`, 'Esta persona ya no podrá entrar al panel.', 'Sí, borrar'))) return;
          try { await api(`/api/admin/usuarios/${u.id}`, { method: 'DELETE' }); toast('Usuario borrado'); draw(); } catch (e) { fail(e); }
        } }, 'Borrar')))));
  };
  const card = h('section', { class: 'card', style: 'margin-top:14px;max-width:520px' },
    h('div', { class: 'bar', style: 'margin-bottom:10px' }, h('h3', { style: 'margin:0' }, 'Usuarios del sistema'),
      h('button', { class: 'btn sm primary rp', type: 'button', onclick: () => editarUsuario(draw) }, icon('plus'), 'Nuevo usuario')),
    h('p', { class: 'muted', style: 'margin:0 0 12px' }, 'Todos los usuarios tienen el mismo acceso al panel: pedidos, platillos, reseñas y ajustes.'),
    list);
  await draw();
  return card;
}

/* ---------- Cuenta ---------- */
async function viewCuenta(pane) {
  const { user } = await api('/api/auth/me');
  const err = errBox();
  const form = h('form', { class: 'card form', style: 'max-width:520px', onsubmit: async (e) => {
    e.preventDefault(); showErr(err, '');
    const fd = new FormData(form);
    if (fd.get('nueva') !== fd.get('repetir')) { showErr(err, 'Las contraseñas nuevas no coinciden'); return; }
    try { await api('/api/auth/password', { method: 'POST', body: { actual: fd.get('actual'), nueva: fd.get('nueva') } }); form.reset(); toast('Contraseña actualizada ✓'); }
    catch (ex) { showErr(err, ex.message); }
  } },
    h('h3', {}, 'Cambiar contraseña'),
    h('p', { class: 'muted', style: 'margin:-4px 0 0' }, `Sesión: ${user.email}`),
    field('Contraseña actual', h('input', { name: 'actual', type: 'password', required: true, autocomplete: 'current-password' })),
    field('Contraseña nueva', h('input', { name: 'nueva', type: 'password', required: true, minLength: 10, autocomplete: 'new-password' }), 'Mínimo 10 caracteres.'),
    field('Repite la nueva', h('input', { name: 'repetir', type: 'password', required: true, minLength: 10, autocomplete: 'new-password' })),
    err, h('div', {}, h('button', { class: 'btn primary rp', type: 'submit' }, 'Cambiar contraseña')));
  pane.replaceChildren(h('div', { class: 'pane-head' }, h('h2', {}, 'Cuenta')), form, await usuariosCard(),
    h('div', { style: 'margin-top:18px' }, h('button', { class: 'btn danger', type: 'button', onclick: () => logout() }, 'Cerrar sesión')));
}

/* ---------- Inicio ---------- */
ripples();
document.addEventListener('visibilitychange', () => { if (!document.hidden) poll(); });
addEventListener('online', () => { setOnline(true); poll(); });
addEventListener('offline', () => setOnline(false));
if (token) renderShell(); else renderLogin();
