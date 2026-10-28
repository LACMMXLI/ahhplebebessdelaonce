/* Utilidades compartidas. Todo el contenido dinámico se inserta con textContent (nunca innerHTML)
   para que nombres de clientes o platillos no puedan inyectar HTML. */

export const h = (tag, props = {}, ...children) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k in el) el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  el.append(...children.flat(Infinity).filter((c) => c != null && c !== false));
  return el;
};

export const money = (n) =>
  new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: Number.isInteger(Number(n)) ? 0 : 2 }).format(Number(n) || 0);

/** Solo deja pasar enlaces http(s). */
export const safeUrl = (v) => {
  try {
    const u = new URL(v);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : null;
  } catch { return null; }
};

/* ---------- API ---------- */
const base = (window.APP_CONFIG?.apiUrl || '').replace(/\/$/, '');

export class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

export async function api(path, { method = 'GET', body, form, token, timeout = 10000 } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload;
  if (form) payload = form;
  else if (body !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  let res;
  try {
    res = await fetch(base + path, { method, headers, body: payload, signal: ctrl.signal });
  } catch {
    throw new ApiError(0, 'No hay conexión con el servidor. Intenta de nuevo en un momento.');
  } finally {
    clearTimeout(timer);
  }
  if (res.status === 204) return null;
  let data = null;
  try { data = await res.json(); } catch { /* respuesta sin cuerpo JSON */ }
  if (!res.ok) throw new ApiError(res.status, data?.error || `Error ${res.status}`);
  return data;
}

/* ---------- Ajustes del negocio, con respaldo si el backend no responde ---------- */
export const DEFAULT_SETTINGS = {
  nombre: 'Ahh Plebes de la Once',
  slogan: 'Andamos al cien mi gente bonita. Hay que pasárnosla bien.',
  telefono: '686 202 9161',
  whatsapp: '526862029161',
  direccion: 'Prolongación H. Colegio Militar #1242, Col. Voluntad, Mexicali, B.C.',
  maps: 'https://www.google.com/maps/search/?api=1&query=Prolongaci%C3%B3n%20H%20Colegio%20Militar%201242%20Colonia%20Voluntad%20Mexicali%20Baja%20California',
  facebook: '', tiktok: '', instagram: '',
  youtube: 'https://www.youtube.com/@michingontb3',
  horario: '',
  pedidos_activos: true,
};

const CACHE_KEY = 'plebes_settings_v1';

export async function loadSettings() {
  try {
    const s = await api('/api/settings', { timeout: 6000 });
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(s)); } catch { /* sin almacenamiento */ }
    return { ...DEFAULT_SETTINGS, ...s, online: true };
  } catch {
    let cached = {};
    try { cached = JSON.parse(localStorage.getItem(CACHE_KEY)) || {}; } catch { /* ignorar */ }
    return { ...DEFAULT_SETTINGS, ...cached, online: false };
  }
}

export const telHref = (s) => `tel:${String(s.telefono).replace(/[^+\d]/g, '').replace(/^(\d{10})$/, '+52$1')}`;
export const waHref = (s, text) => {
  const d = String(s.whatsapp || '').replace(/\D/g, '');
  return d ? `https://wa.me/${d}${text ? `?text=${encodeURIComponent(text)}` : ''}` : null;
};

/* ---------- Enlace que siempre se ve ----------
   Si hay dirección es un <a>; si todavía no la hay, el icono se muestra igual como botón
   (nunca un enlace roto) y al tocarlo avisa que pronto estará disponible. */
export function linkOrSoon(href, label, props, ...children) {
  if (href) return h('a', { ...props, href, target: '_blank', rel: 'noopener noreferrer' }, ...children);
  return h('button', {
    ...props, type: 'button', class: `${props.class} is-empty`, 'aria-label': `${label}: aún no disponible`,
    onclick: () => toast(`${label} estará disponible muy pronto`),
  }, ...children);
}

/* ---------- Aviso (toast) ---------- */
let toastEl, toastTimer;
export function toast(message, kind = 'ok') {
  if (!toastEl) {
    toastEl = h('div', { class: 'toast', role: 'status', 'aria-live': 'polite' });
    document.body.append(toastEl);
  }
  toastEl.textContent = message;
  toastEl.dataset.kind = kind;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 3800);
}
