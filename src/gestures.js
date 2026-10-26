// החלקה מהקצה אחורה (כמו ב-iOS): בעברית הקצה הראשי הוא הימני, והחלקה שמאלה חוזרת אחורה.
import { closeModalById } from './ui-bridge.js';
let sx = 0, sy = 0, on = false;
const EDGE = 28, DIST = 70;
function goBack() {
  const auth = document.getElementById('auth-root');
  if (auth && !auth.hidden) { const b = auth.querySelector('#b-back'); if (b) { b.click(); return true; } return false; }
  if (document.getElementById('modal')) { closeModalById(); return true; }
  const b = document.querySelector('#app .nb-back, #app [data-act="pageback"], #app [data-act="setback"]');
  if (b) { b.click(); return true; }
  return false;
}
export function initGestures() {
  document.addEventListener('touchstart', e => {
    if (e.touches.length !== 1) return; const t = e.touches[0];
    const rtl = document.documentElement.dir === 'rtl';
    on = rtl ? t.clientX > innerWidth - EDGE : t.clientX < EDGE; sx = t.clientX; sy = t.clientY;
  }, { passive: true });
  document.addEventListener('touchend', e => {
    if (!on) return; on = false; const t = e.changedTouches[0];
    const rtl = document.documentElement.dir === 'rtl', dx = t.clientX - sx, dy = t.clientY - sy;
    if (Math.abs(dy) > 60) return;
    if ((rtl && dx < -DIST) || (!rtl && dx > DIST)) goBack();
  }, { passive: true });
}
