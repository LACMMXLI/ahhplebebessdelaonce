/* Efectos visuales: brasas, aparición al hacer scroll y onda al tocar. Todo es opcional:
   si algo falla o el usuario pide menos movimiento, la página funciona igual. */

const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------- Brasas ascendentes ---------- */
export function embers() {
  const canvas = document.getElementById('embers');
  if (!canvas || reduced || navigator.connection?.saveData) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  let w = 0; let h = 0; let dpr = 1; let raf = 0; let last = 0;
  const sprite = document.createElement('canvas');
  sprite.width = sprite.height = 32;
  const sctx = sprite.getContext('2d');
  const g = sctx.createRadialGradient(16, 16, 0, 16, 16, 16);
  g.addColorStop(0, 'rgba(255,230,160,1)');
  g.addColorStop(0.25, 'rgba(255,150,50,.85)');
  g.addColorStop(1, 'rgba(255,60,10,0)');
  sctx.fillStyle = g; sctx.fillRect(0, 0, 32, 32);

  const parts = [];
  const spawn = (initial) => ({
    x: Math.random() * w,
    y: initial ? Math.random() * h : h + 10,
    vy: 14 + Math.random() * 36,          // px por segundo
    sway: 8 + Math.random() * 22,
    phase: Math.random() * Math.PI * 2,
    size: 5 + Math.random() * 11,
    life: Math.random() * Math.PI * 2,
    tw: 1.2 + Math.random() * 2.2,
  });
  const resize = () => {
    dpr = Math.min(devicePixelRatio || 1, 1.5);
    w = innerWidth; h = innerHeight;
    canvas.width = w * dpr; canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const n = w < 600 ? 26 : 48;
    while (parts.length < n) parts.push(spawn(true));
    parts.length = n;
  };
  const frame = (t) => {
    const dt = Math.min((t - last) / 1000 || 0.016, 0.05); last = t;
    ctx.clearRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      p.y -= p.vy * dt; p.life += p.tw * dt; p.phase += dt;
      const x = p.x + Math.sin(p.phase) * p.sway;
      const fade = Math.min(1, p.y / (h * 0.35));       // se apagan al subir
      const a = Math.max(0, (0.35 + 0.35 * Math.sin(p.life)) * fade);
      if (p.y < -20 || a <= 0.01) { parts[i] = spawn(false); continue; }
      ctx.globalAlpha = a;
      ctx.drawImage(sprite, x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    raf = requestAnimationFrame(frame);
  };
  const start = () => { if (!raf) { last = performance.now(); raf = requestAnimationFrame(frame); } };
  const stop = () => { cancelAnimationFrame(raf); raf = 0; };
  addEventListener('resize', resize, { passive: true });
  document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start()));
  resize(); start();
}

/* ---------- Aparición escalonada ---------- */
export function reveal(root = document) {
  const els = [...root.querySelectorAll('.rv:not(.in)')];
  els.forEach((el, i) => el.style.setProperty('--i', String(Math.min(i, 8))));
  if (reduced || !('IntersectionObserver' in window)) { els.forEach((el) => el.classList.add('in')); return; }
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.05 });
  els.forEach((el) => io.observe(el));
}

/* ---------- Onda al tocar ---------- */
export function ripples() {
  if (reduced) return;
  document.addEventListener('pointerdown', (e) => {
    const host = e.target.closest?.('.rp');
    if (!host || host.disabled) return;
    const r = host.getBoundingClientRect();
    const size = Math.max(r.width, r.height) * 2;
    const dot = document.createElement('span');
    dot.className = 'ripple';
    dot.style.cssText = `width:${size}px;height:${size}px;left:${e.clientX - r.left - size / 2}px;top:${e.clientY - r.top - size / 2}px`;
    host.append(dot);
    dot.addEventListener('animationend', () => dot.remove(), { once: true });
  }, { passive: true });
}

/** Cierra un <dialog> con animación de salida. */
export function closeDialog(dlg) {
  if (!dlg.open) return;
  if (reduced) { dlg.close(); return; }
  dlg.classList.add('closing');
  let finished = false;
  const done = () => { if (finished) return; finished = true; dlg.classList.remove('closing'); dlg.close(); };
  // animationend burbuja desde los hijos: solo cuenta la del propio diálogo.
  dlg.addEventListener('animationend', (e) => { if (e.target === dlg && !e.pseudoElement) done(); });
  setTimeout(done, 400);
}

/** Vuela un punto de color desde un elemento hasta otro (al agregar al carrito). */
export function fly(from, to, color = '#ff8a1f') {
  if (reduced || !from || !to || !to.getBoundingClientRect) return;
  // `from` puede ser un elemento o un DOMRect ya medido (el botón se reemplaza al re-pintar).
  const a = from.getBoundingClientRect ? from.getBoundingClientRect() : from; const b = to.getBoundingClientRect();
  if (!b.width) return;
  const dot = document.createElement('span');
  dot.style.cssText = `position:fixed;z-index:150;left:0;top:0;width:18px;height:18px;border-radius:50%;pointer-events:none;background:${color};box-shadow:0 0 14px ${color}`;
  document.body.append(dot);
  const sx = a.left + a.width / 2 - 9; const sy = a.top + a.height / 2 - 9;
  const ex = b.left + b.width / 2 - 9; const ey = b.top + b.height / 2 - 9;
  const anim = dot.animate([
    { transform: `translate(${sx}px,${sy}px) scale(1)`, opacity: 1 },
    { transform: `translate(${(sx + ex) / 2}px,${Math.min(sy, ey) - 80}px) scale(1.2)`, opacity: 1, offset: 0.5 },
    { transform: `translate(${ex}px,${ey}px) scale(.3)`, opacity: 0.2 },
  ], { duration: 650, easing: 'cubic-bezier(.4,0,.2,1)' });
  anim.onfinish = () => dot.remove();
}

export const prefersReducedMotion = reduced;
