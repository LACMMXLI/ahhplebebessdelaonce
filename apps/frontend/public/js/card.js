import { h, loadSettings, safeUrl, telHref, waHref, toast, linkOrSoon, DEFAULT_SETTINGS } from './lib.js';
import { icon } from './icons.js';
import { embers, reveal, ripples } from './fx.js';

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
  const data = { title: s.nombre, text: `¡Conoce ${s.nombre}!`, url: `${location.origin}/` };
  if (navigator.share) {
    try { await navigator.share(data); return; } catch (e) { if (e.name === 'AbortError') return; }
  }
  try { await navigator.clipboard.writeText(data.url); toast('Enlace copiado ✓'); }
  catch { toast(`Comparte este enlace: ${data.url}`); }
}

const chev = () => h('span', { class: 'chev' }, icon('chevron'));
const external = { target: '_blank', rel: 'noopener noreferrer' };
let first = true;

function render(s) {
  const wa = waHref(s);
  const social = [
    ['facebook', 'Facebook', safeUrl(s.facebook)],
    ['whatsapp', 'WhatsApp', wa],
    ['tiktok', 'TikTok', safeUrl(s.tiktok)],
    ['instagram', 'Instagram', safeUrl(s.instagram)],
    ['youtube', 'YouTube', safeUrl(s.youtube)],
  ]; // todas se muestran; las que aún no tienen enlace avisan "muy pronto"

  const maps = safeUrl(s.maps) || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(s.direccion)}`;
  const [l1, l2] = s.slogan.split(/(?<=\.)\s+/);

  const nodes = [
    h('h1', { class: 'title' }, s.nombre),
    h('p', { class: 'cats' }, 'BURGERS · BURRITOS · HOT DOGS · SNACKS'),
    h('i', { class: 'rule', 'aria-hidden': 'true' }),
    h('p', { class: 'slogan' }, l1, l2 ? [h('br'), l2] : null),
    h('p', { class: 'hours' }, icon('clock'), s.horario || 'Horario próximamente'),
    h('nav', { class: 'tiles rv', 'aria-label': 'Redes sociales' }, social.map(([k, label, href]) =>
      linkOrSoon(href, label, { class: `tile ${k} rp lift` }, icon(k), label))),
    h('a', { class: 'cta rp lift rv', href: 'menu/' },
      icon('burger', 'cta-ico'),
      h('span', { class: 'cta-txt' }, h('b', {}, 'Ver menú digital'),
        h('small', {}, s.pedidos_activos ? 'Descubre todos nuestros platillos y pide' : 'Descubre todos nuestros platillos')),
      icon('burgerGhost', 'cta-ghost'), chev()),
    h('div', { class: 'duo rv' },
      h('a', { class: 'pill rp lift', href: telHref(s) }, icon('phone'),
        h('span', {}, h('b', {}, 'Llamar ahora'), h('small', {}, s.telefono)), chev()),
      linkOrSoon(wa, 'WhatsApp', { class: 'pill wa rp lift' }, icon('waline'),
        h('span', {}, h('b', {}, 'WhatsApp'), h('small', {}, s.telefono)), chev())),
    h('a', { class: 'row row-map first rp lift rv', href: maps, ...external },
      h('span', { class: 'row-ico pin' }, icon('pin')),
      h('span', { class: 'row-txt' }, h('b', {}, 'Cómo llegar'), h('small', {}, s.direccion)),
      icon('map', 'art'), chev()),
    h('button', { class: 'row row-vcard rp lift rv', type: 'button', onclick: () => vcard(s) },
      h('span', { class: 'row-ico' }, icon('user')),
      h('span', { class: 'row-txt' }, h('b', {}, 'Guardar contacto'), h('small', {}, 'Agrega nuestros datos a tu celular')),
      icon('phoneArt', 'art'), chev()),
    h('button', { class: 'row row-share rp lift rv', type: 'button', onclick: () => share(s) },
      h('span', { class: 'row-ico' }, icon('share')),
      h('span', { class: 'row-txt' }, h('b', {}, 'Compartir tarjeta'), h('small', {}, 'Comparte nuestro restaurante')),
      icon('arrowArt', 'art'), chev()),
    h('div', { class: 'sign rv' },
      h('span', { class: 'sign-txt' }, h('span', { class: 'script' }, 'El antojo siempre sabe mejor'), icon('underline', 'sign-line')),
      icon('crown', 'crown')),
  ];
  root.replaceChildren(...nodes.filter(Boolean));
  document.title = `${s.nombre} · Tarjeta digital`;
  // El título y el eslogan ya están en pantalla; el resto aparece escalonado al hacer scroll.
  if (first) { first = false; reveal(root); } else root.querySelectorAll('.rv').forEach((el) => { el.classList.add('in'); el.style.animation = 'none'; el.style.opacity = '1'; el.style.transform = 'none'; });
}

embers();
ripples();
// Pinta al instante con los datos por defecto (la tarjeta funciona aunque el backend esté caído)
// y se actualiza en cuanto el servidor responde.
render(DEFAULT_SETTINGS);
loadSettings().then(render);
