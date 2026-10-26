// בועת הלשונית הפעילה בסרגל התחתון: מחליקה בין לשוניות, ואפשר גם לגרור אותה עם האצבע.
import { haptic } from './native/haptics.js';
const btns = nav => [...nav.querySelectorAll('button')];
function move(b, on, instant) {
  b.style.transition = instant ? 'none' : '';
  b.style.width = on.offsetWidth + 'px'; b.style.height = on.offsetHeight + 'px';
  b.style.transform = `translate(${on.offsetLeft}px,${on.offsetTop}px)`;
  if (instant) void b.offsetWidth;
}
let placed = false;
export function placeBubble(nav, retry = true) {
  let b = nav.querySelector('.nav-bubble');
  if (!b) { b = document.createElement('i'); b.className = 'nav-bubble'; b.setAttribute('aria-hidden', 'true'); nav.prepend(b); placed = false; }
  const on = nav.querySelector('button.on'); if (!on) return;
  if (!on.offsetWidth) { if (retry) requestAnimationFrame(() => placeBubble(nav, false)); return; }
  move(b, on, !placed || nav.classList.contains('dragging')); placed = true;
}
export function initNavDrag(nav) {
  let id = null, x0 = 0, drag = false, hot = null, suppress = false;
  const near = x => { const l = btns(nav); return l.find(b => { const r = b.getBoundingClientRect(); return x >= r.left && x < r.right; }) || (x < l[0].getBoundingClientRect().left ? l[0] : l[l.length - 1]); };
  const reset = () => { id = null; drag = false; nav.classList.remove('dragging'); btns(nav).forEach(b => b.classList.remove('hot')); hot = null; };
  nav.addEventListener('pointerdown', e => { if (e.pointerType === 'mouse' && e.button) return; id = e.pointerId; x0 = e.clientX; drag = false; });
  nav.addEventListener('pointermove', e => {
    if (e.pointerId !== id) return;
    if (!drag) { if (Math.abs(e.clientX - x0) < 10) return; drag = true; nav.classList.add('dragging'); try { nav.setPointerCapture(id); } catch {} }
    const l = btns(nav), bub = nav.querySelector('.nav-bubble'), w = bub.offsetWidth;
    const lo = Math.min(...l.map(b => b.offsetLeft)), hi = Math.max(...l.map(b => b.offsetLeft));
    const left = Math.min(hi, Math.max(lo, e.clientX - nav.getBoundingClientRect().left - w / 2));
    bub.style.transition = 'none'; bub.style.transform = `translate(${left}px,${l[0].offsetTop}px)`;
    const h = near(e.clientX);
    if (h !== hot) { hot?.classList.remove('hot'); hot = h; h.classList.add('hot'); haptic('select'); }
  });
  const end = e => {
    if (e.pointerId !== id) return;
    const target = drag ? hot : null, was = drag;
    reset();
    if (!was) return;
    if (target && !target.classList.contains('on')) target.click(); else placeBubble(nav);
    suppress = true; setTimeout(() => { suppress = false; }, 60);
  };
  nav.addEventListener('pointerup', end); nav.addEventListener('pointercancel', e => { if (e.pointerId === id) { reset(); placeBubble(nav); } });
  nav.addEventListener('click', e => { if (suppress) { e.stopPropagation(); e.preventDefault(); } }, true);
  addEventListener('resize', () => { placed = false; placeBubble(nav); });
}
