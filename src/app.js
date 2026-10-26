import { placeBubble, initNavDrag } from './navbubble.js';
import { initNativeTabs, selectNativeTab } from './native/tabbar.js';
import { store } from './data/store.js';
import { buildReportHtml } from './lib/reportHtml.js';
import { auth } from './auth/auth.js';
import { getMode, setMode, hasPendingUpgrade } from './data/mode.js';
import { loadLocal, clearLocal } from './data/local.js';
import { showTermsGate } from './auth/screens.js';
import { initAuthUI, showWelcome, hideAuth, showMfaChallenge, showMfaSetup, startUpgrade, runUpgrade } from './auth/screens.js';
import { VAPID_PUBLIC_KEY } from './config.js';
import { SETTLEMENTS, findSettlement } from './lib/settlements.js';
import { ALL_PLACES } from './lib/localities.js';
import { widgetAvailable, widgetStatus, widgetPush, widgetQueue } from './native/widget.js';
import { geoAvailable, geoConfig, geoStatus, geoAskPermission, geoSetHere, geoDisable, geoSetWindow, geoConsumePending, geoLog } from './native/geofence.js';
import { isNativeApp, hasNotifPermission, ensurePermission, planReminders, onReminderTap, sendTest } from './native/reminders.js';
import { getTheme, setTheme } from './appearance.js';
import { initGestures } from './gestures.js';
import { actionSheet, confirmSheet } from './sheet.js';
import { haptic } from './native/haptics.js';
import { faceEnabled, setFaceEnabled, faceAsked, markFaceAsked, bioInfo, bioName, bioAuth, clearToken } from './native/biometric.js';
import { icon, gRow, gList, navbar, backBtn, toggleRow, tileIcon, monthStartItem, monthStartNote } from './ui.js';
import { termsAccepted, TERMS_VERSION, showTermsOverlay } from './legal.js';
import { shouldOnboard, runWizard, clearOnboardFlag, setOnboardUser } from './onboarding/wizard.js';
const isGuest = () => getMode() === 'guest';
import { computeMonth, shiftNetEstimate, shiftHours, splitDay, rateAt, ilDow, comparePayslip, DEFAULT_SETTINGS, effBreak, PENSION_START, SPECIAL_DAYS, ymd, monthKey, ilYmd, startDayOf, periodOf, periodLabelOf, fmtHM } from './lib/payroll.js';
import { holidayOf, holidaysInRange } from './lib/holidays.js';
import { PARAMS, insurance, pension, cumulativeTax, r2 } from './lib/engine.js';

const $app = document.getElementById('app'), $nav = document.getElementById('nav');
const S = { tab: 'clock', month: new Date(), settings: null, rates: [], payslips: [], sub: null, setCat: null, edit: false, draft: null, page: null, email: '', codeSent: false, err: '' };

/* ---------- עזרים ---------- */
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = n => (n === null || n === undefined || n === '' || isNaN(n)) ? '—' : '₪' + Number(n).toLocaleString('he-IL', { maximumFractionDigits: 2 });
const num = n => (n === null || n === undefined || isNaN(n)) ? '—' : Number(n).toLocaleString('he-IL', { maximumFractionDigits: 2 });
const hhmm = d => new Date(d).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
const dayName = d => new Date(d).toLocaleDateString('he-IL', { weekday: 'long' });
const dateStr = d => new Date(d).toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' });
const monthName = (y, m) => new Date(y, m - 1, 1).toLocaleDateString('he-IL', { month: 'long', year: 'numeric' });
const hhmmNow = () => { const d = new Date(); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };
const toLocalInput = d => { const x = new Date(d); x.setMinutes(x.getMinutes() - x.getTimezoneOffset()); return x.toISOString().slice(0, 16); };
const bounds = (y, m) => periodOf(y, m, startDayOf(S.settings));            // תקופת חודש העבודה (ברירת מחדל: חודש קלנדרי)
const curLabel = d => periodLabelOf(d, startDayOf(S.settings));             // לאיזה חודש עבודה שייך תאריך
const todayMonth = () => { const { y, m } = curLabel(new Date()); return new Date(y, m - 1, 1); };
const lastDayYmd = (y, m) => { const { to } = bounds(y, m); return ymd(new Date(to.getFullYear(), to.getMonth(), to.getDate() - 1)); };
const periodText = (y, m) => { if (startDayOf(S.settings) <= 1) return ''; const { from } = bounds(y, m), e = lastDayYmd(y, m).split('-'); return `${from.getDate()}.${from.getMonth() + 1} – ${Number(e[2])}.${Number(e[1])}`; };
const hm = h => ltr(fmtHM(h));                                                // שעות כ-9:30
const $ = (sel, root = document) => root.querySelector(sel);
function toast(msg, bad, act) {
  let t = document.getElementById('toast');
  if (!t) { t = document.createElement('div'); t.id = 'toast'; t.style.cssText = 'position:fixed;top:calc(env(safe-area-inset-top) + 56px);left:12px;right:12px;z-index:200;box-shadow:0 4px 16px #0008;padding:12px 14px;border-radius:12px;font-weight:600;text-align:center'; document.body.appendChild(t); }
  t.textContent = msg; t.style.background = bad ? 'var(--bad)' : 'var(--ok-fill)'; t.style.color = '#fff'; t.classList.remove('show'); void t.offsetWidth; t.classList.add('show');
  if (act) { const b = document.createElement('button'); b.type = 'button'; b.className = 'toast-act'; b.textContent = act.label; b.onclick = () => { t.classList.remove('show'); act.fn(); }; t.appendChild(b); }
  haptic(bad ? 'warning' : 'success');
  clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), act ? 7000 : bad ? 6000 : 2200);
}
// צפצוף: קובץ WAV שנוצר בקוד, מנוגן דרך אלמנט שמע (עובד גם באייפון)
const _beepCache = {};
function beepUrl(freqs) {
  const key = freqs.join(','); if (_beepCache[key]) return _beepCache[key];
  const rate = 22050, dur = 0.16, gap = 0.08, n = Math.floor(rate * (freqs.length * (dur + gap)));
  const buf = new Int16Array(n);
  freqs.forEach((f, k) => { const s0 = Math.floor(k * (dur + gap) * rate), len = Math.floor(dur * rate);
    for (let i = 0; i < len; i++) { const env = Math.min(1, i / 300, (len - i) / 300); buf[s0 + i] = Math.sin(2 * Math.PI * f * i / rate) * 0.6 * env * 32767; } });
  const h = new DataView(new ArrayBuffer(44)), w = (o, s) => [...s].forEach((c, i) => h.setUint8(o + i, c.charCodeAt(0)));
  w(0, 'RIFF'); h.setUint32(4, 36 + n * 2, true); w(8, 'WAVEfmt '); h.setUint32(16, 16, true); h.setUint16(20, 1, true); h.setUint16(22, 1, true);
  h.setUint32(24, rate, true); h.setUint32(28, rate * 2, true); h.setUint16(32, 2, true); h.setUint16(34, 16, true); w(36, 'data'); h.setUint32(40, n * 2, true);
  return _beepCache[key] = URL.createObjectURL(new Blob([h.buffer, buf.buffer], { type: 'audio/wav' }));
}
const beep = freqs => { try { const a = new Audio(beepUrl(freqs)); a.volume = 1; a.play().catch(() => {}); } catch {} };
const ltr = x => `<bdi dir="ltr">${x}</bdi>`;

function modal(html) {
  closeModal(true);
  const d = document.createElement('div'); d.className = 'modal'; d.id = 'modal';
  d.innerHTML = `<div class="sheet" role="dialog" aria-modal="true"><div class="sheet-top"><button type="button" class="nb-btn sheet-x" data-act="close" aria-label="סגור">${icon('close')}</button></div>${html}</div>`;
  { const h = d.querySelector('.sheet h1'); if (h) { h.id = 'modal-title'; d.querySelector('.sheet').setAttribute('aria-labelledby', 'modal-title'); } }
  d.addEventListener('click', e => { if (e.target === d) closeModal(); });
  document.body.appendChild(d); enableSheetSwipe(d); return d;
}
/* סגירת חלון תחתון בהחלקה למטה (כמו ב-iOS): גרירה עוקבת אחרי האצבע, שחרור אחרי מרחק/מהירות סוגר, אחרת חוזר */
function enableSheetSwipe(d) {
  const sh = d.querySelector('.sheet'); let y0 = 0, dy = 0, t0 = 0, on = false, tracking = false;
  const fromGrab = y => y - sh.getBoundingClientRect().top < 40;
  sh.addEventListener('touchstart', e => {
    if (e.touches.length !== 1) return;
    y0 = e.touches[0].clientY; dy = 0; t0 = Date.now(); on = false;
    tracking = sh.scrollTop <= 0 || fromGrab(y0);
  }, { passive: true });
  sh.addEventListener('touchmove', e => {
    if (!tracking) return;
    dy = e.touches[0].clientY - y0;
    if (!on) { if (dy > 8 && (sh.scrollTop <= 0 || fromGrab(y0))) { on = true; sh.style.animation = 'none'; sh.style.transition = 'none'; } else if (dy < -4) { tracking = false; return; } else return; }
    e.preventDefault();
    const v = Math.max(0, dy); sh.style.transform = `translateY(${v}px)`; d.style.background = `rgba(0,0,0,${0.4 * Math.max(0, 1 - v / 500)})`;
  }, { passive: false });
  const end = () => {
    if (!on) { tracking = false; return; }
    on = false; tracking = false;
    const fast = dy / Math.max(1, Date.now() - t0) > 0.6;
    if (dy > 120 || fast) {
      sh.style.transition = 'transform .25s ease'; d.style.transition = 'background .25s ease'; sh.style.transform = 'translateY(110%)'; d.style.background = 'rgba(0,0,0,0)';
      setTimeout(closeModal, 230);
    } else { sh.style.transition = 'transform .3s var(--ease)'; sh.style.transform = ''; d.style.transition = 'background .3s'; d.style.background = ''; }
  };
  sh.addEventListener('touchend', end); sh.addEventListener('touchcancel', end);
}
const collapseRow = el => { const r = el?.closest('.row'); if (!r || matchMedia('(prefers-reduced-motion:reduce)').matches) return Promise.resolve(); r.style.maxHeight = r.offsetHeight + 'px'; void r.offsetWidth; r.classList.add('rm'); r.style.maxHeight = '0'; return new Promise(res => setTimeout(res, 200)); };
const closeModal = instant => {
  document.getElementById('modal-out')?.remove();
  const d = document.getElementById('modal'); if (!d) return;
  if (instant === true || matchMedia('(prefers-reduced-motion:reduce)').matches) return d.remove();
  d.id = 'modal-out'; d.classList.add('out'); setTimeout(() => d.remove(), 220);
};

/* ---------- טעינת נתוני חודש וחישוב ---------- */
async function monthData(y, m) {
  const { from, to } = bounds(y, m);
  const [shifts, leave] = await Promise.all([store.shifts(from.toISOString(), to.toISOString()), store.leave(ymd(from), ymd(to))]);
  return { shifts, leave };
}
// מצטבר שנתי עד החודש (לא כולל): תלוש אם קיים, אחרת חישוב מהמשמרות
async function yearPrior(y, m) {
  let cum = 0, tax = 0, first = null, count = 0;
  for (let k = 1; k < m; k++) {
    const key = `${y}-${String(k).padStart(2, '0')}`;
    const slips = S.payslips.filter(p => p.month === key);
    let g = 0, t = 0;
    if (slips.length) { g = slips.reduce((a, p) => a + Number(p.gross || 0), 0); t = slips.reduce((a, p) => a + Number(p.income_tax || 0), 0); }
    else {
      const d = await monthData(y, k); if (!d.shifts.length && !d.leave.length) continue;
      const c = computeMonth({ year: y, month: k, ...d, rates: S.rates, settings: S.settings, prior: { cumIncome: cum, taxPaid: tax, monthIndex: first === null ? 0 : k - first - 1 } });
      g = c.gross; t = c.tax;
    }
    if (g > 0) { if (first === null) first = k; cum += g; tax += t; count++; }
  }
  return { cumIncome: cum, taxPaid: tax, monthIndex: first === null ? 0 : m - first };
}
async function calcMonth(y, m) {
  const d = await monthData(y, m);
  const prior = await yearPrior(y, m);
  const args = { year: y, month: m, ...d, rates: S.rates, settings: S.settings, prior };
  return { ...d, args, calc: computeMonth(args) };
}

/* ---------- אתחול ---------- */
async function boot() {
  initAuthUI(boot);
  if (isNativeApp() && !S._links) { S._links = true; import('@capacitor/app').then(({ App }) => { App.addListener('appUrlOpen', ({ url }) => openUrl(url)); App.getLaunchUrl().then(r => r?.url && openUrl(r.url)).catch(() => {}); }).catch(console.warn); }
  if (!S._gest) { S._gest = true; initGestures(); initNavDrag($nav); }
  try { await loadLocal(); } catch (e) { console.warn(e); }
  let sess = null;
  try {
    const oauth = await auth.completeOAuthIfNeeded();           // חזרה מהתחברות עם גוגל (באתר)
    if (oauth && !hasPendingUpgrade()) setMode('cloud');
    if (oauth && hasPendingUpgrade()) {
      const s2 = await auth.session2();
      return s2?.needsMfa ? showMfaChallenge({ upgrade: true }) : runUpgrade();
    }
    sess = await auth.session();
  } catch (e) { S._fresh = true; return showWelcome({ error: e.message }); }
  if (!sess) { S._fresh = true; return showWelcome(); }
  if (sess.needsMfa) { S._fresh = true; return showMfaChallenge(); }
  auth.watchFace();
  if (!termsAccepted()) return showTermsGate(boot);
  hideAuth();
  await reloadBase();
  if (termsAccepted() && S.settings && S.settings.profile?.terms?.v !== TERMS_VERSION) {      // תיעוד אישור התקנון בחשבון: גרסה ותאריך
    try { S.settings = { ...S.settings, profile: { ...(S.settings.profile || {}), terms: { v: TERMS_VERSION, at: new Date().toISOString() } } }; await persistSettings(); } catch (e) { console.warn('terms', e); }
  }
  setOnboardUser(sess?.user?.id);
  if (shouldOnboard(S.settings, S.rates, S.payslips)) { $nav.hidden = true; return runWizard({ settings: S.settings, done: boot }); }
  if (!S._mi) { S._mi = true; S.month = todayMonth(); }
  $nav.hidden = false; renderNav(); await render();
  if (isNativeApp() && !_tapBound) {
    _tapBound = true; onReminderTap(k => handleRemind(k)).catch(console.warn);
    import('@capacitor/app').then(({ App }) => App.addListener('appStateChange', ({ isActive }) => { if (isActive) { processWidgetQueue().catch(console.warn).finally(() => { checkGeoPending(); replan(); }); } })).catch(console.warn);
  }
  processWidgetQueue().catch(console.warn).finally(() => { checkGeoPending(); replan(); });
  const qs = new URLSearchParams(location.search);
  const rq = qs.get('remind'); if (rq) handleRemind(rq);
  if (qs.get('quick') === 'toggle') { try { history.replaceState(null, '', location.pathname); } catch {} S.tab = 'clock'; const a = await store.activeShift(); if (a && (Date.now() - new Date(a.start_at)) / 3600e3 <= 16) await clockOut(); else if (!a) await clockIn(); else render(); }
  try { await autoHolidays(); render(); } catch (e) { console.warn('holidays', e); }
  processShared();
  offerLock();
}
/* הצעה חד-פעמית להפעלת Face ID אחרי התחברות (גוגל או אימייל) */
async function offerLock() {
  if (!S._fresh || !isNativeApp() || isGuest() || faceEnabled()) return;   // ההצעה חוזרת בכל התחברות טרייה עד שמפעילים
  const info = await bioInfo(); if (!info.available) return;
  S._fresh = false;
  const n = bioName(info.type);
  modal(`<h1>להפעיל ${n}?</h1><p class="mut">בפעם הבאה שתתחבר לחשבון תוכל להיכנס בלחיצה אחת עם ${n}, בלי להקליד סיסמה או לעבור דרך גוגל. אפשר לשנות בהגדרות ואז חשבון.</p>
    <p><button class="pri" id="lk-yes">הפעל ${n}</button> <button id="lk-no">לא עכשיו</button></p>`);
  document.getElementById('lk-no').onclick = closeModal;
  document.getElementById('lk-yes').onclick = async () => { const x = await bioAuth('הפעלת כניסה עם ' + n); if (x.ok && await auth.faceSaveNow()) { setFaceEnabled(true); toast(`${n} הופעל`); } else if (x.ok) toast('לא הצלחתי לשמור את ההתחברות', true); closeModal(); };
}
// פתיחה מתוך התראה: חלון עדכון כניסה / סימון יום חופש
function handleRemind(kind) {
  try { history.replaceState(null, '', location.pathname); } catch {}
  if (kind === 'in') return remindInModal();
  if (kind === 'slip') { S.tab = 'slips'; S.sub = null; return render().then(() => { const l = [...S.payslips].sort((x, y) => (y.created_at || y.month).localeCompare(x.created_at || x.month))[0]; if (l) openSlip(l); }); }
  return store.activeShift().then(a => { if (a) { S.tab = 'clock'; shiftForm(a, { endNow: true }); } });
}
function remindInModal(day) {
  S.remDay = day || null;
  const now = day ? new Date(day + 'T12:00:00') : new Date();
  modal(`<h1>${day ? 'לא נרשמה כניסה' : 'לא נרשמה כניסה היום'}</h1><p class="mut">${dayName(now)} ${dateStr(now)}</p>
    <h2>עדכן שעת כניסה</h2>
    <div class="grid2"><div><label>שעת כניסה</label><input type="time" id="r-in" value="${day ? "08:00" : hhmmNow()}"></div><div><label>שעת יציאה (אם כבר סיימת)</label><input type="time" id="r-out"></div></div>
    <p><button class="pri" data-act="remindsave">עדכן שעות</button></p>
    <h2>סמן יום חופש</h2>
    <select id="r-kind"><option value="off">יום חופש (לידיעה בלבד, בלי תשלום)</option><option value="vacation">חופשה בתשלום</option><option value="sick">מחלה</option><option value="holiday">חג</option></select>
    <p><button data-act="remindoff">סמן יום חופש</button> <button data-act="close">סגור</button></p>`);
}
if ('serviceWorker' in navigator) navigator.serviceWorker.addEventListener('message', e => { if (e.data && e.data.type === 'remind' && !$nav.hidden) handleRemind(e.data.kind); });
const HOL_FROM = '2026-10-01';
const addDays = (s, n) => new Date(new Date(s + 'T12:00:00Z').getTime() + n * 864e5).toISOString().slice(0, 10);
const holDismissed = () => { try { return JSON.parse(localStorage.getItem('hol-dismiss') || '[]'); } catch { return []; } };
// יום חג (לא ערב חג) בלי כניסה ובלי סימון אחר -> מסומן אוטומטית כחג
async function autoHolidays() {
  const today = ilYmd(new Date()), days = [];
  for (let d = HOL_FROM; d <= today; d = addDays(d, 1)) { const h = holidayOf(d); if (h && !h.erev && ilDow(d + 'T12:00:00Z') <= 5 && !holDismissed().includes(d)) days.push(d); }
  if (!days.length) return;
  const [lv, sh] = await Promise.all([store.leave(HOL_FROM, '2100-01-01'), store.shifts(new Date(HOL_FROM + 'T00:00:00').toISOString(), new Date(Date.now() + 864e5).toISOString())]);
  for (const d of days) { if (lv.some(l => l.day === d) || sh.some(s => ilYmd(s.start_at) === d)) continue; await store.addLeave(d, 'holiday'); }
}
async function reloadBase() {
  [S.settings, S.rates, S.payslips] = await Promise.all([store.settings(), store.rates(), store.payslips()]);
}

/* ---------- התחברות ---------- */
/* ---------- ניווט ---------- */
const TABS = [['clock', 'שעון'], ['month', 'חודש'], ['slips', 'תלושים'], ['sum', 'סיכום'], ['set', 'הגדרות']];
let _navPrev;
function renderNav() {
  const pop = _navPrev !== undefined && _navPrev !== S.tab; _navPrev = S.tab;
  $nav.querySelectorAll('button').forEach(x => x.remove());
  $nav.insertAdjacentHTML('beforeend', TABS.map(([k, t]) => `<button data-act="tab" data-k="${k}" class="${S.tab === k ? 'on' + (pop ? ' pop' : '') : ''}" ${S.tab === k ? 'aria-current="page"' : ''}>${icon(k)}<span>${t}</span></button>`).join(''));
  placeBubble($nav);
  selectNativeTab(S.tab, !$nav.hidden);
  initNativeTabs($nav, TABS, k => $nav.querySelector(`[data-k="${k}"]`)?.click());
}
let _planT; const replan = () => { if (!isNativeApp() || !S.settings) return; clearTimeout(_planT); _planT = setTimeout(() => { planReminders(S.settings).catch(e => console.warn('plan', e)); pushWidget().catch(e => console.warn('widget', e)); }, 1500); };
// מצב המשמרת לווידג'ט במסך הבית
async function pushWidget() {
  if (!widgetAvailable()) return;
  const a = await store.activeShift();
  await widgetPush({ active: !!a, start: a?.start_at });
}
// פעולות שנלחצו בווידג'ט: נרשמות בשעה המדויקת שבה נלחצו
async function processWidgetQueue() {
  if (!widgetAvailable() || $nav.hidden) return;
  const items = await widgetQueue(); let n = 0;
  for (const it of items) {
    const iso = new Date(it.ts * 1000).toISOString(), a = await store.activeShift();
    if (it.kind === 'in' && !a) { await store.startShift(iso); n++; }
    else if (it.kind === 'out' && a && iso > a.start_at) { await store.saveShift({ id: a.id, end_at: iso, break_minutes: a.break_minutes ?? (effBreak(S.settings) || 0) }); n++; }
  }
  if (n) { toast(`נרשמו ${n} פעולות מהווידג'ט`); render(); }
}
let _tapBound = false;
const SKEL = '<div class="skel" aria-busy="true"><i class="skel-h"></i><i class="skel-c"></i><i class="skel-c"></i><i class="skel-c s"></i></div>';
let _viewKey;
async function render() {
  clearInterval(S._t);
  renderNav();
  const key = [S.tab, S.page?.type, S.sub, S.setCat].join('|'), changed = _viewKey !== undefined && key !== _viewKey; _viewKey = key;
  const skT = changed ? setTimeout(() => { $app.innerHTML = SKEL; }, 150) : 0;
  try {
    if (S.page?.type === 'report') await viewReport();
    else if (S.page?.type === 'shifts') await viewShiftsPage();
    else if (S.tab === 'clock') await viewClock();
    else if (S.tab === 'month') await viewMonth();
    else if (S.tab === 'slips') await viewSlips();
    else if (S.tab === 'sum') await viewSummary();
    else await viewSettings();
  } catch (e) { $app.innerHTML = `<div class="card err">שגיאה: ${esc(e.message)}</div>`; console.error(e); }
  clearTimeout(skT);
  if (changed) { $app.classList.remove('swap'); void $app.offsetWidth; $app.classList.add('swap'); }
  replan();
}

/* ---------- שעון ---------- */
async function viewClock() {
  const now = new Date(), { y, m } = curLabel(now);
  const active = await store.activeShift();
  const stale = !!active && (Date.now() - new Date(active.start_at)) / 3600e3 > 16;
  const { calc } = await calcMonth(y, m);
  const recent = (await store.shifts(new Date(Date.now() - 60 * 864e5).toISOString(), new Date(Date.now() + 864e5).toISOString())).filter(s => s.end_at || (active && s.id === active.id ? false : true)).reverse().slice(0, 8);
  $app.innerHTML = `<h1>${esc(monthName(y, m))}</h1>${periodText(y, m) ? `<p class="mut" style="margin-top:-8px">${ltr(periodText(y, m))}</p>` : ''}
    ${stale ? `<div class="card miss" style="text-align:center">שכחת יציאה במשמרת מ-${dayName(active.start_at)} ${dateStr(active.start_at)} (כניסה ${hhmm(active.start_at)}).<br>הזן שעת יציאה כדי להמשיך.</div>
    <button class="bigbtn out" data-act="editshift" data-id="${active.id}" style="font-size:1.412rem">תקן יציאה</button>` : `<button class="bigbtn ${active ? 'out' : ''}" data-act="${active ? 'clockout' : 'clockin'}">${active ? 'יציאה' : 'כניסה'}</button>
    ${active ? `<div class="big" id="timer" style="text-align:center;direction:ltr;font-variant-numeric:tabular-nums">00:00:00</div><p class="mut" style="text-align:center">נכנסת ב-${hhmm(active.start_at)} · <a href="#" data-act="editshift" data-id="${active.id}">ערוך שעת כניסה</a></p>` : ''}`}
    ${S.rates.length ? '' : `<div class="card warn" style="text-align:center">עוד לא הוגדר שכר שעתי. עבור להגדרות ← שכר שעתי.</div>`}
    <div class="card" style="text-align:center"><div class="mut">סה״כ שעות החודש</div><div class="big">${hm(calc.hours)}</div></div>
    <h2>משמרות אחרונות</h2>
    <div class="card">${recent.length ? `<table><tr><th>יום ותאריך</th><th>כניסה</th><th>יציאה</th><th>סה״כ</th></tr>${recent.map(s =>
      `<tr class="${s.end_at ? '' : 'miss'}" data-act="viewshift" data-id="${s.id}"><td>${dayName(s.start_at)}<br><span class="mut">${dateStr(s.start_at)}</span></td><td>${ltr(hhmm(s.start_at))}</td><td>${s.end_at ? ltr(hhmm(s.end_at)) : 'חסרה'}</td><td><b>${s.end_at ? hm(shiftHours(s, effBreak(S.settings))) : '—'}</b></td></tr>`).join('')}</table>` : '<span class="mut">אין משמרות עדיין</span>'}</div>`;
  { const was = S._wasActive; S._wasActive = !!active; if (was !== undefined && was !== !!active) $app.querySelectorAll('.bigbtn,#timer').forEach(el => el.classList.add('flip')); }
  if (active && !stale) {
    const tick = () => { const el = document.getElementById('timer'); if (!el) return clearInterval(S._t); const s = Math.max(0, Math.floor((Date.now() - new Date(active.start_at)) / 1000)); el.textContent = [Math.floor(s / 3600), Math.floor(s % 3600 / 60), s % 60].map(x => String(x).padStart(2, '0')).join(':'); };
    tick(); S._t = setInterval(tick, 1000);
  }
}
async function clockIn(startISO) { await store.startShift(startISO || new Date().toISOString()); beep([880]); toast('נכנסת למשמרת'); render(); }
async function clockOut(endISO) {
  const a = await store.activeShift(); if (!a) return render();
  const end = endISO ? new Date(endISO) : new Date();
  const brk = effBreak(S.settings) || 0;
  const done = { ...a, end_at: end.toISOString(), break_minutes: a.break_minutes ?? brk };
  await store.saveShift({ id: a.id, end_at: done.end_at, break_minutes: done.break_minutes });
  beep([880, 660]);
  const st = new Date(a.start_at), { y, m } = curLabel(st);
  const { args } = await calcMonth(y, m);
  const est = shiftNetEstimate(args, args.shifts.find(s => s.id === a.id) || done);
  modal(`<h1>סיכום משמרת</h1>
    <div class="row"><span>יום ותאריך</span><b>${dayName(st)}, ${dateStr(st)}</b></div>
    <div class="row"><span>משעה עד שעה</span><b>${ltr(hhmm(st) + ' – ' + hhmm(end))}</b></div>
    ${done.break_minutes ? `<div class="row"><span>הפסקה</span><b>${done.break_minutes} דק׳</b></div>` : ''}
    <div class="row"><span>סה״כ שעות</span><b>${hm(est.hours)}</b></div>
    <div class="row"><span>שכר נטו למשמרת (הערכה)</span><b class="ok">${money(est.net)}</b></div>
    <p class="mut">הנטו הוא הפרש הנטו החודשי עם המשמרת ובלעדיה.</p>
    <p><button class="pri" data-act="close">סגור</button> <button data-act="editshift" data-id="${a.id}">ערוך משמרת</button></p>`);
  render();
}

/* ---------- חודש ---------- */
async function viewMonth() {
  const y = S.month.getFullYear(), m = S.month.getMonth() + 1;
  const { shifts, leave, calc } = await calcMonth(y, m);
  const lv = { vacation: 'חופשה', sick: 'מחלה', holiday: 'חג', reserve: 'מילואים', off: 'יום חופש (לידיעה)' };
  const hols = holidaysInRange(ymd(bounds(y, m).from), lastDayYmd(y, m));
  const workDays = S.settings.remind_days || [0, 1, 2, 3, 4, 5], today = ilYmd(new Date()), missing = [];
  if (shifts.length) for (let d = ymd(bounds(y, m).from); d < today && d <= lastDayYmd(y, m); d = addDays(d, 1)) {
    const h = holidayOf(d), dw = ilDow(d + 'T12:00:00Z');
    if (dw === 6 || !workDays.includes(dw) || (h && !h.erev)) continue;
    if (shifts.some(s => ilYmd(s.start_at) === d) || leave.some(l => l.day === d)) continue;
    missing.push(d);
  }
  $app.innerHTML = `<div class="monthbar"><button type="button" data-act="mprev" aria-label="חודש קודם">${icon('back', 'ic rtlflip')}</button>
      <button type="button" class="mtitle" data-act="mpick" aria-label="בחירת חודש">${esc(monthName(y, m))}${periodText(y, m) ? `<span class="mut mt-sub">${ltr(periodText(y, m))}</span>` : ''}${icon('down')}</button>
      <button type="button" data-act="mnext" aria-label="חודש הבא">${icon('chev', 'ic chev')}</button></div>
    <div class="card">
      <div class="row"><span>שעות</span><b>${hm(calc.hours)}</b></div>
      <div class="row"><span class="mut">רגילות / 125% / 150%</span><span class="mut">${ltr(num(calc.reg) + ' / ' + num(calc.ot125) + ' / ' + num(calc.ot150))}</span></div>
      ${calc.ot200 ? `<div class="row"><span class="mut">יום שבתון (200%)</span><span class="mut">${num(calc.ot200)}</span></div>` : ''}
      <div class="row"><span>ימי עבודה</span><b>${calc.workDays}${calc.leaveDays.vacation || calc.leaveDays.sickPaid || leave.length ? ` <span class="mut">(+ ${leave.length} ימי היעדרות)</span>` : ''}</b></div>
      <div class="row"><span>ברוטו</span><b>${money(calc.gross)}</b></div>
      <div class="row"><span>מס הכנסה</span><b>${money(calc.tax)}</b></div>
      ${calc.travel ? `<div class="row"><span>דמי נסיעות${calc.travelTaxable ? '' : ' (פטורים)'}</span><b>${money(calc.travel)}</b></div>` : ''}
      <div class="row"><span>ביטוח לאומי</span><b>${money(calc.bl)}</b></div>
      <div class="row"><span>ביטוח בריאות</span><b>${money(calc.health)}</b></div>
      <div class="row"><span>פנסיה (עובד)</span><b>${money(calc.pensionEmp)}</b></div>
      ${calc.other ? `<div class="row"><span>ניכויים נוספים</span><b>${money(calc.other)}</b></div>` : ''}
      <div class="row"><span><b>נטו</b></span><b class="ok" style="font-size:1.176rem">${money(calc.net)}</b></div>
      <div class="row"><span>הפקדות מעסיק (פנסיה + פיצויים)</span><b>${money(calc.pensionEmployer + calc.severance)}</b></div>
      <div class="row"><span>סה״כ הפקדה לפנסיה החודש</span><b>${money(calc.pensionEmp + calc.pensionEmployer + calc.severance)}</b></div>
    </div>
    <p><button class="pri" data-act="addshift">+ משמרת</button> <button data-act="addleave">+ חופשה / מחלה / חג</button></p>
    ${gList([gRow({ icon: 'list', color: 'blue', title: 'משמרות החודש', value: shifts.length, attrs: 'data-act="mshifts"' }), ...(shifts.length ? [gRow({ icon: 'report', color: 'pink', title: 'תצוגה מקדימה', attrs: `data-act="mreport" data-m="${y}-${String(m).padStart(2, '0')}"` })] : [])])}
    ${leave.length ? `<h2>ימי היעדרות</h2><div class="card">${leave.map(l => `<div class="row ${l.kind === 'holiday' ? 'hol' : 'off'}"><span>${dateStr(l.day)} · ${(lv[l.kind] || 'יום חופש')}${holidayOf(l.day) && l.kind === 'holiday' ? ' · ' + esc(holidayOf(l.day).name) : ''}</span><button class="dng" data-act="delleave" data-id="${l.id}" data-day="${l.day}" data-kind="${l.kind}">מחק</button></div>`).join('')}</div>` : ''}
    ${missing.length ? `<h2>ימים בלי כניסה</h2><div class="card">${missing.map(d => `<div class="row miss" data-act="missday" data-day="${d}"><span>${dayName(d + 'T12:00:00')} ${dateStr(d + 'T12:00:00')}</span><span>לא נרשמה כניסה</span></div>`).join('')}</div>` : ''}
    ${hols.length ? `<h2>חגים החודש</h2><div class="dayrows">${hols.map(h => `<div class="dayrow ${h.erev ? 'is-erev' : 'is-hol'}"><span>${dateStr(h.day)} · ${esc(h.name)}</span><span class="dr-day">${h.erev ? 'ערב חג' : dayName(h.day + 'T12:00:00')}</span></div>`).join('')}</div>` : ''}`;
}
/* ---------- משמרות החודש (מסך נפרד) ---------- */
async function viewShiftsPage() {
  const y = S.month.getFullYear(), m = S.month.getMonth() + 1;
  const { shifts } = await calcMonth(y, m);
  const rows = shifts.map(s => `<div class="row ${s.end_at ? '' : 'miss'}" data-act="viewshift" data-id="${s.id}"><span>${dayName(s.start_at)} ${dateStr(s.start_at)}<br><span class="mut">${ltr(hhmm(s.start_at) + ' – ' + (s.end_at ? hhmm(s.end_at) : 'חסרה יציאה'))}</span></span><b>${s.end_at ? hm(shiftHours(s, effBreak(S.settings))) + ' ש׳' : ''}</b></div>`).join('');
  const total = shifts.reduce((t, s) => t + (s.end_at ? shiftHours(s, effBreak(S.settings)) : 0), 0);
  $app.innerHTML = navbar({ start: backBtn('data-act="pageback"', 'חודש'), title: 'משמרות החודש', sub: `<span class="mut" style="font-size:.75rem">${esc(monthName(y, m))}</span>`, end: '<button type="button" class="nb-btn strong" data-act="addshift">הוסף</button>' })
    + `<div class="card"><div class="row"><span>סה״כ משמרות</span><b>${shifts.length}</b></div><div class="row"><span>סה״כ שעות</span><b>${hm(total)}</b></div></div>`
    + `<div class="card">${rows || '<p class="mut">אין משמרות בחודש הזה.</p><p><button class="pri" data-act="addshift">+ הוסף משמרת</button></p>'}</div>`;
}

/* ---------- בורר חודש ---------- */
function monthPicker(year) {
  const cur = S.month, mo = new Intl.DateTimeFormat('he-IL', { month: 'short' });
  modal(`<h1>בחירת חודש</h1>
    <div class="yearbar"><button type="button" data-act="mpyear" data-d="-1" aria-label="שנה קודמת">${icon('back', 'ic rtlflip')}</button><b id="mp-year">${year}</b><button type="button" data-act="mpyear" data-d="1" aria-label="שנה הבאה">${icon('chev', 'ic chev')}</button></div>
    <div class="mgrid">${Array.from({ length: 12 }, (_, i) => `<button type="button" data-act="mpset" data-y="${year}" data-m="${i}" class="${cur.getFullYear() === year && cur.getMonth() === i ? 'on' : ''}">${mo.format(new Date(year, i, 1))}</button>`).join('')}</div>
    <p><button type="button" data-act="mptoday">החודש הנוכחי</button> <button type="button" data-act="close">סגור</button></p>`);
}

/* ---------- תצוגה מקדימה של הדוח (זהה לדוח שנשלח במייל) ---------- */
async function viewReport() {
  const [y, m] = S.page.month.split('-').map(Number);
  const { shifts, leave, calc } = await calcMonth(y, m);
  const brk = effBreak(S.settings);
  const slip = S.payslips.filter(p => p.month === S.page.month).pop();
  const latest = [...S.payslips].reverse();
  const bal = latest.find(p => p.vacation_balance !== null && p.vacation_balance !== undefined) || null;
  const mk = S.page.month;
  const prev = S.payslips.filter(p => p.month < mk && p.month.slice(0, 4) === String(y));
  const ytdG = prev.reduce((t, p) => t + Number(p.gross || 0), 0) + calc.gross, ytdT = prev.reduce((t, p) => t + Number(p.tax || 0), 0) + calc.tax;
  const html = buildReportHtml({ y, m, c: calc, settings: { ...DEFAULT_SETTINGS, ...S.settings }, leave,
    shifts: shifts.map(s => ({ ...s, hours: s.end_at ? shiftHours(s, brk) : 0 })),
    employer: (latest[0] || {}).employer_name || '', bal, ytdGross: ytdG, ytdTax: ytdT,
    cmp: slip ? comparePayslip(slip, calc) : null });
  $app.innerHTML = navbar({ start: backBtn('data-act="pageback"', S.page.from === 'slips' ? 'תלושים' : S.page.from === 'set' ? 'הגדרות' : 'חודש'), title: 'תצוגה מקדימה', sub: `<span class="mut" style="font-size:.75rem">${esc(monthName(y, m))}</span>`, end: `<button type="button" class="nb-btn" data-act="mailreport" data-m="${mk}">שלח למייל</button>` })
    + (shifts.length || leave.length ? `<iframe id="rep-frame" class="rep-frame" title="תצוגה מקדימה של הדוח"></iframe>` : '<div class="card"><p class="mut">אין שעות בחודש הזה, ולכן אין דוח.</p><p><button class="pri" data-act="addshift">+ הוסף משמרת</button></p></div>');
  const fr = document.getElementById('rep-frame');
  if (fr) {
    fr.srcdoc = `<!doctype html><html dir="rtl"><meta name="viewport" content="width=device-width,initial-scale=1"><body style="margin:0;padding:12px;background:#fff">${html}</body></html>`;
    fr.onload = () => { try { fr.style.height = fr.contentDocument.documentElement.scrollHeight + 'px'; } catch {} };
  }
}

async function shiftDetails(s) {
  S._openShift = s;
  const st = new Date(s.start_at), { y, m } = curLabel(st);
  const { args } = await calcMonth(y, m);
  const set = { ...DEFAULT_SETTINGS, ...S.settings }, brk = effBreak(set);
  const day = ilYmd(st), rest = ilDow(st) === 6;
  const before = args.shifts.filter(x => x.end_at && x.id !== s.id && ilYmd(x.start_at) === day && x.start_at < s.start_at).reduce((t, x) => t + shiftHours(x, brk), 0);
  const h = s.end_at ? shiftHours(s, brk) : 0;
  const sp200 = !!SPECIAL_DAYS[day]?.pay200;
  const a1 = splitDay(before + h, rest, set, sp200), a0 = splitDay(before, rest, set, sp200);
  const reg = a1.reg - a0.reg, o125 = a1.ot125 - a0.ot125, o150 = a1.ot150 - a0.ot150, o200 = a1.ot200 - a0.ot200;
  const est = s.end_at ? shiftNetEstimate(args, s) : null;
  const hol = holidayOf(day);
  modal(`<h1>פרטי משמרת</h1>
    <div class="row"><span>יום ותאריך</span><b>${dayName(st)}, ${dateStr(st)}${hol && !hol.erev ? ' · ' + esc(hol.name) : ''}</b></div>
    <div class="row"><span>כניסה</span><b>${ltr(hhmm(st))}</b></div>
    <div class="row ${s.end_at ? '' : 'miss'}"><span>יציאה</span><b>${s.end_at ? ltr(hhmm(s.end_at)) : 'חסרה יציאה'}</b></div>
    ${s.end_at ? `<div class="row"><span><b>סה״כ שעות</b></span><b>${hm(h)}</b></div>
    <h2>פירוט שעות</h2>
    <div class="row"><span>שעות רגילות 100%</span><b>${hm(reg)}</b></div>
    <div class="row"><span>שעות נוספות 125%</span><b>${hm(o125)}</b></div>
    <div class="row"><span>שעות נוספות 150%</span><b>${hm(o150)}</b></div>
    ${sp200 ? `<div class="row"><span>יום שבתון 200%</span><b>${hm(o200)}</b></div><p class="mut">${esc(SPECIAL_DAYS[day].name)}: מי שעובד ביום זה מקבל 200% (אלא אם יש הסכם אחר).</p>` : ''}
    ${rest ? '<p class="mut">שבת: כל השעות ב-150%.</p>' : ''}
    ${before ? '<p class="mut">יש משמרת קודמת באותו יום, והפירוט מחושב ביחד איתה.</p>' : ''}
    <div class="row"><span>שכר נטו למשמרת (הערכה)</span><b class="ok">${money(est.net)}</b></div>` : '<p class="mut">המשמרת עדיין פתוחה.</p>'}
    <p><button class="pri" data-act="editshift" data-id="${s.id}">עריכה</button> <button data-act="close">סגור</button></p>`);
}
async function shiftForm(s, opts = {}) {
  const st = s?.start_at || new Date().toISOString(), en = s?.end_at || (opts.endNow ? new Date().toISOString() : '');
  const brk = s?.break_minutes ?? effBreak(S.settings) ?? 0;
  modal(`<h1>${s?.id ? 'עריכת משמרת' : 'משמרת חדשה'}</h1>
    <label>כניסה</label><input type="datetime-local" id="f-start" value="${toLocalInput(st)}">
    <label>יציאה <span class="mut">(אפשר להשאיר ריק אם עוד לא יצאת)</span></label><input type="datetime-local" id="f-end" value="${en ? toLocalInput(en) : ''}">
    <input type="hidden" id="f-brk" value="${brk}">
    <div class="card" id="f-sum"><h2 style="margin:0 0 6px">סיכום משמרת</h2><div class="mut">מחשב…</div></div>
    <p><button class="pri" data-act="saveshift" data-id="${s?.id || ''}">שמור</button>
    ${s?.id ? `<button class="dng" data-act="delshift" data-id="${s.id}">מחק</button>` : ''} <button data-act="close">ביטול</button></p>`);
  let args = null, argsKey = '';
  const upd = async () => {
    const box = document.getElementById('f-sum'); if (!box) return;
    const v1 = $('#f-start').value, v2 = $('#f-end').value;
    if (!v1 || !v2) { box.innerHTML = '<h2 style="margin:0 0 6px">סיכום משמרת</h2><div class="mut">יוצג אחרי שתמלא כניסה ויציאה</div>'; return; }
    const sh = { id: s?.id, start_at: new Date(v1).toISOString(), end_at: new Date(v2).toISOString(), break_minutes: Number($('#f-brk').value || 0) };
    if (sh.end_at <= sh.start_at) { box.innerHTML = '<h2 style="margin:0 0 6px">סיכום משמרת</h2><div class="bad">היציאה חייבת להיות אחרי הכניסה</div>'; return; }
    const d0 = new Date(sh.start_at), lb = curLabel(d0), key = lb.y + '-' + lb.m;
    if (key !== argsKey) { try { args = (await calcMonth(lb.y, lb.m)).args; argsKey = key; } catch { args = null; } }
    if (!args) { box.innerHTML = '<div class="mut">אין נתונים לחישוב</div>'; return; }
    const e = shiftNetEstimate(args, sh);
    box.innerHTML = `<h2 style="margin:0 0 6px">סיכום משמרת</h2><div class="row"><span>סך שעות</span><b>${hm(e.hours)}</b></div><div class="row"><span>שכר נטו למשמרת</span><b class="ok">₪${e.net.toLocaleString('he-IL')}</b></div>`;
  };
  ['f-start', 'f-end'].forEach(id => document.getElementById(id).addEventListener('input', upd));
  upd();
}
function leaveForm() {
  modal(`<h1>הוספת יום היעדרות</h1>
    <label>תאריך</label><input type="date" id="l-day" value="${ymd(new Date())}">
    <label>סוג</label><select id="l-kind"><option value="vacation">חופשה</option><option value="sick">מחלה</option><option value="holiday">חג</option><option value="reserve">מילואים</option><option value="off">יום חופש (לידיעה בלבד, בלי תשלום)</option></select>
    <p><button class="pri" data-act="saveleave">שמור</button> <button data-act="close">ביטול</button></p>`);
}

/* ---------- תלושים והשוואה ---------- */
async function viewSlips() {
  const list = [...S.payslips].sort((x, y) => x.month.localeCompare(y.month));
  const years = [...new Set(list.map(p => p.month.slice(0, 4)))].reverse();
  if (!S.openYears) S.openYears = new Set(years.slice(0, 1));
  const body = years.map(y => {
    const l = list.filter(p => p.month.startsWith(y)), open = S.openYears.has(y);
    return `<div class="card"><div class="row" data-act="toggleyear" data-y="${y}" style="border:0;cursor:pointer"><b style="font-size:1.059rem">${y}</b><span class="mut" style="display:inline-flex;align-items:center;gap:6px">${l.length} תלושים <span style="display:inline-flex;transition:transform .2s;${open ? 'transform:rotate(180deg)' : ''}">${icon('down')}</span></span></div>
      ${open ? l.map(p => `<div class="row" data-act="openslip" data-id="${p.id}"><span>${p.month.slice(5)}/${y} · ${esc(p.employer_name || '')}${p.is_corrected ? ' <span class="pill">מתוקן</span>' : ''}${p.file_path ? ` <span class="mut" style="display:inline-flex;vertical-align:middle">${icon('doc')}</span>` : ''}</span><b>${money(p.net)}</b></div>`).join('') : ''}</div>`;
  }).join('');
  $app.innerHTML = `<h1>תלושי שכר</h1><p><button class="pri" data-act="addslip">+ הוסף תלוש</button></p>${body || '<div class="card"><span class="mut">אין תלושים. אפשר לייבא היסטוריה מההגדרות.</span></div>'}`;
}
// בדיקת חישוב מתוך הברוטו של התלוש עצמו
async function verifyFromGross(p) {
  const [y, m] = p.month.split('-').map(Number);
  const par = PARAMS[y]; if (!par) return null;
  const prior = await yearPriorFromSlips(p);
  const ins = insurance(Number(p.gross), par);
  const insured = p.insured_salary ? Number(p.insured_salary) : null;
  const pen = insured ? pension(insured) : null;
  const tax = cumulativeTax({ year: y, monthIndex: prior.monthIndex + 1, cumIncome: prior.cumIncome + Number(p.gross), credits: S.settings.credit_points, discountPct: y >= 2025 && p.month >= '2025-04' ? S.settings.settlement_discount_pct / 100 : 0, discountCeiling: S.settings.settlement_ceiling, taxPaidBefore: prior.taxPaid });
  return { gross: Number(p.gross), tax: Math.max(0, tax), bl: ins.bl, health: ins.health, pensionEmp: pen?.emp ?? null, net: null };
}
async function yearPriorFromSlips(p) {
  const y = p.month.slice(0, 4);
  const list = S.payslips.filter(x => x.month.startsWith(y) && x.month < p.month && x.id !== p.id);
  if (!list.length) return { cumIncome: 0, taxPaid: 0, monthIndex: 0 };
  const first = Math.min(...list.map(x => +x.month.slice(5)));
  return { cumIncome: list.reduce((a, x) => a + Number(x.gross || 0), 0), taxPaid: list.reduce((a, x) => a + Number(x.income_tax || 0), 0), monthIndex: +p.month.slice(5) - first };
}
async function scanSlip(p) {
  const st = $('#scan-st'); if (st) st.textContent = 'קורא את קובץ התלוש...';
  try {
    const url = await store.slipFileUrl(p.file_path), blob = await (await fetch(url)).blob();
    const ext = (p.file_path.split('.').pop() || '').toLowerCase();
    const type = ext === 'pdf' ? 'application/pdf' : ext === 'png' ? 'image/png' : (ext === 'jpg' || ext === 'jpeg') ? 'image/jpeg' : (blob.type || 'application/pdf');
    const b64 = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.onerror = rej; r.readAsDataURL(blob); });
    const d = await store.readPayslipFile(b64, type);
    await store.savePayslip({ month: p.month, employer_name: p.employer_name, recovery: d.recovery ?? 0, vacation_pay: d.vacation_pay ?? 0, bonuses: Array.isArray(d.bonuses) ? d.bonuses : [] });
    S.payslips = await store.payslips();
    if (document.getElementById('scan-st')) { closeModal(); return openSlip(S.payslips.find(x => x.id === p.id)); }
  } catch (err) { const s2 = $('#scan-st'); if (s2) s2.textContent = 'לא הצלחתי לקרוא: ' + err.message; }
}
const needsScan = p => !!p.file_path && (p.bonuses == null || p.vacation_pay == null);
async function openSlip(p) {
  const [y, m] = p.month.split('-').map(Number);
  const v = await verifyFromGross(p);
  const rowsA = v ? comparePayslip(p, v).filter(r => ['מס הכנסה', 'ביטוח לאומי', 'ביטוח בריאות', 'פנסיה (עובד)'].includes(r.name)) : [];
  const mine = await calcMonth(y, m);
  const hasShifts = mine.shifts.length > 0;
  const rowsB = hasShifts ? comparePayslip(p, mine.calc).filter(r => ['ברוטו', 'נטו'].includes(r.name)) : [];
  const bad = [...rowsA, ...rowsB].filter(r => r.status === 'diff');
  const tbl = rows => `<table><tr><th></th><th>בתלוש</th><th>אצלנו</th><th>פער</th></tr>${rows.map(r => `<tr><td>${r.name}</td><td>${money(r.slip)}</td><td>${money(r.calc)}</td><td class="${r.status === 'ok' ? 'ok' : 'bad'}">${r.status === 'ok' ? '✓' : money(r.diff)}</td></tr>`).join('')}</table>`;
  modal(`<h1>תלוש ${p.month}</h1><p class="mut">${esc(p.employer_name || '')}${p.note ? ' · ' + esc(p.note) : ''}</p>
    <div class="row"><span>ברוטו</span><b class="bad">${money(p.gross)}</b></div><div class="row"><span>נטו</span><b class="ok">${money(p.net)}</b></div>
    <div class="row"><span>שעות</span><b>${num(p.hours)}</b></div>
    <div class="row"><span>יתרת חופשה / מחלה</span><b>${num(p.vacation_balance)} / ${num(p.sick_balance)}</b></div>
    <h2>בדיקת ניכויים (חישוב מהברוטו)</h2>${rowsA.length ? tbl(rowsA) : '<p class="mut">אין נתונים לבדיקה</p>'}
    ${slipBonusHtml(p)}
    <h2>בדיקה מול השעות באפליקציה</h2>${hasShifts ? tbl(rowsB) : '<p class="mut">אין משמרות באפליקציה לחודש זה</p>'}
    <p class="${bad.length ? 'bad' : 'ok'}">${bad.length ? `נמצאו ${bad.length} פערים` : 'לא נמצאו פערים'}</p>
    <p>${p.file_path ? `<button class="pri" data-act="viewfile" data-id="${p.id}">הצג תלוש</button> ` : ''}<label class="btn" style="display:inline-block;margin:0">${p.file_path ? 'החלף קובץ' : 'צרף קובץ תלוש'}<input type="file" id="att-file" data-id="${p.id}" accept="application/pdf,image/*" hidden></label></p>
    ${hasShifts ? `<p><button data-act="mreport" data-m="${p.month}">תצוגה מקדימה</button></p>` : ''}
    <p>${bad.length ? `<button class="pri" data-act="mailfix" data-id="${p.id}">הכן מייל תיקון</button> ` : ''}<button class="dng" data-act="delslip" data-id="${p.id}">מחק</button> <button data-act="close">סגור</button></p>
    <p class="mut">הפרש של עד ₪2 בניכויים נחשב תקין (עיגולים).</p>`);
  S._bad = bad;
  S._scanTried = S._scanTried || new Set();
  if (needsScan(p) && !S._scanTried.has(p.id)) { S._scanTried.add(p.id); scanSlip(p); }
}
function slipBonusHtml(p) {
  const bon = Array.isArray(p.bonuses) ? p.bonuses.filter(b => Number(b.amount)) : [];
  const rec = Number(p.recovery || 0), vac = Number(p.vacation_pay || 0);
  const scan = needsScan(p) ? `<div id="scan-st" class="mut">קורא את קובץ התלוש...</div><p><button type="button" data-act="slipscan" data-id="${p.id}">נסה שוב</button></p>` : '';
  if (!bon.length && !rec && !vac) return scan;
  const row = (n, v, c = '') => `<div class="row bonus-row ${c}"><span>${esc(n)}</span><b>${money(v)}</b></div>`;
  return `<div class="bonus-box"><h2>בונוסים ותוספות</h2>${rec ? row('הבראה חודשית', rec, 'rec') : ''}${vac ? row('דמי חופשה בפועל', vac) : ''}${bon.map(b => row(b.name, b.amount)).join('')}</div>${scan}`;
}
function slipForm() {
  const t = new Date(); const mk = monthKey(new Date(t.getFullYear(), t.getMonth() - 1, 1));
  modal(`<h1>הוספת תלוש</h1>
    ${isGuest()
      ? `<div class="auto-off" aria-disabled="true"><label>קריאה אוטומטית (PDF או תמונה)</label><input type="file" id="s-file" accept="application/pdf,image/*" disabled><div id="s-st" class="mut">זמין רק למשתמש רשום</div></div>`
      : `<label>קריאה אוטומטית (PDF או תמונה)</label><input type="file" id="s-file" accept="application/pdf,image/*"><div id="s-st" class="mut"></div>`}
    <div class="grid2"><div><label>חודש (YYYY-MM)</label><input id="s-month" value="${mk}"></div><div><label>מעסיק</label><input id="s-emp" value="סמארטפיקס"></div>
    <div><label>ברוטו</label><input id="s-gross" type="number" step="0.01"></div><div><label>נטו</label><input id="s-net" type="number" step="0.01"></div>
    <div><label>מס הכנסה</label><input id="s-tax" type="number" step="0.01" value="0"></div><div><label>ביטוח לאומי</label><input id="s-bl" type="number" step="0.01"></div>
    <div><label>ביטוח בריאות</label><input id="s-h" type="number" step="0.01"></div><div><label>פנסיה (עובד)</label><input id="s-pen" type="number" step="0.01"></div>
    <div><label>שכר מבוטח</label><input id="s-ins" type="number" step="0.01"></div><div><label>שעות</label><input id="s-hours" type="number" step="0.01"></div>
    <div><label>יתרת חופשה</label><input id="s-vac" type="number" step="0.01"></div><div><label>יתרת מחלה</label><input id="s-sick" type="number" step="0.01"></div></div>
    <p><button class="pri" data-act="saveslip">שמור</button> <button data-act="close">ביטול</button></p>`);
  if (!isGuest()) $('#s-file').addEventListener('change', e => { const f = e.target.files[0]; if (f) readSlipIntoForm(f); });
}
// קורא קובץ תלוש (PDF או תמונה) וממלא את הטופס
async function readSlipIntoForm(f) {
  const st = $('#s-st'); if (!st) return;
  if (isGuest()) { st.textContent = 'זמין רק למשתמש רשום'; return; }
  st.textContent = 'קורא תלוש...';
  try {
    const b64 = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.onerror = rej; r.readAsDataURL(f); });
    const d = await store.readPayslipFile(b64, f.type || 'application/pdf');
    const set = (id, v) => { if (v !== null && v !== undefined) $(id).value = v; };
    set('#s-month', d.month); set('#s-gross', d.gross); set('#s-net', d.net); set('#s-tax', d.income_tax); set('#s-bl', d.national_insurance);
    set('#s-h', d.health); set('#s-pen', d.pension_emp); set('#s-ins', d.insured_salary); set('#s-hours', d.hours); set('#s-vac', d.vacation_balance); set('#s-sick', d.sick_balance);
    S._slipExtra = { recovery: d.recovery ?? null, vacation_pay: d.vacation_pay ?? null, bonuses: Array.isArray(d.bonuses) ? d.bonuses : [] };
    st.textContent = 'נקרא. בדוק את הערכים ושמור.';
  } catch (err) { st.textContent = 'לא הצלחתי לקרוא: ' + err.message; }
}
// ===== קבלת תלוש משיתוף של iOS (שתף ← מחשבון שכר) =====
function openUrl(url) {
  if (/^file:/i.test(String(url || ''))) { S._shared = url; return processShared(); }
  return handleDeepLink(url);
}
async function processShared() {
  if (!S._shared || !S.settings) return;                    // עוד לא מחוברים או לא סיימנו לטעון: ממשיכים אחרי האתחול
  const url = S._shared; S._shared = null;
  try {
    const name = decodeURIComponent(url.split('/').pop() || 'slip'), ext = (name.split('.').pop() || '').toLowerCase();
    const type = ext === 'pdf' ? 'application/pdf' : ext === 'png' ? 'image/png' : ext === 'heic' ? 'image/heic' : 'image/jpeg';
    if (!['pdf', 'png', 'jpg', 'jpeg', 'heic'].includes(ext)) return toast('אפשר לשתף רק PDF או תמונה של תלוש', true);
    const res = await fetch(window.Capacitor?.convertFileSrc ? window.Capacitor.convertFileSrc(url) : url); if (!res.ok) throw new Error('הקובץ לא נקרא');
    const file = new File([await res.blob()], name, { type });
    closeModal(); S.tab = 'slips'; S.sub = null; S.page = null; $nav.hidden = false; renderNav(); await render();
    slipForm(); haptic('success');
    if (isGuest()) return toast('קריאה אוטומטית זמינה רק למשתמש רשום. אפשר למלא ידנית.');
    await readSlipIntoForm(file);
  } catch (e) { toast('לא הצלחתי לפתוח את הקובץ: ' + e.message, true); }
}
const nv = id => { const v = $(id).value; return v === '' ? null : Number(v); };

/* ---------- סיכום ---------- */
async function viewSummary() {
  if (S.sub) return viewSub();
  const c = (ic, color, title, sub, k) => `<button type="button" class="hcard" data-act="sub" data-k="${k}">${tileIcon(ic, color)}<b>${title}</b><small>${sub}</small></button>`;
  $app.innerHTML = `<h1>סיכום</h1><h2 class="sec">הדוחות שלי</h2><div class="hcards">${[c('income', 'green', 'הכנסה שנתית', 'ברוטו ונטו לפי חודש', 'income'), c('leave', 'orange', 'חופשה ומחלה', 'ימים וצבירה', 'leave'), c('pension', 'blue', 'קופת פנסיה', 'הפקדות וצבירה', 'pen'), c('years', 'purple', 'שנים קודמות', 'מידע מתלושים ישנים', 'years')].join('')}</div>`;
}
function incomeChart(list) {
  const by = {}; for (const p of list) { const mo = +p.month.slice(5); by[mo] = by[mo] || { g: 0, n: 0 }; by[mo].g += Number(p.gross || 0); by[mo].n += Number(p.net || 0); }
  const max = Math.max(1, ...Object.values(by).map(x => x.g)), W = 340, H = 170, top = 14, base = H - 22, bw = 10, step = W / 12;
  let svg = `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="ברוטו ונטו לפי חודש" style="direction:ltr">`;
  svg += `<line x1="0" y1="${base}" x2="${W}" y2="${base}" stroke="var(--line)"/>`;
  for (let mo = 1; mo <= 12; mo++) {
    const x = (mo - 1) * step + step / 2, d = by[mo];
    if (d) {
      const gh = (d.g / max) * (base - top), nh = (d.n / max) * (base - top);
      svg += `<rect x="${x - bw - 1}" y="${base - gh}" width="${bw}" height="${gh}" rx="2" fill="var(--bad)"/><rect x="${x + 1}" y="${base - nh}" width="${bw}" height="${nh}" rx="2" fill="var(--ok)"/>`;
      svg += `<text x="${x}" y="${base - gh - 3}" text-anchor="middle" font-size="8" fill="var(--mut)">${Math.round(d.g / 100) / 10}k</text>`;
    }
    svg += `<text x="${x}" y="${H - 6}" text-anchor="middle" font-size="10" fill="var(--mut)">${mo}</text>`;
  }
  return svg + `</svg><div class="mut" style="display:flex;gap:14px;justify-content:center"><span><b class="bad">■</b> ברוטו</span><span><b class="ok">■</b> נטו</span></div>`;
}
async function viewSub() {
  const k = S.sub, nbSub = (title, to = null) => navbar({ start: backBtn(to ? `data-act="sub" data-k="${to}"` : 'data-act="subback"', to ? 'כל השנים' : 'סיכום'), title }), back = '';
  const slips = S.payslips;
  const years = [...new Set(slips.map(p => p.month.slice(0, 4)))].sort();
  if (k === 'years') {
    const asc = years;
    $app.innerHTML = nbSub('שנים קודמות') + (asc.map(y => { const l = slips.filter(p => p.month.startsWith(y)); const s = f => l.reduce((t, p) => t + Number(p[f] || 0), 0);
      return `<div class="card" data-act="year" data-y="${y}"><div class="row" style="border:0"><b style="font-size:1.176rem">${y}</b><span class="mut">${l.length} תלושים · ${num(s('hours'))} שעות</span></div>
        <div class="row"><span>ברוטו</span><b class="bad">${money(s('gross'))}</b></div><div class="row"><span>נטו</span><b class="ok">${money(s('net'))}</b></div></div>`; }).join('') || '<p class="mut">אין נתונים</p>');
  } else if (k === 'year') {
    const y = S.year, l = slips.filter(p => p.month.startsWith(y)); const s = f => l.reduce((t, p) => t + Number(p[f] || 0), 0);
    $app.innerHTML = nbSub(y, 'years') + `
      <div class="card"><div class="row"><span>ברוטו</span><b class="bad">${money(s('gross'))}</b></div><div class="row"><span>נטו</span><b class="ok">${money(s('net'))}</b></div>
      <div class="row"><span>מס הכנסה</span><b>${money(s('income_tax'))}</b></div><div class="row"><span>ביטוח לאומי</span><b>${money(s('national_insurance'))}</b></div><div class="row"><span>ביטוח בריאות</span><b>${money(s('health'))}</b></div>
      <div class="row"><span>פנסיה (עובד)</span><b>${money(s('pension_emp'))}</b></div><div class="row"><span>פנסיה (מעסיק + פיצויים)</span><b>${money(s('pension_employer') + s('severance'))}</b></div>
      <div class="row"><span>שעות</span><b>${num(s('hours'))}</b></div><div class="row"><span>ימי עבודה</span><b>${num(s('workdays'))}</b></div></div>
      <h2>לפי חודשים</h2><div class="card"><table><tr><th>חודש</th><th>שעות</th><th>ברוטו</th><th>נטו</th></tr>${l.map(p => `<tr data-act="openslip" data-id="${p.id}"><td>${p.month.slice(5)}<br><span class="mut">${esc((p.employer_name || '').slice(0, 10))}</span></td><td>${num(p.hours)}</td><td class="bad">${money(p.gross)}</td><td class="ok"><b>${money(p.net)}</b></td></tr>`).join('')}</table></div>`;
  } else if (k === 'income') {
    const y = String(new Date().getFullYear()), l = slips.filter(p => p.month.startsWith(y)), s = f => l.reduce((t, p) => t + Number(p[f] || 0), 0);
    $app.innerHTML = nbSub(`הכנסה שנתית ${y}`) + `<div class="card"><div class="mut">${l.length} תלושים</div>
      <div class="row"><span>ברוטו</span><b class="bad">${money(s('gross'))}</b></div><div class="row"><span>נטו</span><b class="ok">${money(s('net'))}</b></div></div>
      <h2>לפי חודשים</h2><div class="card">${incomeChart(l)}</div>`;
  } else if (k === 'leave') {
    const withBal = [...slips].filter(p => p.vacation_balance != null || p.sick_balance != null).sort((x, y) => y.month.localeCompare(x.month));
    const last = withBal[0]; let uv = 0, us = 0;
    if (last) { const [y, m] = last.month.split('-').map(Number); const lv = await store.leave(ymd(new Date(y, m, 1)), '2100-01-01'); uv = lv.filter(l => l.kind === 'vacation').length; us = lv.filter(l => l.kind === 'sick').length; }
    const v = last && last.vacation_balance != null ? num(Number(last.vacation_balance) - uv) : '—', sk = last && last.sick_balance != null ? num(Number(last.sick_balance) - us) : '—';
    $app.innerHTML = nbSub('חופשה ומחלה') + `<div class="grid2"><div class="card" style="text-align:center"><div class="mut">חופשה</div><div class="big">${v}</div></div><div class="card" style="text-align:center"><div class="mut">מחלה</div><div class="big">${sk}</div></div></div>
      <p class="mut">${last ? `יתרה לפי תלוש ${last.month}${uv || us ? ' · בניכוי ניצול מאז' : ''}` : 'אין יתרות בתלושים'}</p>
      <div class="card"><table><tr><th>חודש</th><th>חופשה</th><th>מחלה</th></tr>${withBal.slice(0, 6).map(p => `<tr><td>${p.month}</td><td>${num(p.vacation_balance)}</td><td>${num(p.sick_balance)}</td></tr>`).join('')}</table></div>`;
  } else {
    const pslips = slips.filter(p => p.month >= PENSION_START); const rows = [...new Set(pslips.map(p => p.month.slice(0, 4)))].map(y => { const l = pslips.filter(p => p.month.startsWith(y)); const s = f => l.reduce((a, p) => a + Number(p[f] || 0), 0); return { y, e: s('pension_emp'), er: s('pension_employer'), sv: s('severance') }; });
    const tot = rows.reduce((a, r) => a + r.e + r.er + r.sv, 0);
    const now = new Date(); const lb = curLabel(now); const { calc } = await calcMonth(lb.y, lb.m);
    $app.innerHTML = nbSub('קופת פנסיה') + `<div class="card" style="text-align:center"><div class="mut">סה״כ הפקדות לפי התלושים</div><div class="big">${money(tot)}</div></div>
      <div class="card"><div class="mut">החודש (הערכה)</div><div class="row"><span>עובד</span><b>${money(calc.pensionEmp)}</b></div><div class="row"><span>מעסיק</span><b>${money(calc.pensionEmployer)}</b></div><div class="row"><span>פיצויים</span><b>${money(calc.severance)}</b></div><div class="row"><b>סה״כ</b><b>${money(calc.pensionEmp + calc.pensionEmployer + calc.severance)}</b></div></div>
      ${rows.map(r => `<div class="card"><b>${r.y}</b><div class="row"><span>עובד</span><b>${money(r.e)}</b></div><div class="row"><span>מעסיק</span><b>${money(r.er)}</b></div><div class="row"><span>פיצויים</span><b>${money(r.sv)}</b></div></div>`).join('')}`;
  }
}

/* ---------- הגדרות ---------- */
async function renderAccountCard() {
  const el = document.getElementById('acct-card'); if (!el) return;
  if (isGuest()) {
    el.innerHTML = `<h2 style="margin-top:0">חשבון</h2><p class="mut">אתה עובד כאורח: הנתונים נשמרים רק במכשיר הזה. שדרוג לחשבון מעביר אותם לענן, ומאפשר להתחבר מכל מכשיר.</p>
      <p><button class="pri" data-act="acct-upgrade">שדרג לחשבון</button> <button data-act="acct-leave-guest">יציאה מהמצב אורח</button></p>
      <p><button data-act="rerun-wizard">הפעל שוב את אשף ההתחלה</button></p>`;
    return;
  }
  el.innerHTML = '<h2 style="margin-top:0">חשבון</h2><p class="mut">טוען...</p>';
  let email = '', factors = [];
  try { [email, factors] = await Promise.all([auth.email(), auth.mfa.verified()]); } catch {}
  el.innerHTML = `<h2 style="margin-top:0">חשבון</h2><div class="row"><span>מחובר כ-</span><b dir="ltr">${esc(email || '')}</b></div>
    <div class="row"><span>אימות דו-שלבי</span><b class="${factors.length ? 'ok' : 'mut'}">${factors.length ? 'פעיל' : 'כבוי'}</b></div>
    <p>${factors.length ? '<button class="dng" data-act="acct-mfa-remove">בטל אימות דו-שלבי</button>' : '<button class="pri" data-act="acct-mfa-setup">הפעל אימות דו-שלבי</button>'} <button class="dng" data-act="logout">התנתק</button></p>
    <p><button data-act="rerun-wizard">הפעל שוב את אשף ההתחלה</button></p>
    <p class="mut" style="margin-top:20px">מחיקת החשבון מסירה לצמיתות את כל הנתונים והתלושים שלך.</p>
    <p><button class="dng" data-act="acct-delete">מחק חשבון</button></p>`;
}
/* ---------- הגדרות: רשימת קטגוריות ← מסך קטגוריה (עריכה / שמור / בטל) ---------- */
const SET_CATS = {
  pay:   { title: 'שכר ועבודה', icon: 'pay', color: 'green', edit: true },
  tax:   { title: 'מס', icon: 'tax', color: 'orange', edit: true },
  slips: { title: 'תלושים ודוחות', icon: 'doc', color: 'blue', edit: true },
  notif: { title: 'התראות ומיקום', icon: 'bell', color: 'red', edit: true },
  look:  { title: 'מראה', icon: 'look', color: 'purple', edit: false },
  acct:  { title: 'חשבון', icon: 'person', color: 'gray', edit: false },
  data:  { title: 'נתונים', icon: 'tray', color: 'teal', edit: false },
};
const chk = (text, on = true) => `<span class="chk ${on ? '' : 'off'}">${on ? icon('check') : ''}${text}</span>`;
// האם קטגוריה הושלמה: מציג וי בסוף השורה
function catDone(k) {
  const s = S.settings, pr = s.profile || {};
  return { pay: S.rates.length > 0, tax: !!pr.settlement_name || Number(s.credit_points) > 0, slips: !!pr.employer_email, notif: !!S._pushOn, look: false, acct: getMode() === 'cloud', data: false }[k];
}
async function pushActive() {
  if (!isNativeApp()) return !!(window.Notification && Notification.permission === 'granted');
  try { return await hasNotifPermission(); } catch { return false; }
}
async function viewSettings() {
  S._pushOn = await pushActive() && S.settings.remind_enabled !== false;
  return S.setCat ? settingsCat(S.setCat) : settingsHome();
}
const placeMsg = v => { v = String(v || '').trim(); if (!v) return ''; const r = findSettlement(v); return r ? `✓ יישוב מזכה: הנחה ${r[1]}% עד ${r[2].toLocaleString('he-IL')} ₪ בשנה` : 'היישוב שנבחר לא זכאי'; };
const placeCls = v => { v = String(v || '').trim(); return !v ? '' : findSettlement(v) ? 'ok' : 'bad'; };
function settingsHome() {
  const row = k => gRow({ icon: SET_CATS[k].icon, color: SET_CATS[k].color, title: SET_CATS[k].title, attrs: `data-act="setcat" data-k="${k}"`, check: catDone(k) });
  $app.innerHTML = `<h1>הגדרות</h1>${gList(['pay', 'tax', 'slips', 'notif'].map(row))}${gList(['look', 'acct', 'data'].map(row))}`;
}
function settingsCat(k) {
  const c = SET_CATS[k], editing = S.edit && c.edit, dis = editing ? '' : 'disabled';
  const base = S.settings, dr = S.draft;
  const s = dr ? { ...base, ...dr, profile: { ...(base.profile || {}), ...(dr.profile || {}) } } : base;
  const list = (arr, name) => arr.map((e, i) => `<div class="row"><span>${esc(e.name)}: ${money(e.amount)}${e.pensionable ? ' · מבוטח' : ''}</span><button class="dng" data-act="del-${name}" data-i="${i}">מחק</button></div>`).join('');
  const cityName = s.profile?.settlement_name;
  let body = '';
  if (k === 'pay') body = `<fieldset ${dis}>    <div class="card"><h2 style="margin-top:0">שכר שעתי</h2>
      ${[...S.rates].reverse().map(r => `<div class="row"><span>מ-${r.from_date}</span><b>${money(r.hourly_rate)} <button class="dng" data-act="delrate" data-id="${r.id}">מחק</button></b></div>`).join('') || '<p class="mut">עוד לא הוגדר שכר</p>'}
      <div class="edit-only"><div class="grid2"><div><label>תקף מתאריך</label><input type="date" id="r-from" value="${ymd(new Date())}"></div><div><label>שכר לשעה</label><input type="number" step="0.01" id="r-val"></div></div>
      <p><button class="pri" data-act="addrate">הוסף שינוי שכר</button></p></div></div>    <div class="card"><h2 style="margin-top:0">חודש עבודה</h2><div class="list">${monthStartItem('s-msd', startDayOf(s))}</div><p class="mut" id="s-msdnote">${monthStartNote(startDayOf(s))}</p></div>    <div class="card"><h2 style="margin-top:0">פנסיה ושעות</h2>
      <div class="grid2"><div><label>עובד (%)</label><input type="number" step="0.01" id="s-pe" value="${s.pension_emp_pct}"></div><div><label>מעסיק (%)</label><input type="number" step="0.01" id="s-pr" value="${s.pension_employer_pct}"></div>
      <div><label>פיצויים (%)</label><input type="number" step="0.01" id="s-sv" value="${s.severance_pct}"></div><div><label>שעות ביום רגיל</label><input type="number" step="0.25" id="s-dh" value="${s.daily_hours}"></div></div>
      <label class="tg-row"><span>שבת = 150%</span><input type="checkbox" role="switch" class="sw" id="s-sh" ${s.shabbat_150 ? 'checked' : ''}></label></div>    <div class="card"><h2 style="margin-top:0">דמי נסיעות</h2>
      <label class="tg-row"><span>משולמים לי דמי נסיעות</span><input type="checkbox" role="switch" class="sw" id="s-trv" ${s.travel_enabled ? 'checked' : ''}></label>
      <div class="grid2"><div><label>סכום ליום עבודה (₪)</label><input type="number" step="0.01" id="s-trvd" value="${s.travel_per_day || ''}"></div></div>
      <label class="tg-row"><span>חייבים במס (לפי התלוש)</span><input type="checkbox" role="switch" class="sw" id="s-trvt" ${s.travel_taxable ? 'checked' : ''}></label>
      <p class="mut">נספרים רק ימים שבהם נרשמה משמרת. החזר עד התקרה היומית בדרך כלל פטור ממס.</p></div>    <div class="card"><h2 style="margin-top:0">תוספות חודשיות קבועות</h2>${list(s.extras, 'extra') || '<p class="mut">אין</p>'}
      <div class="edit-only"><div class="grid2"><div><label>שם</label><input id="x-name"></div><div><label>סכום</label><input type="number" step="0.01" id="x-amt"></div></div>
      <label class="tg-row"><span>נכלל בשכר מבוטח לפנסיה</span><input type="checkbox" role="switch" class="sw" id="x-pen" ></label><p><button data-act="addextra">הוסף תוספת</button></p></div></div>    <div class="card"><h2 style="margin-top:0">ניכויים קבועים</h2>${list(s.extra_deductions, 'ded') || '<p class="mut">אין</p>'}
      <div class="edit-only"><div class="grid2"><div><label>שם</label><input id="d-name"></div><div><label>סכום</label><input type="number" step="0.01" id="d-amt"></div></div><p><button data-act="adddeduct">הוסף ניכוי</button></p></div></div></fieldset>`;
  else if (k === 'tax') body = `<div class="card${cityName ? '' : ' attn'}" ${cityName ? '' : 'role="alert"'}><div class="row"><span>יישוב</span>${!cityName ? '<span class="chk-warn">לא נבחר יישוב</span>' : findSettlement(cityName) ? chk(esc(cityName) + ' · מזכה') : `<span class="bad">${esc(cityName)} · לא זכאי</span>`}</div>${cityName ? '' : '<p class="attn-hint">עוד לא בחרת יישוב מגורים. בחר אותו כאן כדי שהחישוב יכלול את ההנחה המגיעה לך.</p>'}</div><fieldset ${dis}>    <div class="card"><h2 style="margin-top:0">מס ופטורים</h2>
      <div class="grid2"><div><label>נקודות זיכוי</label><input type="number" step="0.25" id="s-credit" value="${s.credit_points}"></div>
      <div style="grid-column:1/-1"><label>יישוב (הקלד או בחר מהרשימה)</label><input id="s-city" list="s-cities" placeholder="שם יישוב" autocomplete="off" value="${esc(s.profile?.settlement_name || '')}"><datalist id="s-cities">${ALL_PLACES.map(n => `<option value="${esc(n)}"></option>`).join('')}</datalist><p class="place-msg ${placeCls(s.profile?.settlement_name)}" id="city-msg">${placeMsg(s.profile?.settlement_name)}</p></div>
      <div><label>הנחת יישוב מזכה (%)</label><input type="number" step="0.5" id="s-disc" value="${s.settlement_discount_pct}"></div>
      <div><label>תקרת הנחה (הכנסה שנתית)</label><input type="number" id="s-ceil" value="${s.settlement_ceiling}"></div>
      <div><label>הפסקה (דקות)</label><input type="number" id="s-brk" value="${s.break_minutes}"></div></div>
      <label class="tg-row"><span>ההפסקה משולמת</span><input type="checkbox" role="switch" class="sw" id="s-brkpaid" ${s.break_paid ? 'checked' : ''}></label></div></fieldset>`;
  else if (k === 'slips') { const G = isGuest(), off = G ? ' auto-off" aria-disabled="true' : '', note = G ? ' <span class="pill">זמין רק למשתמש רשום</span>' : '', gd = G ? 'disabled' : ''; body = `<fieldset ${dis}>
      <div class="card${off}"><h2 style="margin-top:0">משיכת תלושים אוטומטית${note}</h2>
        <p class="mut">המייל שממנו המעסיק שולח את התלוש. רק הודעות מהכתובת הזו ייקלטו.</p>
        <label>שם המעסיק</label><input id="s-empname" ${gd} value="${esc(s.profile?.employer_name || '')}" placeholder="למשל: סמארטפיקס">
        <label>מייל המעסיק (שולח התלושים)</label><input id="s-empmail" ${gd} type="email" inputmode="email" dir="ltr" placeholder="payroll@company.co.il" value="${esc(s.profile?.employer_email || '')}">
        ${s.profile?.employer_email ? `<p>${chk('נשמר')}</p>` : ''}</div>
      <div class="card${off}"><h2 style="margin-top:0">דוח חודשי במייל${note}</h2><label>שלח למייל</label><input id="s-mail" ${gd} type="email" dir="ltr" value="${esc(s.report_email || '')}">
        ${s.report_email ? `<p>${chk('נשמר')}</p>` : ''}</div></fieldset>
      <div class="card"><h2 style="margin-top:0">דוח החודש הנוכחי</h2>
        <p><button class="pri" data-act="mreport" data-m="${monthKey(new Date())}">תצוגה מקדימה</button> <button data-act="previewreport" ${gd}>שלח לי דוח למייל</button>${G ? ' <span class="mut">זמין רק למשתמש רשום</span>' : ''}</p></div>`; }
  else if (k === 'notif') {
    const days = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'].map((n, i) => `<label class="day"><input type="checkbox" class="s-rday" value="${i}" ${(s.remind_days || [0, 1, 2, 3, 4, 5]).includes(i) ? 'checked' : ''}><span>${n}</span></label>`).join('');
    const geoOn = isNativeApp() && geoConfig().enabled, wifiOn = !!s.profile?.wifi_on;
    body = `<fieldset ${dis}><div class="card tgrp">${toggleRow('s-rem', 'תזכורות כניסה ויציאה', s.remind_enabled !== false)}
        <div class="tg-detail"><div class="grid2"><div><label>תזכורת כניסה אחרי</label><input type="time" id="s-rin" value="${esc(s.remind_in || '08:15')}"></div><div><label>תזכורת יציאה אחרי</label><input type="time" id="s-rout" value="${esc(s.remind_out || '17:15')}"></div>
          <div><label>יציאה בימי שישי</label><input type="time" id="s-rfri" value="${esc(s.remind_fri_out || '13:15')}"></div></div>
        <label>ימי עבודה</label><div class="days">${days}</div>
        <p class="mut">ימי חג שסומנו בלשונית "חודש", וימים שסומנו כחופשה או מחלה, לא יפעילו תזכורת.</p></div></div></fieldset>
      <div class="card tgrp">${toggleRow('t-push', 'התראות בטלפון', !!S._pushOn, 'data-tg="push"')}
        <div class="tg-detail"><p>${chk(S._pushOn ? 'התראות פעילות' : 'ממתין לאישור', !!S._pushOn)}</p>
          <p><button data-act="testpush">שלח התראת בדיקה</button> <button data-act="diagpush">למה לא קיבלתי?</button></p>
          <p class="mut" id="push-st">התראות דורשות אישור במכשיר. כדי לכבות לגמרי: הגדרות iPhone ואז התראות ואז מחשבון שכר.</p></div></div>
      ${isNativeApp() ? `<div class="card tgrp">${toggleRow('t-geo', 'זיהוי הגעה ויציאה לפי מיקום', geoOn, 'data-tg="geo"')}<div class="tg-detail" id="geo-card"></div></div>
      <div class="card tgrp">${toggleRow('t-wifi', 'זיהוי הגעה לפי Wi-Fi', wifiOn, 'data-tg="wifi"')}<div class="tg-detail">${wifiGuide()}</div></div>
      <div class="card" id="wid-card"></div>` : ''}`;
  }
  else if (k === 'look') body = `    <div class="card"><h2 style="margin-top:0">מראה</h2>
      <p class="mut">ברירת המחדל היא לפי הגדרת המכשיר, כולל מעבר אוטומטי בין יום ולילה.</p>
      <div class="seg" role="radiogroup" aria-label="מראה">${[['system', 'לפי המכשיר'], ['light', 'בהיר'], ['dark', 'כהה']].map(([v, l]) => `<button type="button" role="radio" aria-checked="${getTheme() === v}" data-act="theme" data-v="${v}" class="${getTheme() === v ? 'on' : ''}">${l}</button>`).join('')}</div>
    </div>`;
  else if (k === 'acct') body = `<div class="card" id="acct-card"></div>
      <div class="glist"><button type="button" class="grow" data-act="terms"><span class="g-title">תקנון ומדיניות פרטיות</span><span class="g-val">גרסה ${TERMS_VERSION}</span>${icon('chev', 'ic chev')}</button></div>`;
  else body = `    <div class="card"><h2 style="margin-top:0">נתונים</h2>
      <p><label class="btn" style="display:inline-block;margin:0">ייבוא נתונים מקובץ (תלושים / משמרות)<input type="file" id="seedfile" accept=".json" hidden></label></p>
      <p><label class="btn" style="display:inline-block;margin:0">העלאת קבצי תלושים (PDF / תמונה)<input type="file" id="slipfiles" multiple accept="application/pdf,image/*" hidden></label></p><p class="mut">שמות הקבצים בפורמט 2026-08_smart.pdf</p>
      <p><button data-act="export">הורד גיבוי (JSON)</button></p>
    </div>`;
  if (k === 'acct') queueMicrotask(renderAccountCard);
  if (k === 'notif') { queueMicrotask(renderGeoCard); queueMicrotask(renderWidgetCard); }
  const start = editing ? '<button type="button" class="nb-btn" data-act="setcancel">בטל</button>' : backBtn('data-act="setback"', 'הגדרות');
  const end = editing ? '<button type="button" class="nb-btn strong" data-act="setsave">שמור</button>' : (c.edit ? '<button type="button" class="nb-btn" data-act="setedit">עריכה</button>' : '');
  const sub = S._flash && S._flash === k ? '<span class="nb-saved">' + icon('check') + 'נשמר</span>' : '';
  $app.innerHTML = navbar({ start, title: c.title, end, sub }) + body;
  if (sub) setTimeout(() => { S._flash = null; document.querySelector('.nb-saved')?.remove(); }, 2500);
}
// קוראים רק את השדות שקיימים במסך הנוכחי, כך שכל קטגוריה שומרת רק את שלה
const FORM_FIELDS = [
  ['#s-credit', 'credit_points', 'n'], ['#s-disc', 'settlement_discount_pct', 'n'], ['#s-ceil', 'settlement_ceiling', 'n'], ['#s-brk', 'break_minutes', 'n'],
  ['#s-brkpaid', 'break_paid', 'b'], ['#s-pe', 'pension_emp_pct', 'n'], ['#s-pr', 'pension_employer_pct', 'n'], ['#s-sv', 'severance_pct', 'n'], ['#s-dh', 'daily_hours', 'n'],
  ['#s-trv', 'travel_enabled', 'b'], ['#s-trvd', 'travel_per_day', 'z'], ['#s-trvt', 'travel_taxable', 'b'], ['#s-sh', 'shabbat_150', 'b'],
  ['#s-mail', 'report_email', 's'], ['#s-rem', 'remind_enabled', 'b'],
  ['#s-rin', 'remind_in', 's', '08:15'], ['#s-rout', 'remind_out', 's', '17:15'], ['#s-rfri', 'remind_fri_out', 's', '13:15'],
];
function readForm() {
  const out = {};
  for (const [id, key, type, def] of FORM_FIELDS) {
    const el = $(id); if (!el) continue;
    out[key] = type === 'b' ? el.checked : type === 'n' ? Number(el.value) : type === 'z' ? (Number(el.value) || 0) : (el.value.trim() || def || '');
  }
  const days = document.querySelectorAll('.s-rday'); if (days.length) out.remind_days = [...days].filter(x => x.checked).map(x => Number(x.value));
  const pr = {};
  if ($('#s-msd')) { const v = Number($('#s-msd').value) || 1; pr.month_start_day = v > 1 ? v : null; }
  if ($('#s-city')) pr.settlement_name = $('#s-city').value.trim() || null;
  if ($('#s-empname')) pr.employer_name = $('#s-empname').value.trim() || null;
  if ($('#s-empmail')) pr.employer_email = $('#s-empmail').value.trim() || null;
  if (Object.keys(pr).length) out.profile = pr;
  return out;
}
async function saveSettingsFromForm() {
  const f = readForm(), { profile, ...rest } = f; const oldSd = startDayOf(S.settings);
  S.settings = { ...S.settings, ...rest, ...(profile ? { profile: { ...(S.settings.profile || {}), ...profile } } : {}) };
  S.draft = null;
  if (startDayOf(S.settings) !== oldSd) S.month = todayMonth();
  await persistSettings();
}
async function persistSettings() {
  const { extras, extra_deductions, ...rest } = S.settings;
  const row = { ...rest, extras, extra_deductions };
  await store.saveSettings(row);
  replan();
}


/* ---------- זיהוי הגעה לפי Wi-Fi (אוטומציה של קיצורי דרך שפותחת את האפליקציה) ---------- */
const WIFI_URL = e => `com.ronshushan.payroll://wifi?e=${e}`;
function wifiGuide() {
  const box = e => `<div class="urlbox"><code>${WIFI_URL(e)}</code><button type="button" data-act="copyurl" data-u="${WIFI_URL(e)}">העתק</button></div>`;
  return `<p class="mut">כשהטלפון מתחבר לרשת העבודה, קיצור דרך פותח את האפליקציה ושעת ההגעה מתמלאת לבד ב"שעת כניסה". ההגדרה חד פעמית:</p>
    <ol class="steps"><li>פתח את האפליקציה "קיצורי דרך" (Shortcuts) ואז הלשונית "אוטומציה" ואז סימן +.</li>
      <li>בחר "Wi-Fi", בחר את רשת מקום העבודה, ובחר "הפעל מיד" (Run Immediately).</li>
      <li>הוסף פעולה "פתח כתובות URL" (Open URLs) והדבק את קישור הכניסה:${box('in')}</li>
      <li>ליציאה: אם בבחירת הרשת מופיעה אפשרות ניתוק (Leaves), צור אוטומציה נוספת עם קישור היציאה:${box('out')}</li></ol>
    <div class="tgrp-sub">${toggleRow('t-wifisync', 'סנכרון עם שעות התזכורות', S.settings.profile?.wifi_sync !== false, 'data-tg="wifisync"')}
      <p class="mut">כשהמתג דלוק תקבל התראה רק בסמוך לשעות הכניסה והיציאה שהגדרת בתזכורות, וביום עבודה. נסיעת עבודה באמצע היום לא תפעיל התראה.</p></div>
    <p><button data-act="wifitest">בדוק עכשיו (מדמה הגעה)</button></p>
    <p class="mut">אם אין אפשרות ניתוק בטלפון שלך, היציאה תזוהה לפי המיקום או לפי תזכורת. השעה שנרשמת היא השעה שבה הקיצור פתח את האפליקציה.</p>`;
}
async function onToggle(el) {
  const on = el.checked;
  try {
    if (el.dataset.tg === 'push') {
      if (on) { await enablePush(); } else { el.checked = true; toast('כדי לכבות: הגדרות iPhone ואז התראות ואז מחשבון שכר', true); }
    } else if (el.dataset.tg === 'geo') {
      if (!on) { await geoDisable(); await planReminders(S.settings); toast('הזיהוי לפי מיקום כובה'); return renderGeoCard(); }
      await renderGeoCard();
      const r = Math.max(50, Math.min(1000, Number($('#geo-r')?.value) || 50)); geoSetWindow(Number($('#geo-w')?.value) || 90);
      toast('מבקש הרשאה ומאתר מיקום...'); const ps = await geoAskPermission();
      if (ps.auth === 'denied') { el.checked = false; toast('המיקום חסום. אפשר לאשר בהגדרות הטלפון ואז מחשבון שכר ואז מיקום', true); return renderGeoCard(); }
      const cfg = await geoSetHere(r); await planReminders(S.settings);
      toast(ps.auth === 'always' ? `המיקום נשמר (דיוק ${cfg.accuracy}מ׳)` : 'נשמר, אבל צריך לאשר "תמיד" בהגדרות הטלפון כדי שיעבוד ברקע', ps.auth !== 'always'); return renderGeoCard();
    } else if (el.dataset.tg === 'wifisync') {
      S.settings = { ...S.settings, profile: { ...(S.settings.profile || {}), wifi_sync: on } }; await persistSettings();
      toast(on ? 'ההתראה תישלח רק בסמוך לשעות התזכורות' : 'ההתראה תישלח בכל שעה');
    } else if (el.dataset.tg === 'wifi') {
      S.settings = { ...S.settings, profile: { ...(S.settings.profile || {}), wifi_on: on } }; await persistSettings();
      toast(on ? 'זיהוי Wi-Fi הופעל. השלם את ההגדרה בקיצורי דרך' : 'זיהוי Wi-Fi כובה');
    }
  } catch (e) { el.checked = !on; toast('שגיאה: ' + (e.message || e), true); }
}
// האם הזמן קרוב לשעת תזכורת הכניסה/היציאה, וביום עבודה
function nearReminder(kind, at) {
  const s = S.settings, dow = at.getDay(), days = s.remind_days || [0, 1, 2, 3, 4, 5];
  if (!days.includes(dow)) return false;
  const hm = h => { const [a, b] = String(h || '0:0').split(':').map(Number); return (a || 0) * 60 + (b || 0); };
  const target = kind === 'in' ? hm(s.remind_in || '08:15') : hm(dow === 5 ? (s.remind_fri_out || '13:15') : (s.remind_out || '17:15'));
  const mins = at.getHours() * 60 + at.getMinutes(), win = geoConfig().windowMin || 90;
  return Math.abs(mins - target) <= win;
}
// קישור עמוק: com.ronshushan.payroll://wifi?e=in|out[&t=ISO]
function handleDeepLink(url, force) {
  const m = String(url || '').match(/^com\.ronshushan\.payroll:\/\/wifi\/?\?(.*)$/); if (!m) return;
  if (!S.settings?.profile?.wifi_on) return toast('זיהוי Wi-Fi כבוי. אפשר להפעיל בהגדרות, התראות ומיקום', true);
  if (!S.settings) return;
  const q = new URLSearchParams(m[1]), kind = q.get('e') === 'out' ? 'out' : 'in';
  const tt = q.get('t') ? new Date(q.get('t')).getTime() : NaN;
  const ts = Number.isFinite(tt) && Date.now() - tt < 12 * 3600e3 && tt <= Date.now() + 6e4 ? tt / 1000 : Date.now() / 1000;
  if (!force && S.settings.profile.wifi_sync !== false && !nearReminder(kind, new Date(ts * 1000))) return;      // נסיעת עבודה באמצע היום: מתעלמים
  S._arrival = { kind, ts, src: 'Wi-Fi' }; checkGeoPending(true);
}
async function askArrival(kind, at, src) {
  const a = await store.activeShift();
  let last = {}; try { last = JSON.parse(localStorage.getItem('payroll-arr') || '{}'); } catch {}
  if (last[kind] && Math.abs(last[kind] - at.getTime()) < 10 * 60e3) return;      // אותה הגעה כבר טופלה (מיקום ו-Wi-Fi יחד)
  try { localStorage.setItem('payroll-arr', JSON.stringify({ ...last, [kind]: at.getTime() })); } catch {}
  const hh = hhmm(at), day = ymd(at);
  if (kind === 'in') {
    if (a) return;
    modal(`<h1>הגעת לעבודה?</h1><p class="mut">זוהתה הגעה (${src}) בשעה ${ltr(hh)}. אפשר לתקן את השעה:</p>
      <label>שעת כניסה</label><input type="time" id="arr-t" value="${hh}" data-day="${day}">
      <p><button class="pri" data-act="arr-in">התחל משמרת</button></p>
      <p><button data-act="geo-in-now">התחל משמרת עכשיו</button> <button data-act="close">לא עכשיו</button></p>`);
  } else {
    if (!a) return;
    modal(`<h1>יצאת מהעבודה?</h1><p class="mut">זוהתה יציאה (${src}) בשעה ${ltr(hh)}. אפשר לתקן את השעה:</p>
      <label>שעת יציאה</label><input type="time" id="arr-t" value="${hh}" data-day="${day}">
      <p><button class="pri" data-act="arr-out">סיים משמרת</button></p>
      <p><button data-act="geo-out-now">סיים משמרת עכשיו</button> <button data-act="close">המשך משמרת</button></p>`);
  }
}

/* ---------- הגעה / יציאה ממקום העבודה (התראת מיקום) ---------- */
async function checkGeoPending(force) {
  if (!isNativeApp() || $nav.hidden) return;
  let p = S._arrival; S._arrival = null;
  if (!p) p = await geoConsumePending().catch(() => null);
  if (!p) return;
  return askArrival(p.kind, new Date(p.ts * 1000), p.src || 'מיקום');
}
async function renderWidgetCard() {
  const el = document.getElementById('wid-card'); if (!el || !widgetAvailable()) return;
  let ok = false; try { ok = (await widgetStatus()).available; } catch {}
  el.innerHTML = `<h2 style="margin-top:0">ווידג'ט</h2>
    <div class="row"><span>חיבור לווידג'ט</span><b class="${ok ? 'ok' : 'mut'}">${ok ? 'מחובר ✓' : 'לא מחובר'}</b></div>
    <p class="mut">${ok ? 'הוסף את הווידג׳ט: לחיצה ארוכה על מסך הבית, סימן +, חיפוש "שעון נוכחות". הלחיצה על כפתור הכניסה/יציאה נרשמת בשעה המדויקת, ונכנסת לאפליקציה בפעם הבאה שהיא נפתחת.' : 'חסרה קבוצת האפליקציה (App Group) ב-Xcode. עקוב אחרי ההוראות שקיבלת.'}</p>`;
}
async function renderGeoCard() {
  const el = document.getElementById('geo-card'); if (!el || !geoAvailable()) return;
  const cfg = geoConfig(); let st = { auth: 'notDetermined', monitoring: false };
  try { st = await geoStatus(); } catch {}
  const ok = st.auth === 'always';
  const lg = await geoLog();
  el.innerHTML = `<p class="mut">כשאתה מגיע בסביבת שעת הכניסה, או יוצא בסביבת שעת היציאה, תקבל התראה להתחיל או לסיים משמרת. בשאר השעות (למשל נסיעה ללקוחות) לא תקבל כלום.</p>
    <div class="row"><span>הרשאת מיקום</span><b class="${ok ? 'ok' : 'mut'}">${{ always: 'תמיד ✓', whenInUse: 'רק בזמן שימוש', denied: 'חסומה', notDetermined: 'לא אושרה' }[st.auth] || st.auth}</b></div>
    <div class="row"><span>מצב</span><b class="${cfg.enabled && st.monitoring ? 'ok' : 'mut'}">${cfg.enabled ? (st.monitoring ? 'פעיל' : 'מוגדר, לא פעיל') : 'כבוי'}</b></div>
    ${cfg.lat ? `<div class="row"><span>מיקום שמור</span><b dir="ltr">${cfg.lat.toFixed(4)}, ${cfg.lng.toFixed(4)} · ${cfg.radius}m</b></div>` : ''}
    <div class="grid2"><div><label>רדיוס (מטרים, 50 ומעלה)</label><input type="number" id="geo-r" value="${cfg.radius}"></div>
      <div><label>חלון זמן סביב השעה (דקות)</label><input type="number" id="geo-w" value="${cfg.windowMin}"></div></div>
    <p><button class="pri" data-act="geo-set">${cfg.enabled ? 'עדכן למיקום הנוכחי' : 'קבע את המיקום הנוכחי כמקום העבודה'}</button></p>
    <details><summary class="mut">יומן אירועי מיקום</summary><pre dir="rtl" style="white-space:pre-wrap;font-size:0.7059rem">${lg.length ? lg.join('\n') : 'אין אירועים עדיין'}</pre></details>
    <p class="mut">עמוד במקום העבודה בזמן שאתה לוחץ. ב-iPhone יופיעו שתי בקשות הרשאה: "בזמן שימוש", ואחריה "תמיד". כדי שזה יעבוד ברקע צריך לבחור "אפשר תמיד".</p>
    <p class="mut">דיוק: ב-iPhone זיהוי הגעה ויציאה מתבסס על Wi-Fi ואנטנות, ובדרך כלל מגיב מ-50 עד 200 מטר. רדיוס קטן מאוד עלול להתעכב או להיפספס. אם זה קורה, נסה 100.</p>`;
}

/* ---------- אירועים ---------- */
document.addEventListener('click', async e => {
  const t = e.target.closest('[data-act]'); if (!t) return;
  const act = t.dataset.act, id = t.dataset.id ? (isNaN(t.dataset.id) ? t.dataset.id : Number(t.dataset.id)) : null;
  if (act === 'tab') haptic('select');
  const busyTimer = t.tagName === 'BUTTON' && !t.classList.contains('nb-btn') ? setTimeout(() => t.classList.add('is-busy'), 350) : 0;
  try {
    switch (act) {
      case 'theme': setTheme(t.dataset.v); return render();
      case 'tab': S.tab = t.dataset.k; S.sub = null; S.page = null; S.setCat = null; S.edit = false; S.draft = null; return render();
      case 'close': return closeModal();
      case 'clockin': return clockIn();
      case 'clockout': return clockOut();
      case 'mshifts': S.page = { type: 'shifts' }; window.scrollTo(0, 0); return render();
      case 'mreport': S.page = { type: 'report', month: t.dataset.m, from: S.tab }; closeModal(); window.scrollTo(0, 0); return render();
      case 'pageback': S.page = null; window.scrollTo(0, 0); return render();
      case 'mpick': return monthPicker(S.month.getFullYear());
      case 'mpyear': { const yy = Number($('#mp-year').textContent) + Number(t.dataset.d); return monthPicker(yy); }
      case 'mpset': S.month = new Date(Number(t.dataset.y), Number(t.dataset.m), 1); closeModal(); return render();
      case 'mptoday': S.month = todayMonth(); closeModal(); return render();
      case 'mailreport': { toast('שולח...'); const r = await store.callFn('monthly-report', { preview: true, month: t.dataset.m }); toast(r.sent ? 'הדוח נשלח למייל' : (r.skipped ? 'אין נתונים לדוח' : 'שליחה נכשלה: ' + (r.detail || r.error || '')), !r.sent); return; }
      case 'mprev': S.month = new Date(S.month.getFullYear(), S.month.getMonth() - 1, 1); return render();
      case 'mnext': S.month = new Date(S.month.getFullYear(), S.month.getMonth() + 1, 1); return render();
      case 'addshift': return shiftForm(null);
      case 'editshift': { closeModal(); const y = S.month.getFullYear(), m = S.month.getMonth() + 1; const d = await monthData(y, m); const s = d.shifts.find(x => x.id === id) || await store.activeShift(); return shiftForm(s); }
      case 'saveshift': {
        if (!$('#f-start').value) return toast('חסרה שעת כניסה', true);
        const s = { start_at: new Date($('#f-start').value).toISOString(), end_at: $('#f-end').value ? new Date($('#f-end').value).toISOString() : null, break_minutes: Number($('#f-brk').value || 0) };
        if (s.end_at && new Date(s.end_at) <= new Date(s.start_at)) return toast('היציאה חייבת להיות אחרי הכניסה', true);
        if (id) s.id = id; await store.saveShift(s); closeModal(); return render();
      }
      case 'delshift': {
        const s0 = S._openShift && S._openShift.id === id ? S._openShift : null;
        await store.delShift(id); closeModal(); render();
        if (s0) { const { id: _i, user_id: _u, created_at: _c, ...rest } = s0; toast('המשמרת נמחקה', false, { label: 'בטל', fn: async () => { await store.saveShift(rest); toast('המשמרת שוחזרה'); render(); } }); }
        else toast('המשמרת נמחקה');
        return;
      }
      case 'addleave': return leaveForm();
      case 'saveleave': await store.addLeave($('#l-day').value, $('#l-kind').value); closeModal(); return render();
      case 'delleave': await collapseRow(t); if (t.dataset.kind === 'holiday') { try { localStorage.setItem('hol-dismiss', JSON.stringify([...holDismissed(), t.dataset.day])); } catch {} } await store.delLeave(id); return render();
      case 'viewshift': { const y = S.tab === 'month' ? S.month.getFullYear() : new Date().getFullYear(), m = S.tab === 'month' ? S.month.getMonth() + 1 : new Date().getMonth() + 1; let s = (await monthData(y, m)).shifts.find(x => x.id === id); if (!s) { const cc = await store.shifts(new Date(Date.now() - 62 * 864e5).toISOString(), new Date(Date.now() + 864e5).toISOString()); s = cc.find(x => x.id === id); } if (s) return shiftDetails(s); return; }
      case 'addslip': return slipForm();
      case 'saveslip': {
        const p = { month: $('#s-month').value.trim(), employer_name: $('#s-emp').value.trim(), gross: nv('#s-gross'), net: nv('#s-net'), income_tax: nv('#s-tax') ?? 0,
          national_insurance: nv('#s-bl'), health: nv('#s-h'), pension_emp: nv('#s-pen'), insured_salary: nv('#s-ins'), hours: nv('#s-hours'), vacation_balance: nv('#s-vac'), sick_balance: nv('#s-sick'), ...(S._slipExtra || {}) };
        S._slipExtra = null;
        if (!/^\d{4}-\d{2}$/.test(p.month) || p.gross === null) return toast('חסרים חודש וברוטו', true);
        await store.savePayslip(p); S.payslips = await store.payslips(); closeModal(); render();
        const saved = S.payslips.find(x => x.month === p.month && x.employer_name === p.employer_name); return openSlip(saved);
      }
      case 'remindsave': {
        const day = S.remDay || ilYmd(new Date()), tin = $('#r-in').value, tout = $('#r-out').value; if (!tin) return toast('חסרה שעת כניסה', true);
        const start = new Date(`${day}T${tin}:00`).toISOString();
        if (tout) { const end = new Date(`${day}T${tout}:00`).toISOString(); if (end <= start) return toast('היציאה חייבת להיות אחרי הכניסה', true); await store.saveShift({ start_at: start, end_at: end, break_minutes: null }); }
        else await store.startShift(start);
        const wasPast = !!S.remDay; S.remDay = null; closeModal(); toast(tout ? 'המשמרת נשמרה' : 'הכניסה עודכנה. אל תשכח יציאה'); S.tab = wasPast ? 'month' : 'clock'; return render();
      }
      case 'remindoff': { await store.addLeave(S.remDay || ilYmd(new Date()), $('#r-kind').value); closeModal(); toast('היום סומן'); S.tab = 'month'; if (!S.remDay) S.month = todayMonth(); S.remDay = null; return render(); }
      case 'missday': return remindInModal(t.dataset.day);
      case 'diagpush': {
        const d = await store.callFn('reminders', { diagnose: true });
        modal(`<h1>אבחון התראות</h1><div class="row"><span>שעה בישראל</span><b>${esc(d.time)} (יום ${esc(d.day)})</b></div>
          <div class="row"><span>מכשירים רשומים</span><b class="${d.devices ? 'ok' : 'bad'}">${d.devices}</b></div>
          <div class="row"><span>תזכורות פעילות</span><b>${d.enabled ? 'כן' : 'לא'}</b></div>
          <div class="row"><span>תזכורת כניסה / יציאה</span><b>${esc(d.inAt)} / ${esc(d.outAt)}</b></div>
          <h2>תזכורת כניסה היום</h2><p class="${d.inDue ? 'ok' : 'warn'}">${esc(d.inReason)}</p>
          <h2>תזכורת יציאה היום</h2><p class="${d.outDue ? 'ok' : 'warn'}">${esc(d.outReason)}</p>
          <h2>התראות שנשלחו לאחרונה</h2><p class="mut">${d.lastSent.length ? d.lastSent.map(x => esc(x.key) + ' · ' + esc(x.sent_at.slice(0, 16).replace('T', ' '))).join('<br>') : 'עדיין לא נשלחה אף התראה'}</p>
          <p><button data-act="close">סגור</button></p>`);
        return;
      }
      case 'enablepush': return enablePush();
      case 'testpush': if (isNativeApp()) { if (!(await ensurePermission())) return toast('אין הרשאת התראות', true); await sendTest(); return toast('תגיע התראה בעוד כמה שניות'); }
      // eslint-disable-next-line no-fallthrough
      case 'testpush-web': { await store.callFn('reminders', { test: true }).then(r => toast(r.sent ? 'נשלחה התראה' : 'אין מכשיר רשום. לחץ קודם על "הפעל התראות"', !r.sent)); return; }
      case 'previewreport': { toast('שולח...'); const r = await store.callFn('monthly-report', { preview: true }); toast(r.sent ? 'הדוח נשלח למייל' : 'שליחה נכשלה: ' + (r.detail || r.error || ''), !r.sent); return; }
      case 'toggleyear': { const y = t.dataset.y; S.openYears.has(y) ? S.openYears.delete(y) : S.openYears.add(y); return render(); }
      case 'slipscan': return scanSlip(S.payslips.find(x => x.id === id));
      case 'viewfile': { const w = window.open('', '_blank'); try { const u = await store.slipFileUrl(S.payslips.find(p => p.id === id).file_path); if (w) w.location = u; else location.href = u; } catch (err) { if (w) w.close(); throw err; } return; }
      case 'openslip': return openSlip(S.payslips.find(p => p.id === id));
      case 'delslip': if (await confirmSheet({ title: 'למחוק את התלוש?', message: 'התלוש והקובץ שלו יימחקו ולא ניתן לשחזר.', label: 'מחק תלוש' })) { await store.delPayslip(id); S.payslips = await store.payslips(); closeModal(); render(); } return;
      case 'mailfix': {
        const p = S.payslips.find(x => x.id === id); const lines = (S._bad || []).map(r => `- ${r.name}: בתלוש ${money(r.slip)}, לפי חישוב ${money(r.calc)} (פער ${money(r.diff)})`).join('\n');
        const body = `שלום,\nבבדיקת תלוש השכר לחודש ${p.month} נמצאו הפערים הבאים:\n${lines}\n\nאבקש בדיקה ותיקון.\nתודה,\nרון שושן`;
        location.href = `mailto:?subject=${encodeURIComponent('בקשה לבדיקת תלוש שכר ' + p.month)}&body=${encodeURIComponent(body)}`; return;
      }
      case 'sub': S.sub = t.dataset.k; return render();
      case 'year': S.sub = 'year'; S.year = t.dataset.y; return render();
      case 'subback': S.sub = null; return render();
      case 'addrate': { const v = Number($('#r-val').value); if (!v) return; await store.addRate({ from_date: $('#r-from').value, hourly_rate: v }); S.rates = await store.rates(); S.draft = readForm(); return render(); }
      case 'delrate': await collapseRow(t); S.draft = readForm(); await store.delRate(id); S.rates = await store.rates(); return render();
      case 'addextra': { const name = $('#x-name').value.trim(), amount = Number($('#x-amt').value); if (!name) return; S.settings.extras = [...S.settings.extras, { name, amount, pensionable: $('#x-pen').checked }]; await saveSettingsFromForm(); return render(); }
      case 'del-extra': await collapseRow(t); S.settings.extras = S.settings.extras.filter((_, i) => i !== Number(t.dataset.i)); await saveSettingsFromForm(); return render();
      case 'adddeduct': { const name = $('#d-name').value.trim(), amount = Number($('#d-amt').value); if (!name) return; S.settings.extra_deductions = [...S.settings.extra_deductions, { name, amount }]; await saveSettingsFromForm(); return render(); }
      case 'del-ded': await collapseRow(t); S.settings.extra_deductions = S.settings.extra_deductions.filter((_, i) => i !== Number(t.dataset.i)); await saveSettingsFromForm(); return render();
      case 'setcat': S.setCat = t.dataset.k; S.edit = false; S.draft = null; window.scrollTo(0, 0); return render();
      case 'setback': S.setCat = null; S.edit = false; S.draft = null; window.scrollTo(0, 0); return render();
      case 'setedit': S.edit = true; return render();
      case 'setcancel': S.edit = false; S.draft = null; return render();
      case 'setsave': { await saveSettingsFromForm(); S.edit = false; S._flash = S.setCat; toast('נשמר'); return render(); }
      case 'terms': return showTermsOverlay();
      case 'export': { const data = await store.exportAll(); const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' })); a.download = `payroll-backup-${ymd(new Date())}.json`; a.click(); return; }
      case 'geo-set': {
        const r = Math.max(50, Math.min(1000, Number($('#geo-r').value) || 50)); geoSetWindow(Number($('#geo-w').value) || 90);
        toast('מבקש הרשאה ומאתר מיקום...'); const ps = await geoAskPermission();
        if (ps.auth === 'denied') { toast('המיקום חסום. אפשר לאשר בהגדרות הטלפון > מחשבון שכר > מיקום', true); return renderGeoCard(); }
        const cfg = await geoSetHere(r); await planReminders(S.settings);
        toast(ps.auth === 'always' ? `המיקום נשמר (דיוק ${cfg.accuracy}מ׳)` : 'נשמר, אבל צריך לאשר "תמיד" בהגדרות הטלפון כדי שיעבוד ברקע', ps.auth !== 'always'); return renderGeoCard();
      }
      case 'geo-off': await geoDisable(); toast('כובה'); return renderGeoCard();
      case 'arr-in': case 'arr-out': {
        const el = $('#arr-t'); if (!el || !el.value) return toast('חסרה שעה', true);
        const iso = new Date(`${el.dataset.day}T${el.value}:00`).toISOString(); closeModal();
        return act === 'arr-in' ? clockIn(iso) : clockOut(iso);
      }
      case 'copyurl': try { await navigator.clipboard.writeText(t.dataset.u); toast('הקישור הועתק'); } catch { toast(t.dataset.u); } return;
      case 'wifitest': handleDeepLink(WIFI_URL('in'), true); return;
      case 'geo-in': closeModal(); return clockIn(t.dataset.ts);
      case 'geo-in-now': closeModal(); return clockIn();
      case 'geo-out': closeModal(); return clockOut(t.dataset.ts);
      case 'geo-out-now': closeModal(); return clockOut();
      case 'rerun-wizard': clearOnboardFlag(); $nav.hidden = true; return runWizard({ settings: { ...S.settings, profile: { ...(S.settings.profile || {}), onboarded: false } }, done: boot });
      case 'logout': {
        const fe = isNativeApp() && faceEnabled();
        const v = await actionSheet({ title: 'להתנתק?', message: fe ? 'עם Face ID אפשר להיכנס שוב בלי סיסמה.' : '', actions: [{ label: 'התנתק', destructive: true, value: 'out' }, ...(fe ? [{ label: 'התנתק ושכח את Face ID', destructive: true, value: 'forget' }] : [])] });
        if (!v) return;
        if (v === 'forget') { await clearToken(); setFaceEnabled(false); }
        await auth.signOut(); return boot();
      }
      case 'acct-upgrade': return startUpgrade();
      case 'acct-mfa-setup': return showMfaSetup(() => { renderAccountCard(); });
      case 'acct-mfa-remove': { const f = (await auth.mfa.verified())[0]; if (f && await confirmSheet({ title: 'לבטל את האימות הדו-שלבי?', label: 'בטל אימות דו-שלבי' })) { await auth.mfa.remove(f.id); toast('האימות הדו-שלבי בוטל'); renderAccountCard(); } return; }
      case 'acct-delete': {
        if (!(await confirmSheet({ title: 'למחוק את החשבון?', message: 'כל המשמרות, התלושים וההגדרות יימחקו לצמיתות מכל המכשירים.', label: 'המשך למחיקה' }))) return;
        if (!(await confirmSheet({ title: 'בטוח? אי אפשר לשחזר.', message: 'זו הזדמנות אחרונה לבטל.', label: 'מחק את החשבון לצמיתות' }))) return;
        toast('מוחק את החשבון...');
        const r = await store.callFn('delete-account', { confirm: 'DELETE' });
        if (r?.error) { toast('המחיקה נכשלה: ' + (r.detail || r.error), true); return; }
        clearOnboardFlag(); await clearToken(); setFaceEnabled(false);
        try { await auth.signOut(); } catch {}
        try { clearLocal(); } catch {}
        setMode(null); S.settings = null; S.payslips = []; haptic('success'); return boot();
      }
      case 'acct-leave-guest': if (await confirmSheet({ title: 'לצאת מהמצב אורח?', message: 'הנתונים נשארים במכשיר, ותוכל לחזור אליהם בכל רגע בכניסה כאורח.', label: 'צא מהמצב אורח', destructive: false })) { setMode(null); return boot(); } return;
    }
  } catch (err) { console.error(err); S.err = err.message; if (!$nav.hidden) toast('שגיאה: ' + err.message, true); else showWelcome({ error: err.message }); }
  finally { clearTimeout(busyTimer); t.classList.remove('is-busy'); }
});

const b64u = s => Uint8Array.from(atob((s + '='.repeat((4 - s.length % 4) % 4)).replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
async function enablePush() {
  const st = $('#push-st');
  if (isNativeApp()) {
    if (!(await ensurePermission())) { st.textContent = 'ההרשאה נדחתה. אפשר לאשר בהגדרות הטלפון > התראות > מחשבון שכר.'; return; }
    await saveSettingsFromForm(); await planReminders(S.settings);
    S._pushOn = true; toast('התזכורות הופעלו'); return render();
  }
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) { st.textContent = 'המכשיר לא תומך בהתראות. הוסף את האפליקציה למסך הבית (iOS 16.4 ומעלה).'; return; }
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') { st.textContent = 'ההרשאה נדחתה. אפשר לאשר בהגדרות הטלפון > התראות > מחשבון שכר.'; return; }
  const reg = await navigator.serviceWorker.ready;
  const sub = (await reg.pushManager.getSubscription()) || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64u(VAPID_PUBLIC_KEY) });
  await store.savePushSub(sub.toJSON()); await saveSettingsFromForm();
  S._pushOn = true; toast('ההתראות הופעלו'); return render();
}
const EMP_KEYS = { smart: 'סמארטפיקס', bnei: 'ביתך', mahsanei: 'השוק' };
async function attachSlipFile(p, f, name) {
  const ext = (f.name.split('.').pop() || 'pdf').toLowerCase();
  const path = await store.uploadSlipFile(f, name || `${p.month}_${p.id}.${ext}`);
  await store.setSlipFile(p.id, path);
}
document.addEventListener('input', e => {
  if (e.target.id !== 's-city') return;
  const v = e.target.value, r = findSettlement(v), msg = $('#city-msg');
  if (r) { $('#s-disc').value = r[1]; $('#s-ceil').value = r[2]; } else if (String(v).trim()) { $('#s-disc').value = 0; }
  if (msg) { msg.textContent = placeMsg(v); msg.className = 'place-msg ' + placeCls(v); }
});
document.addEventListener('change', async e => {
  if (e.target.id === 's-msd') { const n = $('#s-msdnote'); if (n) n.textContent = monthStartNote(e.target.value); haptic('select'); return; }
  if (e.target.id === 's-city') {
    const v = e.target.value, r = findSettlement(v), msg = $('#city-msg');
    if (r) { $('#s-disc').value = r[1]; $('#s-ceil').value = r[2]; } else if (String(v).trim()) { $('#s-disc').value = 0; }
    if (msg) { msg.textContent = placeMsg(v); msg.className = 'place-msg ' + placeCls(v); } return;
  }
  if (e.target.classList?.contains('sw')) haptic('select');
  if (e.target.dataset?.tg) return onToggle(e.target);
  try {
    if (e.target.id === 'att-file' && e.target.files[0]) {
      const p = S.payslips.find(x => x.id === Number(e.target.dataset.id) || x.id === e.target.dataset.id);
      toast('מעלה...'); await attachSlipFile(p, e.target.files[0]); S.payslips = await store.payslips(); toast('הקובץ נשמר'); closeModal(); render(); return openSlip(S.payslips.find(x => x.id === p.id));
    }
    if (e.target.id === 'slipfiles' && e.target.files.length) {
      let ok = 0, miss = [];
      for (const f of e.target.files) {
        const m = f.name.match(/^(\d{4}-\d{2})_([a-z]+)/i); const key = m && EMP_KEYS[m[2].toLowerCase()];
        const p = m && S.payslips.find(x => x.month === m[1] && (x.employer_name || '').includes(key));
        if (!p) { miss.push(f.name); continue; }
        await attachSlipFile(p, f, f.name); ok++; toast(`מעלה ${ok}...`);
      }
      S.payslips = await store.payslips(); e.target.value = '';
      toast(`הועלו ${ok} קבצים` + (miss.length ? `, לא זוהו: ${miss.join(', ')}` : ''), miss.length > 0); return;
    }
  } catch (err) { toast('שגיאה: ' + err.message, true); return; }
  if (e.target.id !== 'seedfile' || !e.target.files[0]) return;
  try { await importData(JSON.parse(await e.target.files[0].text())); } catch (err) { toast('שגיאה בייבוא: ' + err.message, true); }
  e.target.value = '';
});
async function importData(raw) {
  const data = Array.isArray(raw) ? { payslips: raw } : raw;
  const ps = data.payslips || [], sh = data.shifts || [], lv = data.leave || [], rt = data.rates || [];
  if (ps.length) {
    await store.savePayslips(ps.map(p => ({ month: p.month, employer_name: p.employer ?? p.employer_name ?? '', gross: p.gross, net: p.net, income_tax: p.income_tax ?? 0, national_insurance: p.national_insurance, health: p.health,
      pension_emp: p.pension_emp ?? null, pension_employer: p.pension_employer ?? null, severance: p.severance ?? null, insured_salary: p.insured_salary ?? null, hours: p.hours ?? null,
      workdays: p.workdays ?? null, vacation_balance: p.vac_new ?? p.vacation_balance ?? null, sick_balance: p.sick_new ?? p.sick_balance ?? null, cum_taxable: p.cum_taxable ?? null, is_corrected: !!(p.is_corrected ?? false), note: p.note ?? null })));
  }
  const have = new Set(S.rates.map(r => r.from_date));
  for (const r of rt) if (!have.has(r.from_date)) await store.addRate({ from_date: r.from_date, hourly_rate: r.hourly_rate });
  let added = 0;
  if (sh.length) {                                   // לא מכניסים משמרת שכבר קיימת באותה שעת כניסה
    const exist = new Set((await store.shifts('2000-01-01', '2100-01-01')).map(x => new Date(x.start_at).getTime()));
    const fresh = sh.filter(x => !exist.has(new Date(x.start_at).getTime())); if (fresh.length) await store.addShifts(fresh); added = fresh.length;
  }
  if (lv.length) await store.addLeaveMany(lv);
  await reloadBase(); toast(`הייבוא הושלם: ${ps.length} תלושים, ${added} משמרות חדשות`); render();
}

boot();
