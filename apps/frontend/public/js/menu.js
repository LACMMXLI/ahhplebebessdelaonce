import { h, api, ApiError, loadSettings, money, telHref, waHref, toast } from './lib.js';
import { icon } from './icons.js';

const $ = (id) => document.getElementById(id);
const CART_KEY = 'plebes_cart_v1';
const PROFILE_KEY = 'plebes_profile_v1';

let settings;
let dishes = new Map();                  // id -> platillo disponible
let cart = new Map();                    // id -> { cantidad, nota }
let categorias = [];
let chipObserver;

/* ---------- Carrito (guardado en el navegador) ---------- */
const loadJson = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const saveJson = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* sin almacenamiento */ } };
const persist = () => saveJson(CART_KEY, [...cart]);

const qty = (id) => cart.get(id)?.cantidad || 0;
const count = () => [...cart.values()].reduce((s, i) => s + i.cantidad, 0);
const total = () => [...cart].reduce((s, [id, i]) => s + (dishes.get(id)?.precio || 0) * i.cantidad, 0);

function setQty(id, n) {
  if (n <= 0) cart.delete(id);
  else cart.set(id, { cantidad: Math.min(n, 20), nota: cart.get(id)?.nota || '' });
  persist();
  document.querySelector(`[data-dish="${id}"]`)?.replaceWith(dishCard(dishes.get(id)));
  renderCartBar();
  if ($('sheet').open) renderSheet();
}

/* ---------- Pintado ---------- */
function dishCard(d) {
  const orderable = settings.pedidos_activos && !d.agotado;
  const control = d.agotado
    ? h('span', { class: 'sold' }, 'Agotado')
    : !orderable ? null
    : qty(d.id) === 0
      ? h('button', { class: 'btn-add', type: 'button', onclick: () => setQty(d.id, 1), 'aria-label': `Agregar ${d.nombre}` }, icon('plus'), 'Agregar')
      : h('div', { class: 'stepper' },
        h('button', { type: 'button', onclick: () => setQty(d.id, qty(d.id) - 1), 'aria-label': `Quitar uno de ${d.nombre}` }, icon('minus')),
        h('output', {}, String(qty(d.id))),
        h('button', { type: 'button', onclick: () => setQty(d.id, qty(d.id) + 1), 'aria-label': `Agregar otro ${d.nombre}` }, icon('plus')));
  return h('article', { dataset: { dish: d.id }, class: `dish${d.imagen_url ? '' : ' no-img'}${d.agotado ? ' out' : ''}` },
    d.imagen_url ? h('img', { class: 'pic', src: d.imagen_url, alt: d.nombre, loading: 'lazy', width: 96, height: 96 }) : null,
    h('div', {},
      h('h3', {}, d.nombre),
      d.descripcion ? h('p', {}, d.descripcion) : null,
      h('div', { class: 'row' }, h('span', { class: 'price' }, money(d.precio)), control)));
}

function renderMenu() {
  const menu = $('menu');
  if (!categorias.length) {
    menu.replaceChildren(h('div', { class: 'state' }, h('h2', {}, 'Menú próximamente'),
      h('p', {}, 'Estamos preparando el menú digital. Mientras tanto, llámanos o escríbenos.'), contactActions()));
    $('chips').replaceChildren();
    return;
  }
  $('chips').replaceChildren(...categorias.map((c) =>
    h('a', { class: 'chip', href: `#cat-${c.id}`, onclick: (e) => {
      e.preventDefault();
      document.getElementById(`cat-${c.id}`)?.scrollIntoView({ behavior: 'smooth' });
    } }, c.nombre)));
  menu.replaceChildren(...categorias.map((c) =>
    h('section', { id: `cat-${c.id}` }, h('h2', {}, c.nombre), ...c.platillos.map(dishCard))));
  observeChips();
}

function contactActions() {
  const wa = waHref(settings);
  return h('div', { class: 'actions' },
    h('a', { class: 'pill', href: telHref(settings) }, icon('phone'), 'Llamar'),
    wa ? h('a', { class: 'pill green', href: wa, target: '_blank', rel: 'noopener noreferrer' }, icon('whatsapp'), 'WhatsApp') : null);
}

function observeChips() {
  chipObserver?.disconnect();
  const chips = [...document.querySelectorAll('.chip')];
  chipObserver = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      chips.forEach((c) => c.classList.toggle('on', c.getAttribute('href') === `#${e.target.id}`));
      chips.find((c) => c.classList.contains('on'))?.scrollIntoView({ inline: 'center', block: 'nearest' });
    }
  }, { rootMargin: '-130px 0px -70% 0px' });
  document.querySelectorAll('.menu section').forEach((s) => chipObserver.observe(s));
}

function renderCartBar() {
  const bar = $('cartbar');
  if (!count() || !settings.pedidos_activos) { bar.hidden = true; return; }
  bar.hidden = false;
  bar.replaceChildren(h('button', { type: 'button', onclick: openSheet },
    h('span', { class: 'count' }, String(count())), icon('cart'), 'Ver mi pedido',
    h('span', { class: 'total' }, money(total()))));
}

function refresh() {
  renderMenu();
  renderCartBar();
  if ($('sheet').open) renderSheet();
}

/* ---------- Hoja del pedido ---------- */
function openSheet() {
  renderSheet();
  if (!$('sheet').open) $('sheet').showModal();
}

function renderSheet(state = {}) {
  const sheet = $('sheet');
  const profile = { nombre: '', telefono: '', tipo: 'llevar', ...loadJson(PROFILE_KEY, {}) };
  const keep = sheet.querySelector('form');
  if (keep) Object.assign(profile, Object.fromEntries(new FormData(keep)));

  const lines = [...cart].filter(([id]) => dishes.has(id)).map(([id, item]) => {
    const d = dishes.get(id);
    return h('div', { class: 'line-item' },
      h('div', {}, h('div', { class: 'nm' }, d.nombre), h('div', { class: 'pr' }, money(d.precio * item.cantidad))),
      h('div', { class: 'stepper' },
        h('button', { type: 'button', onclick: () => setQty(id, item.cantidad - 1), 'aria-label': `Quitar uno de ${d.nombre}` }, icon(item.cantidad === 1 ? 'trash' : 'minus')),
        h('output', {}, String(item.cantidad)),
        h('button', { type: 'button', onclick: () => setQty(id, item.cantidad + 1), 'aria-label': `Agregar otro ${d.nombre}` }, icon('plus'))),
      h('input', { type: 'text', maxLength: 120, placeholder: 'Nota (ej. sin cebolla)', value: item.nota, 'aria-label': `Nota para ${d.nombre}`,
        oninput: (e) => { cart.get(id).nota = e.target.value; persist(); } }));
  });

  const form = h('form', { class: 'sheet-in', onsubmit: submit },
    h('header', {}, h('h2', { id: 'sheet-title' }, 'Tu pedido'),
      h('button', { class: 'x', type: 'button', onclick: () => sheet.close(), 'aria-label': 'Cerrar' }, icon('close'))),
    h('div', { class: 'body' },
      ...(lines.length ? lines : [h('div', { class: 'empty-cart' }, 'Tu pedido está vacío.')]),
      h('div', { class: 'field' }, h('label', { for: 'f-nombre' }, 'Tu nombre'),
        h('input', { id: 'f-nombre', name: 'nombre', required: true, maxLength: 60, autocomplete: 'name', value: profile.nombre })),
      h('div', { class: 'field' }, h('label', { for: 'f-tel' }, 'Teléfono (opcional)'),
        h('input', { id: 'f-tel', name: 'telefono', type: 'tel', maxLength: 25, autocomplete: 'tel', value: profile.telefono })),
      h('fieldset', { class: 'field' }, h('legend', {}, '¿Cómo lo quieres?'),
        h('div', { class: 'seg' },
          h('label', {}, h('input', { type: 'radio', name: 'tipo', value: 'llevar', checked: profile.tipo !== 'aqui' }), 'Para llevar'),
          h('label', {}, h('input', { type: 'radio', name: 'tipo', value: 'aqui', checked: profile.tipo === 'aqui' }), 'Comer aquí'))),
      h('div', { class: 'field' }, h('label', { for: 'f-notas' }, 'Notas del pedido (opcional)'),
        h('textarea', { id: 'f-notas', name: 'notas', rows: 2, maxLength: 300, value: profile.notas || '' })),
      state.error ? h('p', { class: 'err', role: 'alert' }, state.error) : null),
    h('footer', {},
      h('div', { class: 'sum' }, h('span', {}, 'Total'), h('span', {}, money(total()))),
      h('button', { class: 'submit', type: 'submit', disabled: !lines.length || state.sending }, icon('whatsapp'),
        state.sending ? 'Enviando…' : 'Enviar pedido por WhatsApp'),
      h('p', { class: 'hint' }, 'Se abrirá WhatsApp con tu pedido listo. El pago se hace al recibirlo.')));
  sheet.replaceChildren(form);
}

async function submit(e) {
  e.preventDefault();
  const fd = new FormData(e.currentTarget);
  const perfil = { nombre: fd.get('nombre'), telefono: fd.get('telefono'), tipo: fd.get('tipo') };
  saveJson(PROFILE_KEY, perfil);
  renderSheet({ sending: true });
  try {
    const r = await api('/api/orders', { method: 'POST', body: {
      ...perfil, notas: fd.get('notas'),
      items: [...cart].filter(([id]) => dishes.has(id)).map(([id, i]) => ({ id, cantidad: i.cantidad, nota: i.nota })),
    } });
    cart.clear(); persist();
    $('sheet').close();
    refresh();
    if (r.whatsapp_url) { toast(`Pedido #${r.folio} enviado ✓`); location.href = r.whatsapp_url; }
    else toast(`Pedido #${r.folio} recibido ✓ Te avisaremos por teléfono.`);
  } catch (err) {
    if (err instanceof ApiError && err.status === 409) await reloadMenu();
    renderSheet({ error: err.message });
  }
}

/* ---------- Carga ---------- */
async function reloadMenu() {
  ({ categorias } = await api('/api/menu'));
  dishes = new Map(categorias.flatMap((c) => c.platillos).filter((d) => !d.agotado).map((d) => [d.id, d]));
  // El carrito solo conserva lo que sigue disponible.
  for (const id of [...cart.keys()]) if (!dishes.has(id)) cart.delete(id);
  persist();
  refresh();
}

async function init() {
  cart = new Map(loadJson(CART_KEY, []).filter(([id, i]) => Number.isInteger(id) && i?.cantidad > 0));
  settings = await loadSettings();
  if (!settings.pedidos_activos) {
    $('notice').replaceChildren(h('p', { class: 'notice' }, 'Por ahora no recibimos pedidos en línea. Puedes ver el menú y llamarnos.'));
  }
  try {
    await reloadMenu();
  } catch (err) {
    console.error('[menu]', err);
    $('menu').replaceChildren(h('div', { class: 'state' }, h('h2', {}, 'No pudimos cargar el menú'),
      h('p', {}, 'Intenta de nuevo en un momento, o contáctanos directamente.'),
      h('div', { class: 'actions' },
        h('button', { class: 'pill', type: 'button', onclick: () => location.reload() }, 'Reintentar')),
      contactActions()));
  }
}

init();
