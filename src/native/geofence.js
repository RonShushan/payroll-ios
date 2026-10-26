// הגעה/יציאה ממקום העבודה. הלוגיקה בפועל רצה בקוד נייטיב (GeoMonitor), גם כשהאפליקציה סגורה.
// כאן: הגדרת המיקום, סנכרון מצב (חופש/חגים/משמרת פעילה) וקריאת האירוע האחרון.
import { registerPlugin } from '@capacitor/core';
import { isNativeApp } from './env.js';

const KEY = 'payroll-geo';
const Geofence = isNativeApp() ? registerPlugin('Geofence') : null;
const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; } };
const write = v => { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch {} };

export const geoConfig = () => ({ enabled: false, radius: 50, windowMin: 90, ...read() });
export const geoAvailable = () => !!Geofence;

export async function geoStatus() { return Geofence ? Geofence.status() : { auth: 'denied', monitoring: false }; }

// שלב 1: הרשאה בזמן שימוש. שלב 2 (מיד אחריו): "תמיד", שנחוצה לעבודה ברקע
export async function geoAskPermission() {
  await Geofence.requestWhenInUse();
  await new Promise(r => setTimeout(r, 1500));
  let st = await Geofence.status();
  if (st.auth === 'whenInUse') { await Geofence.requestAlways(); await new Promise(r => setTimeout(r, 1500)); st = await Geofence.status(); }
  return st;
}

export async function geoSetHere(radius = 50) {
  const loc = await Geofence.getLocation();
  const cfg = { ...geoConfig(), lat: loc.lat, lng: loc.lng, radius, enabled: true, accuracy: Math.round(loc.accuracy) };
  await Geofence.start({ lat: cfg.lat, lng: cfg.lng, radius });
  write(cfg); return cfg;
}
export async function geoDisable() { if (Geofence) await Geofence.stop(); write({ ...geoConfig(), enabled: false }); }
export function geoSetWindow(min) { write({ ...geoConfig(), windowMin: Number(min) || 90 }); }

const mins = hhmm => { const [h, m] = String(hhmm || '00:00').split(':').map(Number); return (h || 0) * 60 + (m || 0); };
// מסנכרן לקוד הנייטיב את מה שהוא צריך כדי להחליט אם להתריע. נקרא מ-planReminders
export async function geoSyncState({ settings: s, leaveDays, todayShifts, today }) {
  const cfg = geoConfig(); if (!Geofence || !cfg.enabled) return;
  const skipDays = [...leaveDays];
  await Geofence.updateState({ state: JSON.stringify({
    workDays: s.remind_days || [0, 1, 2, 3, 4, 5], inMin: mins(s.remind_in), outMin: mins(s.remind_out), friOutMin: mins(s.remind_fri_out),
    windowMin: cfg.windowMin, skipDays, stateDate: today, hasShiftToday: todayShifts.length > 0, activeShift: todayShifts.some(x => !x.end_at),
  }) });
}

// האם הייתה התראת הגעה/יציאה שלא טיפלנו בה? { kind: 'in'|'out', ts } או null
export async function geoConsumePending() {
  if (!Geofence) return null;
  const p = await Geofence.consumePending();
  return p && p.kind && Date.now() / 1000 - p.ts < 6 * 3600 ? p : null;
}

export async function geoLog() { if (!Geofence) return []; try { return (await Geofence.getLog()).lines || []; } catch { return []; } }

// נשמר בחשבון (settings.profile.geo) כדי שמקום העבודה יישרוד החלפת מכשיר
export const geoCloudCfg = () => { const c = geoConfig(); return c.lat ? { lat: c.lat, lng: c.lng, radius: c.radius, windowMin: c.windowMin, enabled: !!c.enabled } : { enabled: false, windowMin: c.windowMin }; };
// במכשיר חדש: משחזר את המקום השמור. מפעיל ניטור רק אם ההרשאה כבר אושרה, אחרת נשאר "מוגדר, לא פעיל" עד שהמשתמש מפעיל.
export async function geoRestore(saved) {
  if (!saved?.lat || read().lat) return false;
  write({ ...geoConfig(), lat: saved.lat, lng: saved.lng, radius: saved.radius || 50, windowMin: saved.windowMin || 90, enabled: false });
  if (Geofence && saved.enabled) {
    try {
      const st = await Geofence.status();
      if (st.auth === 'always' || st.auth === 'whenInUse') { await Geofence.start({ lat: saved.lat, lng: saved.lng, radius: saved.radius || 50 }); write({ ...geoConfig(), enabled: true }); }
    } catch {}
  }
  return true;
}
// מפעיל ניטור על המקום השמור (בלי לקבוע מיקום חדש)
export async function geoResume() {
  const c = geoConfig(); if (!Geofence || !c.lat) return null;
  await Geofence.start({ lat: c.lat, lng: c.lng, radius: c.radius }); write({ ...c, enabled: true }); return geoConfig();
}
