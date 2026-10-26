import { registerPlugin } from '@capacitor/core';
// התחברות והרשמה (Supabase Auth): מייל+סיסמה, גוגל, ואימות דו-שלבי (TOTP)
import { getClient } from '../data/supabase.js';
import { getMode, setMode } from '../data/mode.js';
import { faceEnabled, saveToken, clearToken } from '../native/biometric.js';

export const NATIVE_REDIRECT = 'com.ronshushan.payroll://login-callback';
export const isNative = () => !!globalThis.Capacitor?.isNativePlatform?.();
const OAUTH_FLAG = 'payroll-oauth';

export function heb(e) {
  const m = String(e?.message || e || '');
  const map = [
    [/HTTP 50[234]|gateway|timed? ?out|Error sending/i, 'שליחת המייל נכשלה. נסה שוב בעוד רגע'],
    [/Invalid login credentials/i, 'אימייל או סיסמה שגויים'],
    [/already registered|already been registered/i, 'כבר קיים חשבון עם האימייל הזה. נסה להתחבר'],
    [/at least (\d+) characters/i, 'הסיסמה קצרה מדי (לפחות 6 תווים)'],
    [/Email not confirmed/i, 'צריך לאשר את האימייל. בדוק את תיבת הדואר'],
    [/Invalid (TOTP )?code|invalid.*code/i, 'הקוד שגוי או שפג תוקפו'],
    [/rate limit|too many/i, 'יותר מדי ניסיונות. נסה שוב בעוד כמה דקות'],
    [/Failed to fetch|NetworkError|Load failed/i, 'אין חיבור לאינטרנט'],
    [/Unable to validate email|invalid format/i, 'כתובת האימייל לא תקינה'],
    [/same password|different from the old/i, 'הסיסמה החדשה זהה לישנה'],
    [/otp_expired|expired|invalid.*(token|link)|token.*invalid|link.*invalid/i, 'הקוד שגוי או שפג תוקפו. בקש קוד חדש'],
    [/weak password|password.*(weak|should)/i, 'הסיסמה חלשה מדי'],
    [/provider is not enabled|Unsupported provider/i, 'התחברות בגוגל עוד לא הופעלה ב-Supabase'],
  ];
  for (const [re, t] of map) if (re.test(m)) return t;
  return m || 'שגיאה לא ידועה';
}
const ok = r => { if (r.error) throw new Error(heb(r.error)); return r.data; };

export const auth = {
  // null = לא מחובר | {guest:true} | {needsMfa:true} | session
  async session() {
    const mode = getMode();
    if (mode === 'guest') return { user: { email: 'אורח' }, guest: true };
    if (mode !== 'cloud') return null;
    const c = await getClient();
    const { data } = await c.auth.getSession();
    if (!data.session) return null;
    const aal = await c.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aal.data && aal.data.nextLevel === 'aal2' && aal.data.currentLevel !== 'aal2') return { user: data.session.user, needsMfa: true };
    return data.session;
  },
  // מצב התחברות אמיתי מול Supabase, בלי קשר ל-mode (בזמן שדרוג אורח המצב עדיין guest)
  async session2() {
    const c = await getClient();
    const { data } = await c.auth.getSession();
    if (!data.session) return null;
    const aal = await c.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aal.data && aal.data.nextLevel === 'aal2' && aal.data.currentLevel !== 'aal2') return { user: data.session.user, needsMfa: true };
    return data.session;
  },
  async signUp(email, password) {
    const c = await getClient();
    const d = ok(await c.auth.signUp({ email, password }));
    if (d.user && Array.isArray(d.user.identities) && d.user.identities.length === 0) throw new Error('User already registered');   // כתובת קיימת: Supabase לא שולח מייל ולא מחזיר שגיאה
    if (!d.session) return { confirmEmail: true };
    return { session: d.session };
  },
  // אימות כתובת בהרשמה: קוד בן 6 ספרות מהמייל. מחזיר סשן כשהקוד נכון
  async verifySignupCode(email, token) {
    const c = await getClient();
    const d = ok(await c.auth.verifyOtp({ email, token: String(token).replace(/\s/g, ''), type: 'signup' }));
    if (!d.session) throw new Error('otp expired');
    return { session: d.session };
  },
  async resendSignupCode(email) { const c = await getClient(); ok(await c.auth.resend({ type: 'signup', email })); },
  async signIn(email, password) {
    const c = await getClient();
    const d = ok(await c.auth.signInWithPassword({ email, password }));
    return { session: d.session };
  },
  // אימות קוד בן 6 ספרות מהמייל (איפוס סיסמה): עובד מכל מכשיר, בלי לינקים. מחזיר סשן זמני לקביעת סיסמה חדשה
  async verifyRecoveryCode(email, token) {
    const c = await getClient();
    ok(await c.auth.verifyOtp({ email, token: String(token).replace(/\s/g, ''), type: 'recovery' }));
    return true;
  },
  async updatePassword(password) { const c = await getClient(); ok(await c.auth.updateUser({ password })); },
  async resetPassword(email) {
    const c = await getClient();
    ok(await c.auth.resetPasswordForEmail(email));
  },
  // גוגל: באייפון נפתח דפדפן המערכת (גוגל אוסרת התחברות בתוך WebView); באתר מתבצע redirect רגיל
  async signInGoogle() {
    const c = await getClient();
    if (isNative()) {
      const d = ok(await c.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: NATIVE_REDIRECT, skipBrowserRedirect: true } }));
      if (!d || !d.url || !/^https?:\/\//i.test(d.url)) throw new Error('כתובת התחברות לא תקינה: ' + String(d && d.url).slice(0, 90));
      // חלון ההתחברות הרשמי של המערכת (ASWebAuthenticationSession): מחזיר ישירות את כתובת החזרה
      const AuthSession = registerPlugin('AuthSession');
      const r = await AuthSession.start({ url: d.url, scheme: NATIVE_REDIRECT.split(':')[0] });
      if (r.cancelled) throw Object.assign(new Error('cancelled'), { cancelled: true });
      const u = new URL(String(r.url).replace('#', '?'));
      const err = u.searchParams.get('error_description'); if (err) throw new Error(heb(err));
      const code = u.searchParams.get('code'); if (!code) throw new Error('לא התקבל קוד התחברות');
      const sess = ok(await c.auth.exchangeCodeForSession(code));
      return { session: sess.session };
    }
    try { localStorage.setItem(OAUTH_FLAG, '1'); } catch {}
    ok(await c.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.origin + location.pathname } }));
    return new Promise(() => {});                      // הדף עובר לגוגל וחוזר עם ?code=
  },
  // נקרא בעליית האפליקציה באתר: משלים התחברות אחרי חזרה מגוגל
  async completeOAuthIfNeeded() {
    if (isNative()) return null;
    const u = new URL(location.href);
    let flagged = false; try { flagged = localStorage.getItem(OAUTH_FLAG) === '1'; } catch {}
    const code = u.searchParams.get('code'), err = u.searchParams.get('error_description');
    if (!flagged || (!code && !err)) return null;
    try { localStorage.removeItem(OAUTH_FLAG); } catch {}
    try { history.replaceState(null, '', location.pathname); } catch {}
    if (err) throw new Error(heb(err));
    const c = await getClient();
    const r = ok(await c.auth.exchangeCodeForSession(code));
    return r.session;
  },
  async signOut() {
    if (getMode() === 'cloud') {
      const c = await getClient();
      // Face ID פעיל: שומרים את האסימון העדכני ומנתקים רק מקומית, כדי שהכניסה החוזרת עם Face ID תעבוד
      if (isNative() && faceEnabled()) { const { data } = await c.auth.getSession(); if (data.session) await saveToken(data.session.refresh_token); await c.auth.signOut({ scope: 'local' }); }
      else await c.auth.signOut();
    }
    setMode(null);
  },
  // שומר את האסימון ב-Keychain בכל חידוש (האסימון מתחלף בכל חידוש, ואסימון ישן לא יעבוד)
  async watchFace() {
    if (!isNative() || this._fw) return; this._fw = true;
    const c = await getClient();
    c.auth.onAuthStateChange((ev, s) => { if (s && faceEnabled() && (ev === 'TOKEN_REFRESHED' || ev === 'SIGNED_IN')) saveToken(s.refresh_token); });
  },
  async faceSaveNow() { const c = await getClient(); const { data } = await c.auth.getSession(); return data.session ? saveToken(data.session.refresh_token) : false; },
  async signInWithToken(refresh_token) {
    const c = await getClient();
    const d = ok(await c.auth.refreshSession({ refresh_token }));
    if (!d.session) throw new Error('פג תוקף ההתחברות');
    setMode('cloud'); return { session: d.session };
  },
  async email() {
    if (getMode() !== 'cloud') return null;
    const c = await getClient(); const { data } = await c.auth.getUser(); return data.user?.email || null;
  },
  mfa: {
    async verified() { const c = await getClient(); const d = ok(await c.auth.mfa.listFactors()); return (d.totp || []).filter(f => f.status === 'verified'); },
    async enroll() {
      const c = await getClient();
      const all = ok(await c.auth.mfa.listFactors());
      for (const f of (all.all || []).filter(f => f.status === 'unverified')) await c.auth.mfa.unenroll({ factorId: f.id });   // מנקה ניסיונות קודמים שלא הושלמו
      const d = ok(await c.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'מחשבון שכר' }));
      return { id: d.id, qr: d.totp.qr_code, secret: d.totp.secret, uri: d.totp.uri };
    },
    async verify(factorId, code) {
      const c = await getClient();
      const ch = ok(await c.auth.mfa.challenge({ factorId }));
      ok(await c.auth.mfa.verify({ factorId, challengeId: ch.id, code: String(code).replace(/\s/g, '') }));
    },
    async remove(factorId) { const c = await getClient(); ok(await c.auth.mfa.unenroll({ factorId })); },
  },
};
