// תזכורות מקומיות באייפון (במקום התראות שרת). מתוכננות 14 ימים קדימה ומתוכננות מחדש בכל שינוי,
// כך שתזכורת כניסה לא תצלצל אם כבר נכנסת, ולא בחגים או ביום חופש שסימנת.
import { isNativeApp } from './env.js';
export { isNativeApp };
import { store } from '../data/store.js';
import { holidayOf } from '../lib/holidays.js';
import { ilYmd, ilDow } from '../lib/payroll.js';
import { geoSyncState } from './geofence.js';

// חשוב: לא מחזירים את אובייקט הפלאגין ישירות מפונקציה async (await עליו קורא ל-.then ונכשל ב-iOS)
const plugin = async () => ({ LN: (await import('@capacitor/local-notifications')).LocalNotifications });
const HORIZON = 14;

export async function hasNotifPermission() {
  if (!isNativeApp()) return false;
  const { LN } = await plugin();
  return (await LN.checkPermissions()).display === 'granted';
}

export async function ensurePermission() {
  if (!isNativeApp()) return false;
  const { LN } = await plugin();
  const cur = await LN.checkPermissions();
  if (cur.display === 'granted') return true;
  return (await LN.requestPermissions()).display === 'granted';
}

const at = (d, hhmm) => { const [h, m] = String(hhmm || '08:15').split(':').map(Number); return new Date(d.getFullYear(), d.getMonth(), d.getDate(), h || 0, m || 0, 0); };

// מחזיר רשימת התראות לתזמון, לפי ההגדרות והנתונים. פונקציה נקייה, קלה לבדיקה.
export function buildPlan({ settings: s, now = new Date(), leaveDays = new Set(), todayShifts = [] }) {
  const days = s.remind_days || [0, 1, 2, 3, 4, 5];
  const out = [];
  for (let i = 0; i < HORIZON; i++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i, 12);
    const ymd = ilYmd(d), dow = ilDow(d);
    if (!days.includes(dow)) continue;
    const h = holidayOf(ymd); if (h && !h.erev) continue;
    if (leaveDays.has(ymd)) continue;
    const hasShift = i === 0 && todayShifts.length > 0, active = i === 0 && todayShifts.some(x => !x.end_at);
    const tIn = at(d, s.remind_in), tOut = at(d, dow === 5 ? s.remind_fri_out : s.remind_out);
    if (!hasShift && tIn > now) out.push({ id: i * 10 + 1, kind: 'in', when: tIn, body: 'לא נרשמה כניסה היום. לחץ כדי לעדכן.' });
    if ((i > 0 || active) && tOut > now) out.push({ id: i * 10 + 2, kind: 'out', when: tOut, body: 'עדיין לא נרשמה יציאה. לחץ כדי לעדכן.' });
  }
  return out;
}

export async function planReminders(settings) {
  if (!isNativeApp()) return;
  const { LN } = await plugin();
  const now = new Date(), start = ilYmd(now), end = ilYmd(new Date(now.getTime() + HORIZON * 864e5));
  const [lv, sh] = await Promise.all([
    store.leave(start, end).catch(() => []),
    store.shifts(new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString(), new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString()).catch(() => []),
  ]);
  const leaveDays = new Set(lv.map(l => l.day));
  // ימי חג נוספים לרשימת הדילוג של המיקום (ל-14 הימים הקרובים)
  const skip = new Set(leaveDays);
  for (let i = 0; i < HORIZON; i++) { const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i, 12), y = ilYmd(d), h = holidayOf(y); if (h && !h.erev) skip.add(y); }
  geoSyncState({ settings, leaveDays: skip, todayShifts: sh, today: start }).catch(e => console.warn('geo sync', e));
  const pend = await LN.getPending();
  if (pend.notifications.length) await LN.cancel({ notifications: pend.notifications.map(n => ({ id: n.id })) });
  if (settings.remind_enabled === false) return;
  if ((await LN.checkPermissions()).display !== 'granted') return;
  const plan = buildPlan({ settings, now, leaveDays, todayShifts: sh });
  if (!plan.length) return;
  await LN.schedule({ notifications: plan.map(p => ({ id: p.id, title: 'מחשבון שכר', body: p.body, schedule: { at: p.when, allowWhileIdle: true }, extra: { kind: p.kind } })) });
}

// לחיצה על התראה: מפעילים את הפונקציה עם סוג התזכורת
export async function onReminderTap(cb) {
  if (!isNativeApp()) return;
  const { LN } = await plugin();
  await LN.addListener('localNotificationActionPerformed', ev => cb(ev.notification?.extra?.kind || 'in'));
}
export async function sendTest() {
  const { LN } = await plugin();
  await LN.schedule({ notifications: [{ id: 9999, title: 'מחשבון שכר', body: 'התראת בדיקה ✓', schedule: { at: new Date(Date.now() + 3000) }, extra: { kind: 'in' } }] });
}
