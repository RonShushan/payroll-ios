// רכיבי ממשק פשוטים (HTML + CSS בלבד) לפי Apple HIG. מחליפים את Ionic.
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// כפתור רחב. variant: '' (ראשי) | 'plain' | 'sec' | 'light'
export const button = (id, text, variant = '', extra = '') => `<button type="button" id="${id}" class="btn-block ${variant}" ${extra}>${text}</button>`;

// בקר מקטעים (כמו UISegmentedControl). options = [[value, label], ...]
export const segmented = (id, value, options) =>
  `<div class="seg" id="${id}" role="radiogroup">${options.map(([v, l]) => `<button type="button" role="radio" aria-checked="${v === value}" data-v="${esc(v)}" class="${v === value ? 'on' : ''}">${l}</button>`).join('')}</div>`;
export function onSegmented(id, cb) {
  const el = document.getElementById(id); if (!el) return;
  el.addEventListener('click', e => { const b = e.target.closest('button[data-v]'); if (b) cb(b.dataset.v); });
}

// שדה טקסט עם תווית מעל. extra = מאפייני input נוספים
export const field = (id, label, val, extra = '') => `<div class="item"><label for="${id}">${label}</label><input id="${id}" value="${esc(val)}" ${extra}></div>`;
export const checkRow = (id, text, checked) => `<label class="tg-row item"><span>${text}</span><input type="checkbox" role="switch" class="sw" id="${id}" ${checked ? 'checked' : ''}></label>`;
// מתג בסגנון iOS; extra = מאפיינים נוספים (למשל data-tg). בתוך .tgrp התוכן שב-.tg-detail מוצג רק כשהמתג דלוק
export const toggleRow = (id, text, checked, extra = '') => `<label class="tg-row"><span>${text}</span><input type="checkbox" role="switch" class="sw" id="${id}" ${checked ? 'checked' : ''} ${extra}></label>`;
// בורר "החודש שלי מתחיל ב-": 1 = חודש קלנדרי (ברירת מחדל). נפתח כגלגלת בחירה של iOS
export const monthStartItem = (id, val) => `<div class="item"><label for="${id}">החודש שלי מתחיל ב-</label><select id="${id}">${[...Array(28)].map((_, i) => { const d = i + 1; return `<option value="${d}" ${Number(val || 1) === d ? 'selected' : ''}>${d === 1 ? '1 לחודש (ברירת מחדל)' : d + ' בחודש'}</option>`; }).join('')}</select></div>`;
export const monthStartNote = v => { v = Number(v) || 1; return v <= 1
  ? 'ברירת מחדל: החודש נספר מה-1 ועד היום האחרון שלו. אם במקום העבודה שלך החודש נספר מתאריך אחר, למשל מ-25 עד 24 בחודש הבא, בחר אותו כאן והחישובים והדוחות ילכו לפי זה.'
  : `החודש נספר מ-${v} בחודש ועד ${v - 1} בחודש הבא. התקופה נקראת לפי חודש הסיום שלה, למשל ${v}.10 עד ${v - 1}.11 הוא "נובמבר".`; };
// שדה סיסמה עם סמל עין להצגה זמנית. הלחיצה מטופלת ב-bindPwEye (האזנה אחת על המסמך)
export const pwField = (id, label, auto) => `<div class="item pw-field"><label for="${id}">${label}</label><input id="${id}" type="password" autocomplete="${auto}" dir="ltr"><button type="button" class="pw-eye" data-eye="${id}" aria-label="הצג סיסמה" aria-pressed="false">${icon('eye')}</button></div>`;
export function bindPwEye(onToggle) {
  if (bindPwEye._on) return; bindPwEye._on = true;
  document.addEventListener('click', e => {
    const b = e.target.closest?.('.pw-eye'); if (!b) return;
    const inp = document.getElementById(b.dataset.eye); if (!inp) return;
    const show = inp.type === 'password'; inp.type = show ? 'text' : 'password';
    b.innerHTML = icon(show ? 'eyeoff' : 'eye'); b.setAttribute('aria-label', show ? 'הסתר סיסמה' : 'הצג סיסמה'); b.setAttribute('aria-pressed', String(show));
    onToggle?.(); inp.focus({ preventScroll: true });
  });
}
export const infoRow = (k, v) => `<div class="item line"><span>${k}</span><b>${v}</b></div>`;
export const list = inner => `<div class="list">${inner}</div>`;

/* ---------- סמלים: סט קווי אחיד (רשת 24, עובי 1.7, קצוות עגולים), בסגנון SF Symbols ---------- */
const PATHS = {
  clock: '<circle class="f" cx="12" cy="12" r="9"/><path d="M12 7v5l3.2 2"/>',
  month: '<rect class="f" x="4" y="5" width="16" height="15" rx="3"/><path d="M4 10h16M8 3v4M16 3v4"/>',
  slips: '<path class="f" d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/>',
  sum: '<rect class="f" x="4" y="12" width="4" height="8" rx="1"/><rect class="f" x="10" y="5" width="4" height="15" rx="1"/><rect class="f" x="16" y="9" width="4" height="11" rx="1"/>',
  set: '<path d="M4 8h10M18 8h2M4 16h2M10 16h10"/><circle class="f" cx="16" cy="8" r="2"/><circle class="f" cx="8" cy="16" r="2"/>',
  pay: '<rect class="f" x="3" y="7" width="18" height="12" rx="2.5"/><path d="M8 7V5.5A1.5 1.5 0 0 1 9.5 4h5A1.5 1.5 0 0 1 16 5.5V7M3 12.5h18"/>',
  tax: '<circle class="f" cx="7.5" cy="7.5" r="2.5"/><circle class="f" cx="16.5" cy="16.5" r="2.5"/><path d="M18 5.5 6 18.5"/>',
  doc: '<path class="f" d="M7 3h7l4 4v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/><path d="M14 3v4h4M9 12h6M9 16h6"/>',
  bell: '<path class="f" d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>',
  look: '<circle class="f" cx="12" cy="12" r="8.5"/><path d="M12 3.5v17"/>',
  person: '<circle class="f" cx="12" cy="8" r="4"/><path d="M4.5 20c.8-3.6 3.8-5.5 7.5-5.5s6.700 1.900 7.500 5.500"/>',
  tray: '<path class="f" d="M4 14h4l1.500 3h5L16 14h4v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z"/><path d="M12 4v8M8.500 8.500 12 12l3.500-3.500"/>',
  income: '<circle class="f" cx="12" cy="12" r="9"/><path d="M12 7v10M14.500 9.200c-.5-.7-1.400-1.100-2.500-1.100-1.500 0-2.500.8-2.500 1.900s1 1.600 2.500 2 2.500.9 2.500 2-1 1.900-2.500 1.900c-1.200 0-2.100-.4-2.700-1.200"/>',
  leave: '<circle class="f" cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.600 5.600 7 7M17 17l1.400 1.400M5.600 18.400 7 17M17 7l1.400-1.400"/>',
  pension: '<path class="f" d="M12 3 5 6v5.500c0 4.500 3 7.800 7 9.500 4-1.700 7-5 7-9.500V6z"/><path d="m9 12 2.200 2.200L15.200 10"/>',
  years: '<rect class="f" x="4" y="9" width="16" height="11" rx="2.500"/><path d="M7 6h10M9.500 3h5"/>',
  list: '<path d="M9 6h11M9 12h11M9 18h11"/><circle class="f" cx="4.800" cy="6" r="1.300"/><circle class="f" cx="4.800" cy="12" r="1.300"/><circle class="f" cx="4.800" cy="18" r="1.300"/>',
  report: '<path class="f" d="M6 3h9l3 3v15H6z"/><path d="M9 17v-4M12 17V9M15 17v-6"/>',
  chev: '<path d="m9 5 7 7-7 7"/>',
  back: '<path d="m15 5-7 7 7 7"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  eye: '<path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  eyeoff: '<path d="M3 3l18 18"/><path d="M10.6 6c.45-.07.9-.1 1.4-.1C18.4 5.9 22 12 22 12a17 17 0 0 1-3.3 3.9M6.3 7.6A16.7 16.7 0 0 0 2 12s3.6 6.1 10 6.1c1.5 0 2.8-.3 4-.8"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  check: '<path d="m5 12.500 4.500 4.500L19 7.500"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
};
export const icon = (name, cls = 'ic') => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${PATHS[name] || ''}</svg>`;

// אריח סמל צבעוני (כמו ב"הגדרות" של iOS). הצבעים כהים מספיק ללבן: ניגודיות 3:1 לפחות לגרפיקה
export const TILE_COLORS = { green: '#248a3d', blue: '#0062cc', orange: '#a85400', purple: '#7a3fc2', red: '#c4001a', teal: '#00796b', gray: '#5b5b63', pink: '#b0245f' };
export const tileIcon = (name, color = 'blue') => `<span class="tile-ic" style="--tc:${TILE_COLORS[color] || color}">${icon(name)}</span>`;

// שורה ברשימה מקובצת. attrs: מאפייני data-* ללחיצה
export const gRow = ({ icon: ic, color, title, value = '', attrs = '', check = false, chevron = true }) =>
  `<button type="button" class="grow" ${attrs}>${ic ? tileIcon(ic, color) : ''}<span class="g-title">${title}</span>${check ? `<span class="g-ok" aria-label="הושלם">${icon('check')}</span>` : ''}${value ? `<span class="g-val">${value}</span>` : ''}${chevron ? icon('chev', 'ic chev') : ''}</button>`;
export const gList = rows => `<div class="glist">${rows.join('')}</div>`;

// כותרת עליונה למסך פנימי. בעברית: start = צד ימין (חזרה / ביטול), end = צד שמאל (פעולה)
export const backBtn = (attrs, label = 'חזרה') => `<button type="button" class="nb-btn nb-back" ${attrs}>${icon('back')}<span>${label}</span></button>`;
export const navbar = ({ start = '', title, end = '', sub = '' }) =>
  `<header class="navbar"><div class="nb-side">${start}</div><div class="nb-mid"><h1 class="nb-title">${title}</h1>${sub}</div><div class="nb-side end">${end}</div></header>`;
