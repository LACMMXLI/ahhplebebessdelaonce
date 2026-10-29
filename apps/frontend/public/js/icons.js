// SVG estáticos y de confianza (constantes del código, nunca datos del usuario).
const V = (inner, vb = '0 0 24 24', extra = '') => `<svg viewBox="${vb}" ${extra} aria-hidden="true" focusable="false">${inner}</svg>`;
const STROKE = 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';
const NOTE = 'M16 2h-3v13a3 3 0 1 1-3.2-3V9A6 6 0 1 0 16 15V7a7 7 0 0 0 5 2V6a5 5 0 0 1-5-4Z';

const ICONS = {
  /* ---- Marcas a color (iguales al diseño original) ---- */
  facebook: V('<circle cx="24" cy="24" r="22" fill="#1877F2"/><path fill="#fff" d="M26.6 38V26.2h3.9l.6-4.6h-4.5v-2.9c0-1.3.4-2.2 2.3-2.2h2.4v-4.1c-.4-.1-1.9-.2-3.5-.2-3.5 0-5.8 2.1-5.8 6v3.4h-3.9v4.6h3.9V38z"/>', '0 0 48 48'),
  whatsapp: V('<circle cx="24" cy="24" r="22" fill="#25D366"/><g transform="translate(9 9) scale(1.25)" fill="none" stroke="#fff" stroke-width="1.7" stroke-linejoin="round" stroke-linecap="round"><path d="M20.3 11.6a8.3 8.3 0 0 1-12.5 7.1L3 20l1.3-4.7A8.3 8.3 0 1 1 20.3 11.6Z"/><path d="M9 8.2c-.4-.8-.8-.8-1.1-.7-.7.2-1.1 1-1.1 1.8 0 1.6 2.7 4.9 5.3 5.9 2.5 1 3.1.3 3.5-.5.1-.3.2-.7.1-.9-.3-.5-1.9-1.2-2.1-1.1-.3.2-.6.8-1 1-.4.2-1.1-.3-1.8-.9s-1.2-1.4-1.1-1.7c.1-.3.6-.7.7-1.1 0-.4-.8-2.3-1.2-2.5Z"/></g>', '0 0 48 48'),
  tiktok: V(`<rect width="48" height="48" rx="12" fill="#0b0b0f"/><g transform="translate(9 9) scale(1.25)"><path d="${NOTE}" fill="#25f4ee" transform="translate(-.7 -.5)"/><path d="${NOTE}" fill="#fe2c55" transform="translate(.7 .5)"/><path d="${NOTE}" fill="#fff"/></g>`, '0 0 48 48'),
  youtube: V('<rect x="2" y="9" width="44" height="30" rx="9" fill="#f00"/><path fill="#fff" d="M19.5 17v14l12-7z"/>', '0 0 48 48'),
  instagram: V('<defs><linearGradient id="igg" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#fdc468"/><stop offset=".45" stop-color="#e1306c"/><stop offset="1" stop-color="#7a3fd4"/></linearGradient></defs><rect width="48" height="48" rx="13" fill="url(#igg)"/><rect x="12" y="12" width="24" height="24" rx="7" fill="none" stroke="#fff" stroke-width="3"/><circle cx="24" cy="24" r="5.6" fill="none" stroke="#fff" stroke-width="3"/><circle cx="31.2" cy="16.8" r="1.8" fill="#fff"/>', '0 0 48 48'),
  google: V('<path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>', '0 0 24 24'),
  star: V('<path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" fill="#ffc83a"/>', '0 0 24 24'),

  /* ---- Iconos de línea ---- */
  phone: V('<path d="M6.5 2.7 10 2a2 2 0 0 1 2.3 1.5l.9 3.7a2 2 0 0 1-.7 2L10.3 11a15 15 0 0 0 2.7 2.7l1.8-2.2a2 2 0 0 1 2-.7l3.7.9a2 2 0 0 1 1.5 2.3l-.7 3.5a2 2 0 0 1-2 1.6C10.9 19.1 4.9 13.1 4.9 4.7a2 2 0 0 1 1.6-2Z"/>', '0 0 24 24', 'fill="currentColor"'),
  waline: V('<path d="M20.3 11.6a8.3 8.3 0 0 1-12.5 7.1L3 20l1.3-4.7A8.3 8.3 0 1 1 20.3 11.6Z"/><path d="M9 8.2c-.4-.8-.8-.8-1.1-.7-.7.2-1.1 1-1.1 1.8 0 1.6 2.7 4.9 5.3 5.9 2.5 1 3.1.3 3.5-.5.1-.3.2-.7.1-.9-.3-.5-1.9-1.2-2.1-1.1-.3.2-.6.8-1 1-.4.2-1.1-.3-1.8-.9s-1.2-1.4-1.1-1.7c.1-.3.6-.7.7-1.1 0-.4-.8-2.3-1.2-2.5Z"/>', '0 0 24 24', 'fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"'),
  pin: V('<defs><linearGradient id="pg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff6b5e"/><stop offset="1" stop-color="#d4141c"/></linearGradient></defs><path d="M24 4c-8 0-14 6-14 14 0 10.5 14 26 14 26s14-15.500 14-26C38 10 32 4 24 4Z" fill="url(#pg)"/><circle cx="24" cy="18" r="5.500" fill="#7d0a10" opacity=".55"/>', '0 0 48 48'),
  user: V('<defs><linearGradient id="ug" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4aa8ff"/><stop offset="1" stop-color="#1066e0"/></linearGradient></defs><rect x="3" y="3" width="42" height="42" rx="10" fill="url(#ug)"/><circle cx="24" cy="19" r="7" fill="#fff"/><path d="M10 38a14 11 0 0 1 28 0v2H10z" fill="#fff"/>', '0 0 48 48'),
  share: V('<g fill="none" stroke="#ff6ee8" stroke-width="3.2" stroke-linecap="round"><circle cx="37" cy="10" r="6"/><circle cx="11" cy="24" r="6"/><circle cx="37" cy="38" r="6"/><path d="m16.200 21 15.600-8M16.200 27l15.600 8"/></g>', '0 0 48 48'),
  burger: V('<g fill="none" stroke="#fff" stroke-width="2.600" stroke-linecap="round" stroke-linejoin="round"><path d="M10 28c0-10 10-17 22-17s22 7 22 17z"/><path d="M8 34c4 3 7-3 12 0s7-3 12 0 7-3 12 0 7-3 12 0"/><rect x="9" y="39" width="46" height="5" rx="2.500"/><path d="M10 49h44v1a8 8 0 0 1-8 8H18a8 8 0 0 1-8-8z"/></g><g fill="#fff"><ellipse cx="22" cy="19" rx="1.800" ry="1"/><ellipse cx="32" cy="16" rx="1.800" ry="1"/><ellipse cx="42" cy="19" rx="1.800" ry="1"/><ellipse cx="27" cy="24" rx="1.800" ry="1"/><ellipse cx="38" cy="24" rx="1.800" ry="1"/></g>', '0 0 64 64'),
  cart: V('<circle cx="9" cy="20" r="1.400"/><circle cx="18" cy="20" r="1.400"/><path d="M2 3h3l2.600 12.400a1 1 0 0 0 1 .8h9.200a1 1 0 0 0 1-.8L21 7H6"/>', '0 0 24 24', STROKE),
  plus: V('<path d="M12 5v14M5 12h14"/>', '0 0 24 24', STROKE),
  minus: V('<path d="M5 12h14"/>', '0 0 24 24', STROKE),
  trash: V('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>', '0 0 24 24', STROKE),
  chevron: V('<path d="m9 6 6 6-6 6"/>', '0 0 24 24', STROKE),
  back: V('<path d="m15 6-6 6 6 6"/>', '0 0 24 24', STROKE),
  close: V('<path d="M6 6l12 12M18 6 6 18"/>', '0 0 24 24', STROKE),
  check: V('<path d="m5 13 4 4L19 7"/>', '0 0 24 24', STROKE),
  image: V('<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="1.600"/><path d="m21 16-5-5-9 9"/>', '0 0 24 24', STROKE),
  search: V('<circle cx="11" cy="11" r="7"/><path d="m21 21-4.300-4.300"/>', '0 0 24 24', STROKE),
  clock: V('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>', '0 0 24 24', STROKE),
  /* navegación del panel */
  receipt: V('<path d="M5 3h14v18l-3-2-2 2-2-2-2 2-2-2-3 2z"/><path d="M9 8h6M9 12h6"/>', '0 0 24 24', STROKE),
  grid: V('<rect x="3" y="3" width="7.500" height="7.500" rx="1.500"/><rect x="13.500" y="3" width="7.500" height="7.500" rx="1.500"/><rect x="3" y="13.500" width="7.500" height="7.500" rx="1.500"/><rect x="13.500" y="13.500" width="7.500" height="7.500" rx="1.500"/>', '0 0 24 24', STROKE),
  tag: V('<path d="M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9z"/><circle cx="7.500" cy="7.500" r="1.200"/>', '0 0 24 24', STROKE),
  sliders: V('<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>', '0 0 24 24', STROKE),
  lock: V('<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>', '0 0 24 24', STROKE),
  external: V('<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>', '0 0 24 24', STROKE),
  bell: V('<path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4z"/><path d="M10 21h4"/>', '0 0 24 24', STROKE),

  /* ---- Ilustraciones decorativas del diseño ---- */
  map: V('<path d="M8 30 36 22l26 8 26-8 22 8v46l-22-8-26 8-26-8-28 8z" fill="#cfd5dc"/><path d="M8 30 36 22v46L8 76z" fill="#5fb85a"/><path d="M36 22l26 8v46L36 68z" fill="#4a9be0"/><path d="m62 30 26-8v46l-26 8z" fill="#f2c64a"/><path d="m88 22 22 8v46l-22-8z" fill="#7fc66a"/><path d="M36 22l26 8M62 30l26-8" stroke="#fff" stroke-width="1.500" opacity=".7"/><g transform="translate(62 2)"><path d="M18 0C8 0 1 7.500 1 17c0 12 17 30 17 30s17-18 17-30C35 7.500 28 0 18 0z" fill="#e0262e"/><circle cx="18" cy="17" r="6" fill="#fff"/></g>', '0 0 118 84'),
  phoneArt: V('<g transform="rotate(8 60 80)" fill="none" stroke="currentColor" stroke-width="5"><rect x="34" y="12" width="56" height="104" rx="12"/><path d="M34 28h56M34 100h56" opacity=".6"/><circle cx="62" cy="60" r="10"/><path d="M44 92c2-12 8-17 18-17s16 5 18 17" stroke-linecap="round"/></g>', '0 0 120 130'),
  arrowArt: V('<path d="M10 82c4-30 26-48 62-50V12l44 36-44 36V64c-28-2-44 6-62 18z" fill="currentColor"/>', '0 0 126 96'),
  burgerGhost: V('<g fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M10 28c0-10 10-17 22-17s22 7 22 17z"/><path d="M8 34c4 3 7-3 12 0s7-3 12 0 7-3 12 0 7-3 12 0"/><rect x="9" y="39" width="46" height="6" rx="3"/><path d="M10 50h44v1a8 8 0 0 1-8 8H18a8 8 0 0 1-8-8z"/></g>', '0 0 64 64'),
  crown: V('<path d="M6 40 4 14l14 12 10-20 10 20 14-12-2 26z" fill="none" stroke="#ffc83a" stroke-width="3.500" stroke-linejoin="round" stroke-linecap="round"/><path d="M8 46h40" stroke="#ffc83a" stroke-width="3.500" stroke-linecap="round"/><circle cx="4" cy="12" r="2.500" fill="#ffc83a"/><circle cx="28" cy="4" r="2.500" fill="#ffc83a"/><circle cx="52" cy="12" r="2.500" fill="#ffc83a"/>', '0 0 56 52'),
  underline: V('<path d="M3 14c40-9 110-12 180-8 12 1 20 1 28 0" fill="none" stroke="#e3141f" stroke-width="4.500" stroke-linecap="round" pathLength="1"/>', '0 0 214 22'),
};

export function icon(name, cls = '') {
  const t = document.createElement('template');
  t.innerHTML = ICONS[name] || '';
  const el = t.content.firstElementChild;
  if (el) { el.classList.add('ico'); if (cls) el.classList.add(...cls.split(' ')); }
  return el;
}
