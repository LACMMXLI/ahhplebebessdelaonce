import { h, api as rawApi, ApiError, money, toast } from './lib.js';
import { icon } from './icons.js';

const app = document.getElementById('app');
const TOKEN_KEY = 'plebes_admin_token';
let token = null;
try { token = sessionStorage.getItem(TOKEN_KEY); } catch { /* sin almacenamiento */ }

let view = 'pedidos';
let pollTimer;
let lastNuevos = null;
let audioCtx;
const state = { nuevos: 0 };

/* ---------- Acceso a la API con la sesión ---------- */
async function api(path, opts = {}) {
  try {
    return await rawApi(path, { ...opts, token });
  } catch (e) {
    if (e instanceof ApiError && e.status === 401 && token) { logout('Tu sesión venció. Entra de nuevo.'); }
    throw e;
  }
}
const fail = (e) => toast(e.message || 'Algo salió mal', 'error');

function logout(msg) {
  token = null; lastNuevos = null;
  try { sessionStorage.removeItem(TOKEN_KEY); } catch { /* ignorar */ }
  clearInterval(pollTimer);
  renderLogin(msg);
}

/* ---------- Sonido de aviso para pedidos nuevos ---------- */
function beep() {
  try {
    audioCtx ??= new (window.AudioContext || window.webkitAudioContext)();
    const o = audioCtx.createOscillator(); const g = audioCtx.createGain();
    o.type = 'sine'; o.frequency.value = 880; g.gain.value = 0.15;
    o.connect(g); g.connect(audioCtx.destination);
    o.start(); o.stop(audioCtx.currentTime + 0.25);
  } catch { /* sin audio */ }
}

/* ---------- Modal ---------- */
function modal(title, body, footer) {
  const dlg = h('dialog', { class: 'modal', 'aria-label': title });
  const close = () => { dlg.close(); dlg.remove(); };
  dlg.append(h('div', { class: 'm-in' },
    h('header', {}, h('h2', {}, title), h('button', { class: 'x', type: 'button', onclick: close, 'aria-label': 'Cerrar' }, icon('close'))),
    h('div', { class: 'm-body' }, body),
    footer ? h('footer', {}, footer(close)) : null));
  dlg.addEventListener('cancel', () => dlg.remove());
  document.body.append(dlg);
  dlg.showModal();
  return { dlg, close };
}

const field = (label, input, help) => h('div', { class: 'field' }, h('label', {}, label, input), help ? h('span', { class: 'help' }, help) : null);
const sw = (label, props, cls = '') => h('label', { class: `sw ${cls}` }, h('input', { type: 'checkbox', ...props }), label);

/* ---------- Login ---------- */
function renderLogin(msg) {
  const err = h('p', { class: 'err', role: 'alert' }, msg || '');
  const btn = h('button', { class: 'btn primary', type: 'submit' }, 'Entrar');
  app.replaceChildren(h('div', { class: 'login' },
    h('form', { onsubmit: async (e) => {
      e.preventDefault();
      btn.disabled = true; err.textContent = '';
      const fd = new FormData(e.currentTarget);
      try {
        const r = await rawApi('/api/auth/login', { method: 'POST', body: { email: fd.get('email'), password: fd.get('password') } });
        token = r.token;
        try { sessionStorage.setItem(TOKEN_KEY, token); } catch { /* ignorar */ }
        audioCtx ??= new (window.AudioContext || window.webkitAudioContext)(); // se habilita con este gesto
        renderShell();
      } catch (ex) { err.textContent = ex.message; btn.disabled = false; }
    } },
      h('img', { src: '../assets/logo.webp', alt: '' }),
      h('h1', {}, 'Panel de administración'),
      h('div', { class: 'field' }, h('label', {}, 'Correo', h('input', { name: 'email', type: 'email', required: true, autocomplete: 'username' }))),
      h('div', { class: 'field' }, h('label', {}, 'Contraseña', h('input', { name: 'password', type: 'password', required: true, autocomplete: 'current-password' }))),
      err, btn)));
}

/* ---------- Estructura ---------- */
const TABS = [['pedidos', 'Pedidos'], ['platillos', 'Platillos'], ['categorias', 'Categorías'], ['ajustes', 'Ajustes'], ['cuenta', 'Cuenta']];
const views = { pedidos: viewPedidos, platillos: viewPlatillos, categorias: viewCategorias, ajustes: viewAjustes, cuenta: viewCuenta };

function renderShell() {
  const tabs = h('nav', { class: 'tabs', 'aria-label': 'Secciones' });
  const pane = h('main', { class: 'pane', id: 'pane' });
  const drawTabs = () => tabs.replaceChildren(...TABS.map(([k, label]) =>
    h('button', { class: 'tab', type: 'button', 'aria-current': view === k ? 'page' : null, onclick: () => { view = k; drawTabs(); load(); } },
      label, k === 'pedidos' && state.nuevos ? h('span', { class: 'badge', 'aria-label': `${state.nuevos} nuevos` }, String(state.nuevos)) : null)));
  const load = () => { pane.replaceChildren(h('p', { class: 'loading' }, 'Cargando…')); views[view](pane).catch(fail); };
  app.replaceChildren(
    h('header', { class: 'top' },
      h('div', { class: 'top-in' }, h('img', { src: '../assets/logo.webp', alt: '' }), h('strong', {}, 'Ahh Plebes de la Once')), tabs),
    pane);
  state.drawTabs = drawTabs;
  drawTabs(); load();
  clearInterval(pollTimer);
  pollTimer = setInterval(poll, 15000);
  poll();
}

async function poll() {
  if (!token || document.hidden) return;
  try {
    const r = await api('/api/admin/pedidos/resumen');
    if (lastNuevos !== null && r.nuevos > lastNuevos) { beep(); toast('¡Llegó un pedido nuevo!'); if (view === 'pedidos') state.refreshOrders?.(); }
    lastNuevos = r.nuevos;
    if (state.nuevos !== r.nuevos) { state.nuevos = r.nuevos; state.drawTabs?.(); document.title = `${r.nuevos ? `(${r.nuevos}) ` : ''}Panel · Ahh Plebes`; }
  } catch { /* se reintenta en el siguiente ciclo */ }
}

/* ---------- Pedidos ---------- */
const SIGUIENTE = { nuevo: ['preparando', 'Preparar'], preparando: ['listo', 'Marcar listo'], listo: ['entregado', 'Entregado'] };
const FILTROS = [['activos', 'Activos'], ['nuevo', 'Nuevos'], ['preparando', 'En preparación'], ['listo', 'Listos'], ['entregado', 'Entregados'], ['cancelado', 'Cancelados'], ['', 'Todos']];

function hace(iso) {
  const m = Math.round((Date.now() - new Date(iso)) / 60000);
  if (m < 1) return 'ahora';
  if (m < 60) return `hace ${m} min`;
  const hr = Math.round(m / 60);
  return hr < 24 ? `hace ${hr} h` : new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
}

async function viewPedidos(pane) {
  let filtro = 'activos';
  const list = h('div');
  const sel = h('select', { 'aria-label': 'Filtrar pedidos', onchange: (e) => { filtro = e.target.value; draw(); } },
    ...FILTROS.map(([v, l]) => h('option', { value: v, selected: v === filtro }, l)));

  async function draw() {
    const pedidos = await api(`/api/admin/pedidos${filtro ? `?estado=${filtro}` : ''}`);
    list.replaceChildren(...(pedidos.length ? pedidos.map(orderCard) : [h('p', { class: 'empty' }, 'No hay pedidos aquí.')]));
  }
  function orderCard(p) {
    const next = SIGUIENTE[p.estado];
    const mover = async (estado) => {
      try { await api(`/api/admin/pedidos/${p.id}/estado`, { method: 'PATCH', body: { estado } }); await draw(); poll(); } catch (e) { fail(e); }
    };
    return h('article', { class: 'card order' },
      h('div', { class: 'head' },
        h('div', {}, h('h3', {}, `#${p.id} · ${p.cliente_nombre}`),
          h('div', { class: 'muted' }, `${hace(p.created_at)} · ${p.tipo === 'llevar' ? 'Para llevar' : 'Comer aquí'}`,
            p.cliente_telefono ? [' · ', h('a', { href: `tel:${p.cliente_telefono.replace(/[^+\d]/g, '')}` }, p.cliente_telefono)] : null)),
        h('span', { class: `estado ${p.estado}` }, p.estado)),
      h('ul', {}, ...p.items.map((i) => h('li', {}, h('span', {}, `${i.cantidad} × ${i.nombre}`, i.nota ? h('small', {}, i.nota) : null),
        h('span', {}, money(i.cantidad * i.precio_unitario))))),
      p.notas ? h('div', { class: 'note' }, `📝 ${p.notas}`) : null,
      h('div', { class: 'foot' }, h('span', { class: 'total' }, money(p.total)),
        h('div', { class: 'acts' },
          next ? h('button', { class: 'btn green', type: 'button', onclick: () => mover(next[0]) }, next[1]) : null,
          ['nuevo', 'preparando', 'listo'].includes(p.estado)
            ? h('button', { class: 'btn danger', type: 'button', onclick: () => { if (confirm(`¿Cancelar el pedido #${p.id}?`)) mover('cancelado'); } }, 'Cancelar') : null)));
  }
  state.refreshOrders = () => draw().catch(() => {});
  pane.replaceChildren(h('div', { class: 'bar' }, h('h2', {}, 'Pedidos'),
    h('div', { class: 'field' }, sel)), list);
  await draw();
}

/* ---------- Platillos ---------- */
async function viewPlatillos(pane) {
  const [cats, dishes] = await Promise.all([api('/api/admin/categorias'), api('/api/admin/platillos')]);
  const draw = (ds) => {
    const groups = cats.map((c) => [c, ds.filter((d) => d.categoria_id === c.id)]).filter(([, l]) => l.length);
    pane.replaceChildren(
      h('div', { class: 'bar' }, h('h2', {}, 'Platillos'),
        h('button', { class: 'btn primary', type: 'button', onclick: () => editDish(null, cats, reload) }, icon('plus'), 'Nuevo platillo')),
      ...(groups.length ? groups.flatMap(([c, l]) => [h('h3', { class: 'cat-title' }, `${c.nombre}${c.activa ? '' : ' (oculta)'}`), ...l.map((d) => dishRow(d, ds))])
        : [h('p', { class: 'empty' }, cats.length ? 'Aún no hay platillos.' : 'Primero crea una categoría.')]));
  };
  const reload = async () => draw(await api('/api/admin/platillos'));

  const body = (d, extra) => ({ categoria_id: d.categoria_id, nombre: d.nombre, descripcion: d.descripcion, precio: d.precio, activo: d.activo, agotado: d.agotado, orden: d.orden, ...extra });
  const dishRow = (d) => h('article', { class: 'card drow' },
    d.imagen_url ? h('img', { class: 'thumb', src: d.imagen_url, alt: '' }) : h('div', { class: 'thumb' }, icon('image')),
    h('div', {}, h('h3', {}, d.nombre), h('div', { class: 'muted' }, d.precio > 0 ? money(d.precio) : 'Sin precio')),
    h('div', { class: 'tools' },
      h('div', { class: 'switches' },
        sw('Publicado', { checked: d.activo, onchange: async (e) => {
          try { await api(`/api/admin/platillos/${d.id}`, { method: 'PUT', body: body(d, { activo: e.target.checked }) }); await reload(); }
          catch (ex) { e.target.checked = !e.target.checked; fail(ex); }
        } }),
        sw('Agotado', { checked: d.agotado, onchange: async (e) => {
          try { await api(`/api/admin/platillos/${d.id}`, { method: 'PUT', body: body(d, { agotado: e.target.checked }) }); await reload(); }
          catch (ex) { e.target.checked = !e.target.checked; fail(ex); }
        } }, 'warn')),
      h('button', { class: 'btn sm', type: 'button', onclick: () => editDish(d, cats, reload) }, 'Editar')));
  draw(dishes);
}

function editDish(d, cats, onSaved) {
  const isNew = !d;
  let current = d;
  let pendingFile = null;
  const errBox = h('p', { class: 'err', role: 'alert' });
  const imgBox = h('div', { class: 'imgbox' });
  const drawImg = () => {
    const url = pendingFile ? URL.createObjectURL(pendingFile) : current?.imagen_url;
    imgBox.replaceChildren(
      url ? h('img', { src: url, alt: 'Foto del platillo' }) : h('div', { class: 'ph' }, icon('image')),
      h('div', { style: 'display:grid;gap:8px' },
        h('label', { class: 'btn sm', style: 'cursor:pointer' }, 'Elegir foto',
          h('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp', class: 'sr-only', onchange: async (e) => {
            const f = e.target.files[0]; if (!f) return;
            if (isNew) { pendingFile = f; drawImg(); return; }
            try { current = await api(`/api/admin/platillos/${current.id}/imagen`, { method: 'POST', form: (() => { const fd = new FormData(); fd.append('imagen', f); return fd; })(), timeout: 60000 }); drawImg(); toast('Foto actualizada ✓'); onSaved(); }
            catch (ex) { fail(ex); }
          } })),
        (pendingFile || current?.imagen_url) ? h('button', { class: 'btn sm danger', type: 'button', onclick: async () => {
          if (pendingFile) { pendingFile = null; drawImg(); return; }
          try { current = await api(`/api/admin/platillos/${current.id}/imagen`, { method: 'DELETE' }); drawImg(); onSaved(); } catch (ex) { fail(ex); }
        } }, 'Quitar foto') : null));
  };
  drawImg();

  const f = {
    categoria_id: h('select', { required: true }, ...cats.map((c) => h('option', { value: c.id, selected: c.id === (d?.categoria_id ?? cats[0]?.id) }, c.nombre))),
    nombre: h('input', { required: true, maxLength: 80, value: d?.nombre || '' }),
    descripcion: h('textarea', { rows: 3, maxLength: 400, value: d?.descripcion || '' }),
    precio: h('input', { type: 'number', min: 0, step: '0.50', inputMode: 'decimal', value: d?.precio ?? '' }),
    orden: h('input', { type: 'number', min: 0, step: 1, value: d?.orden ?? 0 }),
    activo: h('input', { type: 'checkbox', checked: d?.activo || false }),
    agotado: h('input', { type: 'checkbox', checked: d?.agotado || false }),
  };

  modal(isNew ? 'Nuevo platillo' : 'Editar platillo', h('div', { class: 'form' },
    field('Nombre', f.nombre), field('Descripción', f.descripcion),
    h('div', { class: 'row2' }, field('Categoría', f.categoria_id), field('Precio (MXN)', f.precio, 'Debe tener precio para publicarse.')),
    h('div', { class: 'row2' }, field('Orden', f.orden, 'Número menor aparece primero.'),
      h('div', { class: 'switches' }, h('label', { class: 'sw' }, f.activo, 'Publicado'), h('label', { class: 'sw warn' }, f.agotado, 'Agotado'))),
    h('div', { class: 'field' }, h('span', { style: 'font-size:13px;color:var(--muted);font-weight:650' }, 'Foto'), imgBox), errBox),
  (closeFn) => [
    !isNew ? h('button', { class: 'btn danger', type: 'button', style: 'margin-right:auto', onclick: async () => {
      if (!confirm(`¿Borrar "${d.nombre}"? Esto no se puede deshacer.`)) return;
      try { await api(`/api/admin/platillos/${d.id}`, { method: 'DELETE' }); closeFn(); toast('Platillo borrado'); onSaved(); } catch (ex) { fail(ex); }
    } }, 'Borrar') : null,
    h('button', { class: 'btn', type: 'button', onclick: closeFn }, 'Cancelar'),
    h('button', { class: 'btn primary', type: 'button', onclick: async (e) => {
      errBox.textContent = '';
      const payload = { categoria_id: Number(f.categoria_id.value), nombre: f.nombre.value, descripcion: f.descripcion.value,
        precio: f.precio.value === '' ? 0 : Number(f.precio.value), orden: Number(f.orden.value) || 0, activo: f.activo.checked, agotado: f.agotado.checked };
      if (!payload.nombre.trim()) { errBox.textContent = 'Escribe el nombre del platillo'; return; }
      e.target.disabled = true;
      try {
        const saved = isNew ? await api('/api/admin/platillos', { method: 'POST', body: payload })
          : await api(`/api/admin/platillos/${d.id}`, { method: 'PUT', body: payload });
        if (pendingFile) {
          const fd = new FormData(); fd.append('imagen', pendingFile);
          try { await api(`/api/admin/platillos/${saved.id}/imagen`, { method: 'POST', form: fd, timeout: 60000 }); }
          catch (ex) { toast(`Platillo guardado, pero la foto falló: ${ex.message}`, 'error'); }
        }
        closeFn(); toast('Guardado ✓'); onSaved();
      } catch (ex) { errBox.textContent = ex.message; e.target.disabled = false; }
    } }, 'Guardar'),
  ]);
}

/* ---------- Categorías ---------- */
async function viewCategorias(pane) {
  const draw = async () => {
    const cats = await api('/api/admin/categorias');
    pane.replaceChildren(
      h('div', { class: 'bar' }, h('h2', {}, 'Categorías'),
        h('button', { class: 'btn primary', type: 'button', onclick: () => editCat(null, draw) }, icon('plus'), 'Nueva categoría')),
      h('div', { class: 'card' }, cats.length ? h('table', { class: 't' }, h('tbody', {}, ...cats.map((c) => h('tr', {},
        h('td', {}, h('strong', {}, c.nombre), h('div', { class: 'muted' }, `${c.platillos} platillo${c.platillos === 1 ? '' : 's'} · orden ${c.orden}${c.activa ? '' : ' · oculta'}`)),
        h('td', {}, h('button', { class: 'btn sm', type: 'button', onclick: () => editCat(c, draw) }, 'Editar'), ' ',
          h('button', { class: 'btn sm danger', type: 'button', onclick: async () => {
            if (!confirm(`¿Borrar la categoría "${c.nombre}"?`)) return;
            try { await api(`/api/admin/categorias/${c.id}`, { method: 'DELETE' }); toast('Categoría borrada'); draw(); } catch (e) { fail(e); }
          } }, 'Borrar')))))) : h('p', { class: 'empty' }, 'No hay categorías.')));
  };
  await draw();
}

function editCat(c, onSaved) {
  const nombre = h('input', { required: true, maxLength: 40, value: c?.nombre || '' });
  const orden = h('input', { type: 'number', min: 0, step: 1, value: c?.orden ?? 0 });
  const activa = h('input', { type: 'checkbox', checked: c ? c.activa : true });
  const err = h('p', { class: 'err', role: 'alert' });
  modal(c ? 'Editar categoría' : 'Nueva categoría',
    h('div', { class: 'form' }, field('Nombre', nombre), field('Orden', orden, 'Número menor aparece primero.'), h('label', { class: 'sw' }, activa, 'Visible en el menú'), err),
    (close) => [h('button', { class: 'btn', type: 'button', onclick: close }, 'Cancelar'),
      h('button', { class: 'btn primary', type: 'button', onclick: async () => {
        const body = { nombre: nombre.value, orden: Number(orden.value) || 0, activa: activa.checked };
        try {
          await api(c ? `/api/admin/categorias/${c.id}` : '/api/admin/categorias', { method: c ? 'PUT' : 'POST', body });
          close(); toast('Guardado ✓'); onSaved();
        } catch (e) { err.textContent = e.message; }
      } }, 'Guardar')]);
}

/* ---------- Ajustes ---------- */
async function viewAjustes(pane) {
  const s = await api('/api/admin/ajustes');
  const inp = (k, props = {}) => h('input', { name: k, value: s[k] ?? '', ...props });
  const err = h('p', { class: 'err', role: 'alert' });
  const form = h('form', { class: 'form', onsubmit: async (e) => {
    e.preventDefault(); err.textContent = '';
    const fd = new FormData(form);
    const body = Object.fromEntries(fd);
    body.pedidos_activos = form.elements.pedidos_activos.checked;
    try { await api('/api/admin/ajustes', { method: 'PUT', body }); toast('Ajustes guardados ✓'); } catch (ex) { err.textContent = ex.message; }
  } },
    h('div', { class: 'card form' },
      h('h3', { style: 'margin:0' }, 'Pedidos en línea'),
      h('label', { class: 'sw' }, h('input', { type: 'checkbox', name: 'pedidos_activos', checked: s.pedidos_activos }), 'Recibir pedidos desde el menú'),
      h('span', { class: 'help muted' }, 'Apágalo cuando estén cerrados o saturados: el menú se sigue viendo pero sin botón de agregar.')),
    h('div', { class: 'card form' },
      h('h3', { style: 'margin:0' }, 'Negocio'),
      field('Nombre', inp('nombre', { required: true, maxLength: 80 })),
      field('Eslogan', inp('slogan', { maxLength: 200 })),
      field('Horario', inp('horario', { maxLength: 300, placeholder: 'Ej. Lunes a domingo, 6 pm a 12 am' })),
      field('Dirección', inp('direccion', { maxLength: 250 })),
      field('Enlace de Google Maps', inp('maps', { type: 'url', placeholder: 'https://…' }))),
    h('div', { class: 'card form' },
      h('h3', { style: 'margin:0' }, 'Contacto'),
      h('div', { class: 'row2' },
        field('Teléfono (se muestra)', inp('telefono', { maxLength: 25 })),
        field('WhatsApp para pedidos', inp('whatsapp', { inputMode: 'numeric', placeholder: '526862029161' }), 'Solo números, con lada de país. Ahí llegan los pedidos.'))),
    h('div', { class: 'card form' },
      h('h3', { style: 'margin:0' }, 'Redes sociales'),
      h('span', { class: 'help muted' }, 'Las que dejes vacías no se muestran en la tarjeta.'),
      h('div', { class: 'row2' },
        field('Facebook', inp('facebook', { type: 'url', placeholder: 'https://facebook.com/…' })),
        field('Instagram', inp('instagram', { type: 'url', placeholder: 'https://instagram.com/…' })),
        field('TikTok', inp('tiktok', { type: 'url', placeholder: 'https://tiktok.com/@…' })),
        field('YouTube', inp('youtube', { type: 'url', placeholder: 'https://youtube.com/@…' })))),
    err, h('button', { class: 'btn primary', type: 'submit' }, 'Guardar ajustes'));
  pane.replaceChildren(h('div', { class: 'bar' }, h('h2', {}, 'Ajustes')), form);
}

/* ---------- Cuenta ---------- */
async function viewCuenta(pane) {
  const { user } = await api('/api/auth/me');
  const err = h('p', { class: 'err', role: 'alert' });
  const form = h('form', { class: 'form card', onsubmit: async (e) => {
    e.preventDefault(); err.textContent = '';
    const fd = new FormData(form);
    if (fd.get('nueva') !== fd.get('repetir')) { err.textContent = 'Las contraseñas nuevas no coinciden'; return; }
    try { await api('/api/auth/password', { method: 'POST', body: { actual: fd.get('actual'), nueva: fd.get('nueva') } }); form.reset(); toast('Contraseña actualizada ✓'); }
    catch (ex) { err.textContent = ex.message; }
  } },
    h('h3', { style: 'margin:0' }, 'Cambiar contraseña'),
    h('p', { class: 'muted', style: 'margin:0' }, `Sesión: ${user.email}`),
    field('Contraseña actual', h('input', { name: 'actual', type: 'password', required: true, autocomplete: 'current-password' })),
    field('Contraseña nueva', h('input', { name: 'nueva', type: 'password', required: true, minLength: 10, autocomplete: 'new-password' }), 'Mínimo 10 caracteres.'),
    field('Repite la nueva', h('input', { name: 'repetir', type: 'password', required: true, minLength: 10, autocomplete: 'new-password' })),
    err, h('button', { class: 'btn primary', type: 'submit' }, 'Cambiar contraseña'));
  pane.replaceChildren(h('div', { class: 'bar' }, h('h2', {}, 'Cuenta')), form,
    h('button', { class: 'btn danger', type: 'button', onclick: () => logout() }, 'Cerrar sesión'));
}

/* ---------- Inicio ---------- */
document.addEventListener('visibilitychange', () => { if (!document.hidden) poll(); });
if (token) renderShell(); else renderLogin();
