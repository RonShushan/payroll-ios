// אחסון מקומי במכשיר: IndexedDB (עם גיבוי בזיכרון). אותו מבנה כמו הטבלאות ב-Supabase.
const DB = 'payroll-local', STORE = 'kv', KEY = 'data';
export const emptyData = () => ({ shifts: [], leave_days: [], rate_history: [], payslips: [], settings: null, seq: 1 });
export const D = emptyData();                      // אובייקט יחיד שנשמר בין קריאות

// backend ניתן להחלפה (לבדיקות). ברירת מחדל: IndexedDB
const idbBackend = {
  open() { return new Promise((res, rej) => { const r = indexedDB.open(DB, 1); r.onupgradeneeded = () => r.result.createObjectStore(STORE); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); },
  async get(k) { const db = await this.open(); return new Promise((res, rej) => { const r = db.transaction(STORE).objectStore(STORE).get(k); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); },
  async set(k, v) { const db = await this.open(); return new Promise((res, rej) => { const t = db.transaction(STORE, 'readwrite'); t.objectStore(STORE).put(v, k); t.oncomplete = () => res(); t.onerror = () => rej(t.error); }); },
  async del(k) { const db = await this.open(); return new Promise((res, rej) => { const t = db.transaction(STORE, 'readwrite'); t.objectStore(STORE).delete(k); t.oncomplete = () => res(); t.onerror = () => rej(t.error); }); },
};
let backend = idbBackend, loaded = false, timer = null, chain = Promise.resolve();
export const setBackend = b => { backend = b; loaded = false; };

export async function loadLocal() {
  if (loaded) return D;
  let v = null;
  try { v = await backend.get(KEY); } catch (e) { console.warn('idb read', e); }
  if (!v) {                                         // מעבר חד-פעמי מגרסה ישנה ששמרה ב-localStorage
    try { const old = globalThis.localStorage?.getItem('payroll-demo'); if (old) { v = JSON.parse(old); await backend.set(KEY, v); } } catch {}
  }
  const base = emptyData();
  for (const k of Object.keys(D)) delete D[k];
  Object.assign(D, base, v || {});
  loaded = true; return D;
}
// שמירה מושהית קצרה (מאחדת כמה כתיבות), ותמיד בסדר
export function saveLocal() {
  clearTimeout(timer);
  timer = setTimeout(() => { chain = chain.then(() => backend.set(KEY, JSON.parse(JSON.stringify(D)))).catch(e => console.warn('idb write', e)); }, 150);
}
export async function flushLocal() { clearTimeout(timer); chain = chain.then(() => backend.set(KEY, JSON.parse(JSON.stringify(D)))); await chain; }
export async function clearLocal({ keepBackup = true } = {}) {
  if (keepBackup) await backend.set('backup', { at: new Date().toISOString(), data: JSON.parse(JSON.stringify(D)) });
  for (const k of Object.keys(D)) delete D[k]; Object.assign(D, emptyData());
  await backend.set(KEY, JSON.parse(JSON.stringify(D))); loaded = true;
}
export const readBackup = async () => backend.get('backup');
