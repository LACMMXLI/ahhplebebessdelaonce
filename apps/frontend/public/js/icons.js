// SVG estáticos y de confianza (constantes del código, nunca datos del usuario).
const S = (inner, extra = 'fill="currentColor"') =>
  `<svg viewBox="0 0 24 24" ${extra} aria-hidden="true">${inner}</svg>`;
const STROKE = 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';

const ICONS = {
  facebook: S('<path d="M13.9 22v-8.4h2.8l.5-3.4h-3.3V8c0-1 .3-1.6 1.7-1.6h1.7v-3a23 23 0 0 0-2.5-.2c-2.5 0-4.2 1.5-4.2 4.3v2.4H8v3.4h2.6V22h3.3Z"/>'),
  whatsapp: S('<path d="M20.3 11.6a8.3 8.3 0 0 1-12.5 7.1L3 20l1.3-4.7A8.3 8.3 0 1 1 20.3 11.6Z"/><path d="M9 8.2c-.4-.8-.8-.8-1.1-.7-.7.2-1.1 1-1.1 1.8 0 1.6 2.7 4.9 5.3 5.9 2.5 1 3.1.3 3.5-.5.1-.3.2-.7.1-.9-.3-.5-1.9-1.2-2.1-1.1-.3.2-.6.8-1 1-.4.2-1.1-.3-1.8-.9s-1.2-1.4-1.1-1.7c.1-.3.6-.7.7-1.1 0-.4-.8-2.3-1.2-2.5Z"/>', 'fill="none" stroke="currentColor" stroke-width="1.75" stroke-linejoin="round" stroke-linecap="round"'),
  tiktok: S('<path d="M16 2h-3v13a3 3 0 1 1-3.2-3V9A6 6 0 1 0 16 15V7a7 7 0 0 0 5 2V6a5 5 0 0 1-5-4Z"/>'),
  instagram: S('<rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.3" cy="6.7" r=".6" fill="currentColor"/>', STROKE),
  youtube: S('<path d="M21 7.5a3 3 0 0 0-2.1-2.1C17.1 5 12 5 12 5s-5.1 0-6.9.4A3 3 0 0 0 3 7.5 30 30 0 0 0 2.6 12a30 30 0 0 0 .4 4.5 3 3 0 0 0 2.1 2.1C6.9 19 12 19 12 19s5.1 0 6.9-.4a3 3 0 0 0 2.1-2.1 30 30 0 0 0 .4-4.5 30 30 0 0 0-.4-4.5ZM10 15.5v-7l6 3.5-6 3.5Z"/>'),
  phone: S('<path d="M6.5 2.7 10 2a2 2 0 0 1 2.3 1.5l.9 3.7a2 2 0 0 1-.7 2L10.3 11a15 15 0 0 0 2.7 2.7l1.8-2.2a2 2 0 0 1 2-.7l3.7.9a2 2 0 0 1 1.5 2.3l-.7 3.5a2 2 0 0 1-2 1.6C10.9 19.1 4.9 13.1 4.9 4.7a2 2 0 0 1 1.6-2Z"/>'),
  pin: S('<path d="M12 21s7-6.1 7-11.5A7 7 0 0 0 5 9.5C5 14.9 12 21 12 21Z"/><circle cx="12" cy="9.5" r="2.5"/>', STROKE),
  user: S('<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>', STROKE),
  share: S('<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4"/>', STROKE),
  burger: S('<path d="M4 11a8 6 0 0 1 16 0Z"/><path d="M3 15h18M4 18.5h16a0 0 0 0 1 0 0 2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 18.5Z"/>', STROKE),
  cart: S('<circle cx="9" cy="20" r="1.4"/><circle cx="18" cy="20" r="1.4"/><path d="M2 3h3l2.6 12.4a1 1 0 0 0 1 .8h9.2a1 1 0 0 0 1-.8L21 7H6"/>', STROKE),
  plus: S('<path d="M12 5v14M5 12h14"/>', STROKE),
  minus: S('<path d="M5 12h14"/>', STROKE),
  trash: S('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>', STROKE),
  chevron: S('<path d="m9 6 6 6-6 6"/>', STROKE),
  back: S('<path d="m15 6-6 6 6 6"/>', STROKE),
  close: S('<path d="M6 6l12 12M18 6 6 18"/>', STROKE),
  image: S('<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="m21 16-5-5-9 9"/>', STROKE),
};

export function icon(name) {
  const t = document.createElement('template');
  t.innerHTML = ICONS[name] || '';
  const el = t.content.firstElementChild;
  if (el) el.classList.add('ico');
  return el;
}
