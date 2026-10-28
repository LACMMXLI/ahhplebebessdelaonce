import { h, api, ApiError, loadSettings, money, telHref, waHref, linkOrSoon } from './lib.js';
import { icon } from './icons.js';
import { embers, ripples, closeDialog, fly } from './fx.js';

const $ = (id) => document.getElementById(id);
const CART_KEY = 'plebes_cart_v1';
const PROFILE_KEY = 'plebes_profile_v1';

let settings;
let categorias = [];
let dishes = new Map();                  // id -> platillo disponible (no agotado)
let cart = new Map();                    // id -> { cantidad, nota }
let chipObserver;
let sending = false;
let redirectTimer;

/* ---------- Almacenamiento local (carrito y datos del cliente) ---------- */
const loadJson = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const saveJson = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* sin almacenamiento */ } };
const persist = () => saveJson(CART_KEY, [...cart]);

const qty = (id) => cart.get(id)?.cantidad || 0;
const count = () => [...cart.values()].reduce((s, i) => s + i.cantidad, 0);
const total = () => [...cart].reduce((s, [id, i]) => s + (dishes.get(id)?.precio || 0) * i.cantidad, 0);

function setQty(id, n, from) {
  const rect = from?.getBoundingClientRect?.();
  if (n <= 0) cart.delete(id);
  else cart.set(id, { cantidad: Math.min(n, 20), nota: cart.get(id)?.nota || '' });
  persist();
  const card = document.querySelector(`[data-dish="${id}"]`);
  if (card && dishes.has(id)) card.replaceWith(dishCard(dishes.get(id)));
  renderCartBar(Boolean(rect));
  if (rect) requestAnimationFrame(() => fly(rect, document.querySelector('#cartbar .count')));
  if (!count() && $('sheet').open && !$('sheet').querySelector('.done')) closeDialog($('sheet'));
  else if ($('sheet').open && !$('sheet').querySelector('.done')) renderSheet();
}

/* ---------- Tarjetas de platillo ---------- */
const placeholder = () => h('div', { class: 'pic ph', 'aria-hidden': 'true' }, icon('burgerGhost'));

function dishCard(d) {
  const orderable = settings.pedidos_activos && !d.agotado;
  const n = qty(d.id);
  const src = d.imagen_thumb_url || d.imagen_url;
  const control = d.agotado ? h('span', { class: 'sold' }, 'Agotado')
    : !orderable ? null
    : n === 0
      ? h('button', { class: 'add rp lift', type: 'button', onclick: (e) => setQty(d.id, 1, e.currentTarget), 'aria-label': `Agregar ${d.nombre}` }, icon('plus'), 'Agregar')
      : h('div', { class: 'step' },
        h('button', { type: 'button', onclick: () => setQty(d.id, n - 1), 'aria-label': `Quitar uno de ${d.nombre}` }, icon(n === 1 ? 'trash' : 'minus')),
        h('output', { 'aria-live': 'polite' }, String(n)),
        h('button', { type: 'button', onclick: (e) => setQty(d.id, n + 1, e.currentTarget), 'aria-label': `Agregar otro ${d.nombre}` }, icon('plus')));
  return h('article', { dataset: { dish: d.id }, class: `dish${d.agotado ? ' out' : ''}` },
    h('div', { class: 'pic-box' },
      src ? h('img', { class: 'pic', src, alt: d.nombre, loading: 'lazy', decoding: 'async', width: 112, height: 112,
        onerror: (e) => e.target.replaceWith(placeholder()) }) : placeholder()),
    h('div', { class: 'dish-body' },
      h('h3', { class: 'dish-name' }, d.nombre),
      d.descripcion ? h('p', { class: 'dish-desc' }, d.descripcion) : null,
      h('div', { class: 'dish-foot' }, h('span', { class: 'price' }, money(d.precio)), control)));
}

function contactActions() {
  const wa = waHref(settings);
  return h('div', { class: 'actions' },
    h('a', { class: 'btn-pill rp', href: telHref(settings) }, icon('phone'), 'Llamar'),
    linkOrSoon(wa, 'WhatsApp', { class: 'btn-pill green rp' }, icon('waline'), 'WhatsApp'));
}

function renderMenu() {
  const menu = $('menu');
  menu.setAttribute('aria-busy', 'false');
  if (!categorias.length) {
    menu.replaceChildren(h('div', { class: 'state' }, icon('burgerGhost', 'ico-big'), h('h2', {}, 'Menú próximamente'),
      h('p', {}, 'Estamos preparando el menú digital. Mientras tanto, llámanos o escríbenos.'), contactActions()));
    $('chips').replaceChildren();
    return;
  }
  $('chips').replaceChildren(...categorias.map((c) =>
    h('a', { class: 'chip rp', href: `#cat-${c.id}`, onclick: (e) => {
      e.preventDefault();
      document.getElementById(`cat-${c.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } }, c.nombre)));
  menu.replaceChildren(...categorias.map((c) =>
    h('section', { id: `cat-${c.id}`, class: 'cat' },
      h('div', { class: 'cat-h' }, h('h2', {}, c.nombre), h('span', {}, `${c.platillos.length} ${c.platillos.length === 1 ? 'opción' : 'opciones'}`)),
      h('div', { class: 'dishes' }, c.platillos.map(dishCard)))));
  observeChips();
}

function observeChips() {
  chipObserver?.disconnect();
  const chips = [...document.querySelectorAll('.chip')];
  const mark = (id) => {
    chips.forEach((c) => c.classList.toggle('on', c.getAttribute('href') === `#${id}`));
    chips.find((c) => c.classList.contains('on'))?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
  };
  chipObserver = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) mark(e.target.id);
  }, { rootMargin: '-140px 0px -65% 0px' });
  document.querySelectorAll('.cat').forEach((s) => chipObserver.observe(s));
  if (categorias[0]) mark(`cat-${categorias[0].id}`);
}

function renderCartBar(bump = false) {
  const bar = $('cartbar');
  if (!count() || !settings.pedidos_activos) { bar.hidden = true; bar.replaceChildren(); return; }
  const wasHidden = bar.hidden;
  bar.hidden = false;
  const btn = h('button', { type: 'button', class: 'rp', onclick: openSheet, 'aria-label': `Ver mi pedido, ${count()} artículos, ${money(total())}` },
    h('span', { class: 'count' }, String(count())), icon('cart'), 'Ver mi pedido', h('span', { class: 'tot' }, money(total())));
  if (!wasHidden) { btn.style.animation = 'none'; if (bump) requestAnimationFrame(() => { btn.style.animation = ''; btn.classList.add('bump'); }); }
  bar.replaceChildren(btn);
}

function refresh() {
  renderMenu();
  renderCartBar();
  if ($('sheet').open && !$('sheet').querySelector('.done')) renderSheet();
}

/* ---------- Hoja del pedido ---------- */
function openSheet() {
  const sheet = $('sheet');
  renderSheet();
  if (!sheet.open) {
    sheet.showModal();
    document.documentElement.style.overflow = 'hidden';
  }
}

function renderSheet(state = {}) {
  const sheet = $('sheet');
  const profile = { nombre: '', telefono: '', tipo: 'llevar', notas: '', ...loadJson(PROFILE_KEY, {}) };
  const keep = sheet.querySelector('form');
  if (keep) Object.assign(profile, Object.fromEntries(new FormData(keep)));

  const lines = [...cart].filter(([id]) => dishes.has(id)).map(([id, item]) => {
    const d = dishes.get(id);
    const src = d.imagen_thumb_url || d.imagen_url;
    return h('div', { class: 'li' },
      src ? h('img', { class: 'li-pic', src, alt: '', width: 52, height: 52, onerror: (e) => e.target.remove() }) : h('div', { class: 'li-pic' }, icon('burgerGhost')),
      h('div', {}, h('div', { class: 'nm' }, d.nombre), h('div', { class: 'pr' }, money(d.precio * item.cantidad))),
      h('div', { class: 'step' },
        h('button', { type: 'button', onclick: () => setQty(id, item.cantidad - 1), 'aria-label': `Quitar uno de ${d.nombre}` }, icon(item.cantidad === 1 ? 'trash' : 'minus')),
        h('output', {}, String(item.cantidad)),
        h('button', { type: 'button', onclick: () => setQty(id, item.cantidad + 1), 'aria-label': `Agregar otro ${d.nombre}` }, icon('plus'))),
      h('input', { type: 'text', maxLength: 120, placeholder: 'Nota (ej. sin cebolla)', value: item.nota, 'aria-label': `Nota para ${d.nombre}`,
        oninput: (e) => { const it = cart.get(id); if (it) { it.nota = e.target.value; persist(); } } }));
  });

  const form = h('form', { class: 'sheet-card', onsubmit: submit },
    h('div', { class: 'sheet-head' }, h('h2', { id: 'sheet-title' }, 'Tu pedido'),
      h('button', { class: 'x rp', type: 'button', onclick: closeSheet, 'aria-label': 'Cerrar' }, icon('close'))),
    h('div', { class: 'sheet-body' },
      ...(lines.length ? lines : [h('div', { class: 'empty-cart' }, 'Tu pedido está vacío.')]),
      h('div', { class: 'fld' }, h('label', { for: 'f-nombre' }, 'Tu nombre'),
        h('input', { id: 'f-nombre', name: 'nombre', required: true, maxLength: 60, autocomplete: 'name', value: profile.nombre })),
      h('div', { class: 'fld' }, h('label', { for: 'f-tel' }, 'Teléfono (opcional)'),
        h('input', { id: 'f-tel', name: 'telefono', type: 'tel', maxLength: 25, autocomplete: 'tel', inputMode: 'tel', value: profile.telefono })),
      h('fieldset', { class: 'fld' }, h('legend', {}, '¿Cómo lo quieres?'),
        h('div', { class: 'seg' },
          h('label', {}, h('input', { type: 'radio', name: 'tipo', value: 'llevar', checked: profile.tipo !== 'aqui' }), 'Para llevar'),
          h('label', {}, h('input', { type: 'radio', name: 'tipo', value: 'aqui', checked: profile.tipo === 'aqui' }), 'Comer aquí'))),
      h('div', { class: 'fld' }, h('label', { for: 'f-notas' }, 'Notas del pedido (opcional)'),
        h('textarea', { id: 'f-notas', name: 'notas', rows: 2, maxLength: 300, value: profile.notas || '' })),
      state.error ? h('p', { class: 'err', role: 'alert' }, state.error) : null),
    h('div', { class: 'sheet-foot' },
      h('div', { class: 'sum' }, h('span', {}, 'Total'), h('span', {}, money(total()))),
      h('button', { class: 'submit rp', type: 'submit', disabled: !lines.length || state.sending },
        state.sending ? h('span', { class: 'spin', 'aria-hidden': 'true' }) : icon('waline'),
        state.sending ? 'Enviando…' : 'Enviar pedido por WhatsApp'),
      h('p', { class: 'hint' }, 'Se abrirá WhatsApp con tu pedido listo. El pago se hace al recibirlo.')));
  sheet.replaceChildren(form);
}

function closeSheet() {
  clearTimeout(redirectTimer);
  closeDialog($('sheet'));
}

async function submit(e) {
  e.preventDefault();
  if (sending) return;
  const fd = new FormData(e.currentTarget);
  const perfil = { nombre: String(fd.get('nombre')).trim(), telefono: String(fd.get('telefono')).trim(), tipo: fd.get('tipo') };
  if (!perfil.nombre) { renderSheet({ error: 'Escribe tu nombre para el pedido.' }); return; }
  saveJson(PROFILE_KEY, perfil);
  sending = true;
  renderSheet({ sending: true });
  try {
    const r = await api('/api/orders', { method: 'POST', body: {
      ...perfil, notas: fd.get('notas'),
      items: [...cart].filter(([id]) => dishes.has(id)).map(([id, i]) => ({ id, cantidad: i.cantidad, nota: i.nota })),
    } });
    cart.clear(); persist();
    renderMenu(); renderCartBar();
    showDone(r);
  } catch (err) {
    if (err instanceof ApiError && err.status === 409) await reloadMenu().catch(() => {});
    renderSheet({ error: err.message });
  } finally {
    sending = false;
  }
}

function showDone(r) {
  const sheet = $('sheet');
  const wa = r.whatsapp_url;
  sheet.replaceChildren(h('div', { class: 'sheet-card done' },
    h('div', { class: 'check' }, icon('check')),
    h('h2', { id: 'sheet-title' }, '¡Pedido enviado!'),
    h('span', { class: 'folio' }, `Folio #${r.folio} · ${money(r.total)}`),
    h('p', {}, wa ? 'Abriremos WhatsApp para que nos mandes tu pedido y lo confirmemos.' : 'Recibimos tu pedido. Te confirmaremos por teléfono.'),
    wa ? h('a', { class: 'btn-pill green rp', href: wa, target: '_blank', rel: 'noopener noreferrer' }, icon('waline'), 'Abrir WhatsApp') : null,
    h('button', { class: 'btn-pill rp', type: 'button', onclick: closeSheet }, 'Seguir viendo el menú')));
  if (wa) redirectTimer = setTimeout(() => { if (sheet.open) location.href = wa; }, 1800);
}

/* ---------- Carga ---------- */
async function reloadMenu() {
  ({ categorias } = await api('/api/menu'));
  dishes = new Map(categorias.flatMap((c) => c.platillos).filter((d) => !d.agotado).map((d) => [d.id, d]));
  for (const id of [...cart.keys()]) if (!dishes.has(id)) cart.delete(id); // solo lo que sigue disponible
  persist();
  refresh();
}

async function init() {
  embers(); ripples();
  $('sheet').addEventListener('close', () => { document.documentElement.style.overflow = ''; clearTimeout(redirectTimer); });
  $('sheet').addEventListener('click', (e) => { if (e.target === $('sheet')) closeSheet(); }); // clic en el fondo
  cart = new Map(loadJson(CART_KEY, []).filter(([id, i]) => Number.isInteger(id) && i?.cantidad > 0));
  settings = await loadSettings();
  const live = $('live');
  live.hidden = false;
  live.textContent = settings.pedidos_activos ? 'Pedidos en línea' : 'Solo consulta';
  live.classList.toggle('off', !settings.pedidos_activos);
  if (!settings.pedidos_activos) {
    $('notice').replaceChildren(h('p', { class: 'notice' }, 'Por ahora no recibimos pedidos en línea. Puedes ver el menú y llamarnos.'));
  }
  try {
    await reloadMenu();
  } catch (err) {
    console.error('[menu]', err);
    $('menu').setAttribute('aria-busy', 'false');
    $('menu').replaceChildren(h('div', { class: 'state' }, icon('burgerGhost', 'ico-big'), h('h2', {}, 'No pudimos cargar el menú'),
      h('p', {}, 'Revisa tu conexión e inténtalo de nuevo, o contáctanos directamente.'),
      h('div', { class: 'actions' }, h('button', { class: 'btn-pill rp', type: 'button', onclick: () => location.reload() }, 'Reintentar')),
      contactActions()));
  }
}

init();
