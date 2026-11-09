import { h, api, ApiError, loadSettings } from './lib.js';
import { icon } from './icons.js';
import { embers, ripples, prefersReducedMotion } from './fx.js';

const root = document.getElementById('root');
const pedido = Number(new URLSearchParams(location.search).get('pedido')) || undefined;
let settings;
let redirectTimer;

const MOODS = [['😡', 'Muy mala'], ['😕', 'Mala'], ['😐', 'Regular'], ['😊', 'Buena'], ['🤩', '¡Excelente!']];

const miniStars = (n) => h('div', { class: 'mini-stars', role: 'img', 'aria-label': `${n} de 5 estrellas` },
  [1, 2, 3, 4, 5].map((i) => { const s = icon('star'); if (i > n) s.classList.add('off'); return s; }));

const checkIcon = () => icon('check');

const header = () => h('div', { class: 'g-head' },
  h('img', { src: '../assets/logo.webp', width: 44, height: 44, alt: '' }),
  h('div', {}, h('b', {}, settings.nombre), h('small', {}, 'Tu opinión nos ayuda a mejorar')));

/* ---------- 1. Elegir estrellas ---------- */
function showRate(preset = 0) {
  clearTimeout(redirectTimer);
  let chosen = preset;
  const mood = h('div', { class: 'mood', 'aria-live': 'polite' });
  const row = h('div', { class: 'stars', role: 'group', 'aria-label': 'Calificación de 1 a 5 estrellas' });
  const paint = (n, animate) => {
    [...row.children].forEach((b, i) => {
      b.classList.toggle('on', i < n);
      b.setAttribute('aria-pressed', String(i + 1 === chosen));
      if (animate && i < n) { b.classList.remove('pop'); void b.offsetWidth; b.style.animationDelay = `${i * 45}ms`; b.classList.add('pop'); }
    });
    mood.replaceChildren(...(n ? [h('b', {}, MOODS[n - 1][0]), h('span', {}, MOODS[n - 1][1])] : []));
  };
  [1, 2, 3, 4, 5].forEach((n) => row.append(h('button', {
    class: 'star rp', type: 'button', 'aria-label': `${n} ${n === 1 ? 'estrella' : 'estrellas'}: ${MOODS[n - 1][1]}`, 'aria-pressed': 'false',
    onpointerenter: (e) => { if (e.pointerType === 'mouse' && !chosen) paint(n, false); },
    onpointerleave: (e) => { if (e.pointerType === 'mouse' && !chosen) paint(0, false); },
    onfocus: () => { if (!chosen) paint(n, false); },
    onclick: () => { chosen = n; paint(n, true); setTimeout(() => choose(n), prefersReducedMotion ? 0 : 650); },
  }, icon('star'))));

  root.replaceChildren(
    header(),
    h('h1', {}, '¿Cómo calificarías tu experiencia?'),
    h('p', { class: 'r-sub' }, 'Selecciona de 1 a 5 estrellas.'),
    row, mood);
  paint(preset, false);
}

function choose(n) {
  if (n >= 4) sendHigh(n); else showForm(n);
}

/* ---------- 2a. 4-5 estrellas: se registra y se envía a Google ---------- */
async function sendHigh(n) {
  root.replaceChildren(h('div', { class: 'r-loading' }, h('span', { class: 'redir' }, h('span', { class: 'spin', 'aria-hidden': 'true' }), 'Un momento…')));
  try {
    const r = await api('/api/reviews', { method: 'POST', body: { calificacion: n, pedido } });
    showThanksHigh(n, r.url);
  } catch (e) { showError(e, () => sendHigh(n), () => showRate(n)); }
}

function showThanksHigh(n, url) {
  const nodes = [
    header(),
    miniStars(n),
    h('h2', {}, '¡Gracias por tu calificación!'),
    url
      ? h('p', { class: 'r-sub' }, 'Para publicar tu reseña te llevamos a Google, donde podrás escribirla con tu cuenta.')
      : h('p', { class: 'r-sub' }, 'Nos alegra mucho que la hayas pasado bien. ¡Te esperamos pronto!'),
    url ? h('a', { class: 'r-btn green wide rp', href: url }, 'Continuar a Google') : null,
    url ? h('p', { class: 'redir' }, h('span', { class: 'spin', 'aria-hidden': 'true' }), 'Te llevamos a Google…') : null,
    h('div', { class: 'stack' }, h('a', { class: 'r-btn ghost wide rp', href: '../' }, 'Volver al inicio')),
  ].filter(Boolean);
  root.replaceChildren(...nodes);
  if (url) redirectTimer = setTimeout(() => { location.href = url; }, 2200);
}

/* ---------- 2b. 1-3 estrellas: retroalimentación interna ---------- */
function showForm(n) {
  const err = h('p', { class: 'err', role: 'alert', hidden: true });
  const area = h('textarea', { id: 'f-msg', name: 'comentario', maxLength: 1000, rows: 5, placeholder: 'Comparte detalles de tu experiencia…' });
  const counter = h('div', { class: 'count' }, '0 / 1000');
  area.addEventListener('input', () => { counter.textContent = `${area.value.length} / 1000`; });
  const btn = h('button', { class: 'r-btn rp', type: 'submit' }, 'Enviar');
  const form = h('form', { class: 'fb', onsubmit: async (e) => {
    e.preventDefault();
    err.hidden = true; btn.disabled = true; btn.replaceChildren(h('span', { class: 'spin', 'aria-hidden': 'true' }), 'Enviando…');
    const fd = new FormData(form);
    try {
      await api('/api/reviews', { method: 'POST', body: {
        calificacion: n, comentario: fd.get('comentario'), nombre: fd.get('nombre'), contacto: fd.get('contacto'), pedido } });
      showThanksLow();
    } catch (ex) {
      err.textContent = ex.message; err.hidden = false; btn.disabled = false; btn.textContent = 'Enviar';
    }
  } },
    h('div', { class: 'fld' }, h('label', { for: 'f-msg' }, 'Tu mensaje'), area, counter),
    h('div', { class: 'fld' }, h('label', { for: 'f-nom' }, 'Tu nombre (opcional)'),
      h('input', { id: 'f-nom', name: 'nombre', maxLength: 60, autocomplete: 'name' })),
    h('div', { class: 'fld' }, h('label', { for: 'f-con' }, 'Teléfono o correo, si quieres que te contactemos (opcional)'),
      h('input', { id: 'f-con', name: 'contacto', maxLength: 60, autocomplete: 'tel' })),
    h('p', { class: 'note' }, 'Tu mensaje se envía directamente al negocio como retroalimentación. No se publica en Google.'),
    err,
    h('div', { class: 'acts' },
      h('button', { class: 'r-btn ghost rp', type: 'button', onclick: () => showRate(0) }, 'Cancelar'), btn));
  root.replaceChildren(
    header(),
    miniStars(n),
    h('h2', {}, 'Lamentamos que no haya sido perfecta'),
    h('p', { class: 'r-sub' }, 'Cuéntanos qué pasó y cómo podemos mejorar.'),
    form);
  area.focus({ preventScroll: true });
}

function showThanksLow() {
  root.replaceChildren(
    header(),
    h('div', { class: 'bigcheck' }, checkIcon()),
    h('h2', {}, 'Gracias por tu honestidad'),
    h('p', { class: 'r-sub' }, 'Recibimos tus comentarios y los vamos a revisar para mejorar. Esperamos verte de nuevo pronto.'),
    h('div', { class: 'stack' }, h('a', { class: 'r-btn ghost wide rp', href: '../' }, 'Volver al inicio')));
}

function showError(e, retry, back) {
  root.replaceChildren(
    header(),
    h('h2', {}, 'No pudimos registrar tu opinión'),
    h('p', { class: 'r-sub' }, e instanceof ApiError ? e.message : 'Inténtalo de nuevo en un momento.'),
    h('div', { class: 'stack' },
      h('button', { class: 'r-btn wide rp', type: 'button', onclick: retry }, 'Reintentar'),
      h('button', { class: 'r-btn ghost wide rp', type: 'button', onclick: back }, 'Volver')));
}

embers(); ripples();
settings = await loadSettings();
document.title = `Califica tu experiencia · ${settings.nombre}`;
showRate();
