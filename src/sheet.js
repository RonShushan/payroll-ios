// גיליון פעולות בסגנון iOS (Action Sheet): כפתורי פעולה מוערמים + כפתור ביטול נפרד. מחזיר ערך הפעולה, או null בביטול.
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export function actionSheet({ title = '', message = '', actions = [], cancel = 'ביטול' }) {
  return new Promise(resolve => {
    document.getElementById('asheet')?.remove();
    const d = document.createElement('div'); d.id = 'asheet'; d.className = 'asheet';
    d.innerHTML = `<div class="as-box" role="alertdialog" aria-modal="true" ${title ? 'aria-label="' + esc(title) + '"' : ''}>
      <div class="as-group">${title || message ? `<div class="as-head">${title ? `<b>${esc(title)}</b>` : ''}${message ? `<span>${esc(message)}</span>` : ''}</div>` : ''}
        ${actions.map((a, i) => `<button type="button" class="as-btn ${a.destructive ? 'dng' : ''}" data-i="${i}">${esc(a.label)}</button>`).join('')}</div>
      <div class="as-group"><button type="button" class="as-btn as-cancel" data-i="-1">${esc(cancel)}</button></div></div>`;
    const done = v => { d.classList.add('out'); setTimeout(() => d.remove(), 180); resolve(v); };
    d.addEventListener('click', e => {
      if (e.target === d) return done(null);
      const b = e.target.closest('[data-i]'); if (!b) return;
      const i = Number(b.dataset.i); done(i < 0 ? null : (actions[i].value ?? i));
    });
    document.body.appendChild(d);
  });
}
// אישור פעולה הרסנית: מחזיר true רק אם נבחרה הפעולה
export const confirmSheet = ({ title, message, label, destructive = true, cancel }) => actionSheet({ title, message, cancel, actions: [{ label, destructive, value: true }] }).then(v => v === true);
