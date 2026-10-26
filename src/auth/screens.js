// מסכי הרשמה / התחברות / אימות דו-שלבי / שדרוג אורח. רכיבים רגילים (HTML + CSS) לפי Apple HIG.
import { auth, heb, isNative } from './auth.js';
import { getMode, setMode, setPendingUpgrade } from '../data/mode.js';
import { loadLocal, D, clearLocal, flushLocal } from '../data/local.js';
import { getClient } from '../data/supabase.js';
import { migrateGuestToCloud } from '../data/migrate.js';
import { segmented, onSegmented, icon, pwField, bindPwEye } from '../ui.js';
bindPwEye(() => haptic('select'));
import { passwordIssues, pwRulesHtml, bindPwRules } from './password.js';
import { faceEnabled, setFaceEnabled, readToken, clearToken, bioInfo, bioName, bioAuth } from '../native/biometric.js';
import { termsAccepted, markTermsAccepted, clearTermsAccepted, showTermsOverlay } from '../legal.js';
import { haptic } from '../native/haptics.js';

let onReady = () => {};                              // מוגדר ע"י app.js: מעלה את האפליקציה אחרי התחברות
export const initAuthUI = cb => { onReady = cb; };
const root = () => document.getElementById('auth-root');
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const G_SVG = '<svg viewBox="0 0 48 48" width="20" height="20" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>';

function mount(inner, cls = '') {
  const r = root(); r.hidden = false;
  r.innerHTML = `<div class="auth-scroll"><div class="auth-wrap ${cls}">${inner}</div></div>`;
}
export function hideAuth() { const r = root(); r.hidden = true; r.innerHTML = ''; }
const topBack = id => `<div class="auth-top"><button type="button" id="${id}" class="nb-btn nb-back" aria-label="חזרה">${icon('back')}</button></div>`;
const setErr = m => { const e = $('auth-err'); if (!e) return; e.textContent = m || ''; if (m) { e.classList.remove('shake'); void e.offsetWidth; e.classList.add('shake'); haptic('error'); } };
const busy = (btn, on, txt) => { if (!btn) return; btn.disabled = on; if (on) { if (!btn.dataset.t) btn.dataset.t = btn.textContent; btn.textContent = (typeof txt === 'string' && txt) || 'רגע...'; } else if (btn.dataset.t) { btn.textContent = btn.dataset.t; delete btn.dataset.t; } };

/* ---------- ברוכים הבאים ---------- */
export function showWelcome({ upgrade = false, error = '' } = {}) {
  mount(`
    <img class="auth-logo" src="icon-v3-180.png" alt="">
    <h1 class="auth-title">${upgrade ? 'שדרוג לחשבון' : 'מחשבון שכר'}</h1>
    <p class="auth-sub">${upgrade ? 'הנתונים שנשמרו במכשיר יועברו לחשבון, ויהיו זמינים מכל מכשיר.' : 'שעון נוכחות וחישוב שכר חודשי'}</p>
    ${termsAccepted() ? '' : `<label class="terms-row tg-row"><span>קראתי ואני מסכים/ה ל<a href="#" id="b-terms-link">תקנון ולמדיניות הפרטיות</a></span><input type="checkbox" role="switch" class="sw" id="b-terms"></label>`}
    <button type="button" id="b-google" class="btn-block light btn-google">${G_SVG}<span>התחברות עם Google</span></button>
    <button type="button" id="b-email" class="btn-block ">התחברות עם אימייל</button>
    <p class="auth-switch">עדיין אין לך חשבון? להרשמה <button type="button" id="b-signup" class="link-btn">לחץ כאן</button></p>
    ${upgrade ? '<button type="button" id="b-cancel" class="btn-block plain">ביטול</button>' : '<button type="button" id="b-guest" class="btn-block plain">המשך כאורח</button>'}
    <p class="auth-note">${upgrade ? '' : 'כאורח הנתונים נשמרים רק על המכשיר הזה. אפשר לשדרג לחשבון בכל רגע, בלי לאבד כלום.'}</p>
    <p class="auth-err" id="auth-err">${esc(error)}</p>`);
  wireConsent(['b-google', 'b-email', 'b-guest', 'b-signup']);
  $('b-google').onclick = () => googleFlow(upgrade);
  $('b-email').onclick = () => showEmailAuth({ upgrade });
  $('b-signup').onclick = () => showEmailAuth({ upgrade, tab: 'signup' });
  if ($('b-guest')) $('b-guest').onclick = async () => { setMode('guest'); await loadLocal(); hideAuth(); onReady(); };
  if ($('b-cancel')) $('b-cancel').onclick = () => { setPendingUpgrade(false); hideAuth(); onReady(); };
}

// תיבת אישור תקנון: הכפתורים נעולים עד שמסמנים
function wireConsent(ids) {
  const cb = $('b-terms'); if (!cb) return;
  const apply = () => ids.forEach(i => { const b = $(i); if (b) b.disabled = !cb.checked; });
  apply();
  cb.addEventListener('change', () => { cb.checked ? markTermsAccepted() : clearTermsAccepted(); apply(); });
  $('b-terms-link').onclick = e => { e.preventDefault(); showTermsOverlay(); };
}
// למשתמש קיים שעוד לא אישר את התקנון (או שהתקנון עודכן)
export function showTermsGate(onOk) {
  mount(`<img class="auth-logo" src="icon-v3-180.png" alt="">
    <h1 class="auth-title sm">תקנון ומדיניות פרטיות</h1>
    <p class="auth-sub">כדי להמשיך להשתמש באפליקציה יש לאשר את התקנון.</p>
    <label class="terms-row tg-row"><span>קראתי ואני מסכים/ה ל<a href="#" id="b-terms-link">תקנון ולמדיניות הפרטיות</a></span><input type="checkbox" role="switch" class="sw" id="b-terms"></label>
    <button type="button" id="b-go" class="btn-block" disabled>המשך</button>`);
  wireConsent(['b-go']);
  $('b-go').onclick = () => { hideAuth(); onOk(); };
}

async function googleFlow(upgrade) {
  setErr('');
  try {
    if (upgrade) setPendingUpgrade(true);
    const r = await auth.signInGoogle();               // באתר: הדף עובר לגוגל וחוזר. באייפון: ממשיכים כאן
    if (r?.session) {
      // אימות Face ID אחרי אישור גוגל (אם הופעל במכשיר הזה)
      if (!upgrade && isNative() && faceEnabled()) {
        const bi = await bioInfo();
        if (bi.available) { const x = await bioAuth('אימות כניסה לחשבון'); if (!x.ok) { await auth.signOut(); setErr(x.cancelled ? `הכניסה בוטלה. נדרש אימות עם ${bioName(bi.type)}.` : 'האימות נכשל. אפשר לנסות שוב.'); return; } }
      }
      await afterAuth(upgrade);
    }
  } catch (e) { setPendingUpgrade(false); if (!e?.cancelled) setErr(heb(e)); }
}

/* ---------- אימייל וסיסמה ---------- */
export function showEmailAuth({ upgrade = false, tab = 'login', email: pre = '' } = {}) {
  const signup = tab === 'signup';
  mount(`
    ${topBack('b-back')}
    <h1 class="auth-title sm">${signup ? 'יצירת חשבון' : 'התחברות'}</h1>
    <div class="list auth-list">
      <div class="item"><label for="f-email">אימייל</label><input id="f-email" type="email" inputmode="email" autocomplete="username" dir="ltr" value="${esc(pre)}"></div>
      ${pwField('f-pw', 'סיסמה', signup ? 'new-password' : 'current-password')}
      ${signup ? pwField('f-pw2', 'אימות סיסמה', 'new-password') : ''}
    </div>
    ${signup ? pwRulesHtml(true) : ''}
    <p class="auth-err" id="auth-err"></p>
    <button type="button" id="b-go" class="btn-block ">${signup ? 'צור חשבון' : 'התחבר'}</button>
    ${signup ? '' : '<button type="button" id="b-forgot" class="btn-block plain sm">שכחתי סיסמה</button>'}
    <p class="auth-switch">${signup ? 'כבר יש לך חשבון? להתחברות' : 'עדיין אין לך חשבון? להרשמה'} <button type="button" id="b-switch" class="link-btn">לחץ כאן</button></p>`);
  $('b-switch').onclick = () => showEmailAuth({ upgrade, tab: signup ? 'login' : 'signup', email: ($('f-email').value || '').trim() });
  if (signup) bindPwRules($('f-pw'), $('f-pw2'), () => haptic('success'));
  $('b-back').onclick = () => showWelcome({ upgrade });
  // Face ID הופעל במכשיר: מבקשים אימות במקום להקליד (ביטול משאיר את הטופס הרגיל)
  if (!signup && !upgrade && isNative() && faceEnabled()) (async () => {
    const bi = await bioInfo(); if (!bi.available) return;
    // אם Face ID נכשל, החלון של המערכת מציע "הזן קוד מכשיר". ביטול = חוזרים לטופס הרגיל. כישלון = ניסיון נוסף אחד
    let r = await readToken('כניסה לחשבון');
    if (r.failed) r = await readToken('נסה שוב, או הזן את קוד המכשיר');
    if (r.failed) return setErr('לא הצלחנו לאמת אותך. אפשר להתחבר עם סיסמה.');
    if (r.cancelled || r.error) return;
    if (!r.value) { setFaceEnabled(false); return; }
    const btn = $('b-go'); busy(btn, true);
    try { await auth.signInWithToken(r.value); await auth.faceSaveNow(); await afterAuth(false); }
    catch (e) { busy(btn, false); await clearToken(); setFaceEnabled(false); setErr('ההתחברות הקודמת פגה. התחבר עם סיסמה ואז הפעל Face ID מחדש.'); }
  })();
  const go = async () => {
    setErr(''); const email = ($('f-email').value || '').trim(), pw = $('f-pw').value || '';
    if (!email || !pw) return setErr('נא למלא אימייל וסיסמה');
    if (signup && pw !== ($('f-pw2').value || '')) { haptic('warning'); return setErr('הסיסמאות לא תואמות'); }
    if (signup) { const bad = passwordIssues(pw); if (bad.length) return setErr('הסיסמה צריכה: ' + bad.join(', ')); }
    const btn = $('b-go'); busy(btn, true);
    try {
      if (upgrade) setPendingUpgrade(true);
      const r = signup ? await auth.signUp(email, pw) : await auth.signIn(email, pw);
      if (r.confirmEmail) return showVerifyEmail({ upgrade, email });
      await afterAuth(upgrade);
    } catch (e) { busy(btn, false); setPendingUpgrade(false); setErr(heb(e)); }
  };
  $('b-go').onclick = go;
  if ($('b-forgot')) $('b-forgot').onclick = () => showForgot({ upgrade, email: ($('f-email').value || '').trim() });
}

// אחרי כניסה מוצלחת: אימות דו-שלבי אם מוגדר, אחר כך שדרוג (אם צריך) והמשך
async function afterAuth(upgrade) {
  const s = await auth.session2();
  if (s?.needsMfa) return showMfaChallenge({ upgrade });
  if (upgrade || getMode() === 'guest' && s) return runUpgrade();
  setMode('cloud'); hideAuth(); onReady();
}

/* ---------- אימות דו-שלבי: כניסה ---------- */
export async function showMfaChallenge({ upgrade = false } = {}) {
  const factors = await auth.mfa.verified().catch(() => []);
  mount(`
    <h1 class="auth-title sm">אימות דו-שלבי</h1>
    <p class="auth-sub">הכנס את הקוד בן 6 הספרות מאפליקציית האימות.</p>
    <div class="list auth-list"><div class="item"><label for="f-code">קוד מהאפליקציה</label><input id="f-code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" dir="ltr"></div></div>
    <p class="auth-err" id="auth-err"></p>
    <button type="button" id="b-go" class="btn-block ">אמת</button>
    <button type="button" id="b-out" class="btn-block plain">התנתק</button>`);
  $('b-out').onclick = async () => { await auth.signOut(); showWelcome({ upgrade }); };
  $('b-go').onclick = async () => {
    setErr(''); const btn = $('b-go'); busy(btn, true);
    try {
      if (!factors.length) throw new Error('לא נמצאה שיטת אימות');
      await auth.mfa.verify(factors[0].id, $('f-code').value);
      if (upgrade || getMode() === 'guest') return runUpgrade();
      setMode('cloud'); hideAuth(); onReady();
    } catch (e) { busy(btn, false); setErr(heb(e)); }
  };
}

/* ---------- אימות דו-שלבי: הפעלה (מההגדרות) ---------- */
export async function showMfaSetup(onDone) {
  mount('<p class="auth-sub">מכין...</p>');
  let f;
  try { f = await auth.mfa.enroll(); } catch (e) {
    mount(`${topBack('b-back')}<h1 class="auth-title sm">הפעלת אימות דו-שלבי</h1><p class="auth-err" role="alert">${esc(heb(e))}</p>`);
    $('b-back').onclick = () => { hideAuth(); onDone?.(); }; return;
  }
  mount(`
    ${topBack('b-back')}
    <h1 class="auth-title sm">הפעלת אימות דו-שלבי</h1>
    <p class="auth-sub">סרוק את הקוד באפליקציית אימות (Google Authenticator, Microsoft Authenticator וכד׳). אם אתה באייפון עצמו, העתק את המפתח ידנית.</p>
    <img class="qr" src="${f.qr}" alt="QR">
    <p class="auth-note" dir="ltr" style="user-select:all;word-break:break-all"><b>${esc(f.secret)}</b></p>
    <div class="list auth-list"><div class="item"><label for="f-code">קוד מהאפליקציה</label><input id="f-code" inputmode="numeric" maxlength="6" dir="ltr"></div></div>
    <p class="auth-err" id="auth-err"></p>
    <button type="button" id="b-go" class="btn-block ">אמת והפעל</button>`);
  $('b-back').onclick = () => { hideAuth(); onDone?.(); };
  $('b-go').onclick = async () => {
    setErr(''); const btn = $('b-go'); busy(btn, true);
    try { await auth.mfa.verify(f.id, $('f-code').value); hideAuth(); onDone?.(true); } catch (e) { busy(btn, false); setErr(heb(e)); }
  };
}

/* ---------- שדרוג אורח לחשבון ---------- */
export const startUpgrade = () => showWelcome({ upgrade: true });
export async function runUpgrade() {
  mount(`<h1 class="auth-title sm">מעביר את הנתונים...</h1><div class="spinner auth-spin" role="progressbar" aria-label="טוען"></div><p class="auth-sub" id="up-step">מתחיל</p><p class="auth-err" id="auth-err"></p>`);
  try {
    await loadLocal();
    const sb = await getClient();
    const rep = await migrateGuestToCloud(sb, JSON.parse(JSON.stringify(D)), s => { const e = $('up-step'); if (e) e.textContent = s; });
    await flushLocal(); await clearLocal({ keepBackup: true });        // נשמר גיבוי מקומי למקרה חירום
    setPendingUpgrade(false); setMode('cloud');
    mount(`<h1 class="auth-title sm">הנתונים הועברו ✓</h1>
      <div class="list auth-list">
        ${[['משמרות', rep.shifts], ['חופשות והיעדרויות', rep.leave], ['תלושים', rep.payslips], ['שכר שעתי', rep.rates]].map(([n, v]) => `<div class="item line"><span>${n}</span><b>${v}</b></div>`).join('')}
      </div>
      ${rep.skipped ? `<p class="auth-note">${rep.skipped} פריטים כבר היו בחשבון ולא הועתקו שוב.</p>` : ''}
      <button type="button" id="b-go" class="btn-block ">המשך</button>`);
    $('b-go').onclick = () => { hideAuth(); onReady(); };
  } catch (e) {
    mount(`<h1 class="auth-title sm">ההעברה נכשלה</h1><p class="auth-err">${esc(heb(e))}</p><p class="auth-note">הנתונים המקומיים לא נמחקו. אפשר לנסות שוב.</p>
      <button type="button" id="b-go" class="btn-block ">נסה שוב</button><button type="button" id="b-cancel" class="btn-block plain">חזור לאפליקציה</button>`);
    $('b-go').onclick = () => runUpgrade();
    $('b-cancel').onclick = () => { setMode('guest'); setPendingUpgrade(false); hideAuth(); onReady(); };
  }
}

/* ---------- איפוס סיסמה: מסך נפרד, אישור שליחה, וקביעת סיסמה חדשה מהקישור ---------- */
export function showForgot({ upgrade = false, email: pre = '' } = {}) {
  mount(`${topBack('b-back')}
    <h1 class="auth-title sm">איפוס סיסמה</h1>
    <p class="auth-sub">נשלח אליך קוד בן 6 ספרות לאימייל.</p>
    <div class="list auth-list"><div class="item"><label for="f-email">אימייל</label><input id="f-email" type="email" inputmode="email" autocomplete="username" dir="ltr" value="${esc(pre)}"></div></div>
    <p class="auth-err" id="auth-err" role="alert"></p>
    <button type="button" id="b-go" class="btn-block">שלח קוד</button>`);
  $('b-back').onclick = () => showEmailAuth({ upgrade, email: ($('f-email').value || '').trim() });
  $('b-go').onclick = async () => {
    setErr(''); const email = ($('f-email').value || '').trim();
    if (!/^\S+@\S+\.\S+$/.test(email)) return setErr('כתוב כתובת אימייל תקינה');
    const btn = $('b-go'); busy(btn, true, 'שולח קוד...');
    try { await auth.resetPassword(email); showResetSent({ upgrade, email }); } catch (e) { busy(btn, false); setErr(heb(e)); }
  };
}
// ----- קוד אימות בן 6 ספרות: שש תיבות, קליטה אוטומטית מהמייל, שליחה אוטומטית בספרה השישית -----
const otpHtml = () => `<div class="otp" id="otp" dir="ltr">${'<i class="otp-box"></i>'.repeat(6)}<input id="f-code" inputmode="numeric" pattern="[0-9]*" autocomplete="one-time-code" maxlength="6" aria-label="קוד בן 6 ספרות מהמייל" dir="ltr"></div>`;
function bindOtp(verify) {
  const inp = $('f-code'), box = $('otp'), boxes = [...box.querySelectorAll('.otp-box')]; let sending = false;
  const paint = () => { const v = inp.value; boxes.forEach((x, i) => { x.textContent = v[i] || ''; x.classList.toggle('on', i === Math.min(v.length, 5) && document.activeElement === inp); x.classList.toggle('fill', !!v[i]); }); };
  const submit = async () => {
    if (sending) return; sending = true; setErr(''); box.classList.add('is-busy');
    try { await verify(inp.value); }
    catch (e) { setErr(heb(e)); haptic('error'); box.classList.remove('is-busy'); box.classList.add('shake'); setTimeout(() => box.classList.remove('shake'), 400); inp.value = ''; paint(); sending = false; inp.focus(); }
  };
  inp.addEventListener('input', () => { inp.value = inp.value.replace(/\D/g, '').slice(0, 6); paint(); if (inp.value.length === 6) submit(); });
  inp.addEventListener('focus', paint); inp.addEventListener('blur', paint);
  box.onclick = () => inp.focus();
  paint(); setTimeout(() => inp.focus(), 150);
}
// כפתור "שלח קוד חדש" עם ספירה לאחור של 30 שניות
function bindResend(send) {
  let n = 30; const again = $('b-again');
  const tick = () => { if (!again.isConnected) return; again.textContent = n > 0 ? `שלח קוד חדש (${n})` : 'שלח קוד חדש'; again.disabled = n > 0; if (n-- > 0) setTimeout(tick, 1000); };
  tick();
  again.onclick = async () => { busy(again, true, 'שולח קוד...'); try { await send(); setErr('נשלח קוד חדש.'); } catch (e) { setErr(heb(e)); } n = 30; busy(again, false); tick(); };
}
function showResetSent({ upgrade, email }) {
  mount(`${topBack('b-back')}
    <h1 class="auth-title sm">הכנס את הקוד</h1>
    <p class="auth-sub">אם קיים חשבון עם <b dir="ltr">${esc(email)}</b>, שלחנו אליו קוד בן 6 ספרות. אפשר לקרוא את המייל בכל מכשיר.</p>
    <p class="auth-note">הקוד תקף למשך שעה אחת. אחרי כן אפשר לבקש קוד חדש.</p>
    ${otpHtml()}
    <p class="auth-err" id="auth-err" role="alert"></p>
    <button type="button" id="b-again" class="btn-block plain" disabled>שלח קוד חדש</button>`);
  $('b-back').onclick = () => showEmailAuth({ upgrade, email });
  bindOtp(async code => { await auth.verifyRecoveryCode(email, code); showNewPassword(); });
  bindResend(() => auth.resetPassword(email));
}
// אימות כתובת האימייל בהרשמה: קוד בן 6 ספרות כדי לוודא שהכתובת נכונה ושייכת למשתמש
function showVerifyEmail({ upgrade, email }) {
  mount(`${topBack('b-back')}
    <h1 class="auth-title sm">אימות האימייל</h1>
    <p class="auth-sub">שלחנו קוד בן 6 ספרות אל <b dir="ltr">${esc(email)}</b>. הכנס אותו כדי להשלים את ההרשמה.</p>
    <p class="auth-note">הקוד תקף למשך שעה אחת. טעית בכתובת? חזור ותקן אותה.</p>
    ${otpHtml()}
    <p class="auth-err" id="auth-err" role="alert"></p>
    <button type="button" id="b-again" class="btn-block plain" disabled>שלח קוד חדש</button>`);
  $('b-back').onclick = () => { setPendingUpgrade(false); showEmailAuth({ upgrade, tab: 'signup', email }); };
  bindOtp(async code => { await auth.verifySignupCode(email, code); await afterAuth(upgrade); });
  bindResend(() => auth.resendSignupCode(email));
}
export function showNewPassword() {
  mount(`${topBack('b-back')}
    <h1 class="auth-title sm">קביעת סיסמה חדשה</h1>
    <div class="list auth-list">
      ${pwField('f-pw', 'סיסמה חדשה', 'new-password')}
      ${pwField('f-pw2', 'אימות סיסמה', 'new-password')}
    </div>
    ${pwRulesHtml(true)}
    <p class="auth-err" id="auth-err" role="alert"></p>
    <button type="button" id="b-go" class="btn-block">שמור סיסמה</button>`);
  bindPwRules($('f-pw'), $('f-pw2'), () => haptic('success'));
  $('b-back').onclick = async () => { try { await auth.signOut(); } catch {} showWelcome(); };
  $('b-go').onclick = async () => {
    setErr(''); const pw = $('f-pw').value || '';
    const bad = passwordIssues(pw); if (bad.length) return setErr('הסיסמה צריכה: ' + bad.join(', '));
    if (pw !== ($('f-pw2').value || '')) { haptic('warning'); return setErr('הסיסמאות לא תואמות'); }
    const btn = $('b-go'); busy(btn, true);
    try { await auth.updatePassword(pw); setMode('cloud'); hideAuth(); onReady(); }
    catch (e) { busy(btn, false); setErr(heb(e)); }
  };
}
