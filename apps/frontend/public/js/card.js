import { h, loadSettings, safeUrl, telHref, waHref, toast, DEFAULT_SETTINGS } from './lib.js';
import { icon } from './icons.js';

const root = document.getElementById('card');

function vcard(s) {
  const esc = (v) => String(v || '').replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/[,;]/g, (c) => `\\${c}`);
  const wa = String(s.whatsapp || '').replace(/\D/g, '');
  const rows = ['BEGIN:VCARD', 'VERSION:3.0', `FN:${esc(s.nombre)}`, `ORG:${esc(s.nombre)}`,
    `TEL;TYPE=WORK,VOICE:${esc(telHref(s).slice(4))}`];
  if (wa) rows.push(`TEL;TYPE=CELL:+${wa}`);
  rows.push(`ADR;TYPE=WORK:;;${esc(s.direccion)};;;;`, `URL:${location.origin}/`);
  for (const k of ['facebook', 'instagram', 'tiktok', 'youtube']) {
    const u = safeUrl(s[k]);
    if (u) rows.push(`URL;TYPE=${k}:${u}`);
  }
  rows.push('END:VCARD');
  const blob = new Blob([`${rows.join('\r\n')}\r\n`], { type: 'text/vcard;charset=utf-8' });
  const a = h('a', { href: URL.createObjectURL(blob), download: 'Ahh-Plebes-de-la-Once.vcf' });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 3000);
  toast('Contacto listo para guardar ✓');
}

async function share(s) {
  const data = { title: s.nombre, text: `¡Conoce ${s.nombre}!`, url: location.origin + '/' };
  if (navigator.share) {
    try { await navigator.share(data); return; } catch (e) { if (e.name === 'AbortError') return; }
  }
  try { await navigator.clipboard.writeText(data.url); toast('Enlace copiado ✓'); }
  catch { toast(`Comparte este enlace: ${data.url}`); }
}

const link = (props, ...kids) => h('a', props, ...kids);

function render(s) {
  const wa = waHref(s);
  const socialDefs = [
    ['facebook', 'Facebook', safeUrl(s.facebook)],
    ['tiktok', 'TikTok', safeUrl(s.tiktok)],
    ['instagram', 'Instagram', safeUrl(s.instagram)],
    ['youtube', 'YouTube', safeUrl(s.youtube)],
  ].filter(([, , href]) => href); // lo que no tiene enlace no se muestra

  const maps = safeUrl(s.maps) || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(s.direccion)}`;
  const nodes = [
    h('h1', { class: 'title' }, s.nombre),
    h('div', { class: 'categories' }, 'BURGERS · BURRITOS · HOT DOGS · SNACKS'),
    h('div', { class: 'line', 'aria-hidden': 'true' }),
    h('p', { class: 'slogan' }, ...s.slogan.split('. ').map((t, i, a) => [t + (i < a.length - 1 ? '.' : ''), i < a.length - 1 ? h('br') : null])),
    s.horario ? h('p', { class: 'horario' }, `🕒 ${s.horario}`) : null,
    socialDefs.length
      ? h('nav', { class: 'socials', 'aria-label': 'Redes sociales' }, socialDefs.map(([k, label, href]) =>
        link({ class: `social ${k}`, href, target: '_blank', rel: 'noopener noreferrer' }, icon(k), label)))
      : null,
    link({ class: 'big cta-menu', href: 'menu/' },
      icon('burger'),
      h('span', {}, h('strong', {}, 'Ver menú digital'), h('small', {}, s.pedidos_activos ? 'Arma tu pedido y envíalo por WhatsApp' : 'Descubre todos nuestros platillos')),
      h('span', { class: 'chev' }, icon('chevron'))),
    h('div', { class: 'pair' },
      link({ class: 'big', href: telHref(s) }, icon('phone'),
        h('span', {}, h('strong', {}, 'Llamar ahora'), h('small', {}, s.telefono))),
      wa ? link({ class: 'big wa', href: wa, target: '_blank', rel: 'noopener noreferrer' }, icon('whatsapp'),
        h('span', {}, h('strong', {}, 'WhatsApp'), h('small', {}, s.telefono))) : null),
    link({ class: 'big info first', href: maps, target: '_blank', rel: 'noopener noreferrer' },
      h('span', { class: 'sym red' }, icon('pin')),
      h('span', {}, h('strong', {}, 'Cómo llegar'), h('small', {}, s.direccion)),
      h('span', { class: 'chev' }, icon('chevron'))),
    h('button', { class: 'big info', type: 'button', onclick: () => vcard(s) },
      h('span', { class: 'sym blue' }, icon('user')),
      h('span', {}, h('strong', {}, 'Guardar contacto'), h('small', {}, 'Agrega nuestros datos a tu celular')),
      h('span', { class: 'chev' }, icon('chevron'))),
    h('button', { class: 'big info', type: 'button', onclick: () => share(s) },
      h('span', { class: 'sym purple' }, icon('share')),
      h('span', {}, h('strong', {}, 'Compartir tarjeta'), h('small', {}, 'Comparte nuestro restaurante')),
      h('span', { class: 'chev' }, icon('chevron'))),
    h('div', { class: 'footer' }, 'El antojo siempre sabe mejor ✨'),
  ];
  root.replaceChildren(...nodes.filter(Boolean));
  document.title = `${s.nombre} · Tarjeta digital`;
}

// Pinta al instante con los datos por defecto (la tarjeta funciona aunque el backend esté caído)
// y se actualiza en cuanto el servidor responde.
render(DEFAULT_SETTINGS);
loadSettings().then(render);
