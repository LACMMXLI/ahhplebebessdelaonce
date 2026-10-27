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
let audioCtx;
const state = { nuevos: 0, online: true, refreshOrders: null, drawNav: null };

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
  token = null; lastNuevos = null;
  try { sessionStorage.removeItem(TOKEN_KEY); } catch { /* ignorar */ }
  clearInterval(pollTimer);
  document.title = 'Panel · Ahh Plebes de la Once';
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
const TABS = [['pedidos', 'Pedidos', 'receipt'], ['platillos', 'Platillos', 'grid'], ['categorias', 'Categorías', 'tag'], ['ajustes', 'Ajustes', 'sliders'], ['cuenta', 'Cuenta', 'lock']];
const views = { pedidos: viewPedidos, platillos: viewPlatillos, categorias: viewCategorias, ajustes: viewAjustes, cuenta: viewCuenta };

function renderShell() {
  const pane = h('main', { class: 'pane', id: 'pane', tabindex: '-1' });
  const title = h('h1', {});
  const navBtn = (k, label, ic) => h('button', { class: 'nav rp', type: 'button', dataset: { v: k }, onclick: () => go(k) },
    icon(ic), label, k === 'pedidos' ? h('span', { class: 'badge', hidden: !state.nuevos, 'aria-label': `${state.nuevos} pedidos nuevos` }, String(state.nuevos)) : null);
  const side = h('aside', { class: 'side', 'aria-label': 'Navegación' },
    h('div', { class: 'brand' }, h('img', { src: '../assets/logo.webp', alt: '' }), h('div', {}, h('b', {}, 'Ahh Plebes'), h('small', {}, 'Panel del negocio'))),
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
      if (b.dataset.v === 'pedidos') { const bd = b.querySelector('.badge'); bd.textContent = String(state.nuevos); bd.hidden = !state.nuevos; bd.setAttribute('aria-label', `${state.nuevos} pedidos nuevos`); }
    });
    title.textContent = TABS.find(([k]) => k === view)[1];
  };
  const go = (k) => { view = k; state.refreshOrders = null; state.drawNav(); load(); pane.focus({ preventScroll: true }); scrollTo(0, 0); };
  const load = () => { pane.replaceChildren(h('p', { class: 'loading' }, 'Cargando…')); views[view](pane).catch((e) => { pane.replaceChildren(h('div', { class: 'empty' }, h('p', {}, e.message), h('button', { class: 'btn', type: 'button', onclick: load }, 'Reintentar'))); }); };
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
    document.title = `${r.nuevos ? `(${r.nuevos}) ` : ''}Panel · Ahh Plebes de la Once`;
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

/* ---------- Enlace y código QR de la tarjeta ---------- */
function qrCard() {
  const url = `${location.origin}/`;
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
    c.toBlob((b) => b && download(b, 'qr-ahh-plebes.png'), 'image/png');
  };
  return h('section', { class: 'card qr-card' },
    holder,
    h('div', { class: 'qr-info' },
      h('h3', {}, 'Tu tarjeta: enlace, QR y NFC'),
      h('p', { class: 'muted' }, 'Graba este enlace en tu etiqueta NFC e imprime el QR para tu local, tus mesas y tus bolsas.'),
      h('code', { class: 'url' }, url),
      h('div', { class: 'tools' },
        h('button', { class: 'btn sm rp', type: 'button', onclick: async () => {
          try { await navigator.clipboard.writeText(url); toast('Enlace copiado ✓'); } catch { toast(url); }
        } }, 'Copiar enlace'),
        h('button', { class: 'btn sm rp', type: 'button', onclick: png }, 'Descargar QR (PNG)'),
        h('button', { class: 'btn sm rp', type: 'button', onclick: () => download(new Blob([svg], { type: 'image/svg+xml' }), 'qr-ahh-plebes.svg') }, 'Descargar (SVG)'))));
}

/* ---------- Ajustes ---------- */
async function viewAjustes(pane) {
  const s = await api('/api/admin/ajustes');
  const inp = (k, props = {}) => h('input', { name: k, value: s[k] ?? '', ...props });
  const err = errBox();
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
      field('Dirección', inp('direccion', { maxLength: 250 }))),
    h('section', { class: 'card form' }, h('h3', {}, 'Redes sociales'),
      h('span', { class: 'help muted' }, 'Las que dejes vacías no se muestran en la tarjeta.'),
      h('div', { class: 'row2' },
        field('Facebook', inp('facebook', { type: 'url', placeholder: 'https://facebook.com/…' })),
        field('Instagram', inp('instagram', { type: 'url', placeholder: 'https://instagram.com/…' })),
        field('TikTok', inp('tiktok', { type: 'url', placeholder: 'https://tiktok.com/@…' })),
        field('YouTube', inp('youtube', { type: 'url', placeholder: 'https://youtube.com/@…' })))),
    err, h('div', {}, save));
  pane.replaceChildren(h('div', { class: 'pane-head' }, h('h2', {}, 'Ajustes')), qrCard(), form);
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
  pane.replaceChildren(h('div', { class: 'pane-head' }, h('h2', {}, 'Cuenta')), form,
    h('div', { style: 'margin-top:18px' }, h('button', { class: 'btn danger', type: 'button', onclick: () => logout() }, 'Cerrar sesión')));
}

/* ---------- Inicio ---------- */
ripples();
document.addEventListener('visibilitychange', () => { if (!document.hidden) poll(); });
addEventListener('online', () => { setOnline(true); poll(); });
addEventListener('offline', () => setOnline(false));
if (token) renderShell(); else renderLogin();
