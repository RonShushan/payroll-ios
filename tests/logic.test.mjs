// בדיקות לוגיקה: אחסון מקומי (מצב אורח) ושדרוג לחשבון. הרצה: node tests/logic.test.mjs
import assert from 'node:assert/strict';
const mem = new Map(); globalThis.localStorage = { getItem: k => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: k => mem.delete(k) };
const { setBackend, loadLocal, flushLocal, clearLocal, readBackup, D } = await import('../src/data/local.js');
const kv = new Map(); setBackend({ get: async k => kv.get(k), set: async (k, v) => { kv.set(k, v); }, del: async k => { kv.delete(k); } });
const { setMode, getMode, isLocal } = await import('../src/data/mode.js');
const { store } = await import('../src/data/store.js');
const { migrateGuestToCloud } = await import('../src/data/migrate.js');

setMode('guest'); assert.equal(isLocal(), true); await loadLocal();
await store.addRate({ from_date: '2026-01-01', hourly_rate: 42 });
const s1 = await store.startShift('2026-10-07T05:00:00.000Z');
await store.saveShift({ id: s1.id, end_at: '2026-10-07T14:00:00.000Z' });
await store.saveShift({ start_at: '2026-10-08T05:00:00.000Z', end_at: '2026-10-08T14:30:00.000Z' });
await store.addLeave('2026-10-05', 'off');
await store.savePayslip({ month: '2026-09', employer_name: 'x', gross: 100, net: 90 });
await store.saveSettings({ credit_points: 2.75, break_minutes: 30 });
assert.equal((await store.shifts('2026-10-01', '2026-11-01')).length, 2);
assert.equal((await store.settings()).credit_points, 2.75);
assert.equal(await store.activeShift(), null);
await flushLocal();
// נטען מחדש מהאחסון
for (const k of Object.keys(D)) delete D[k]; setBackend({ get: async k => kv.get(k), set: async (k, v) => { kv.set(k, v); }, del: async k => {} });
await loadLocal(); assert.equal(D.shifts.length, 2); assert.equal(D.rate_history[0].hourly_rate, 42);
await assert.rejects(() => store.callFn('x', {}), /הרשמה/);

// ---- שדרוג: לקוח Supabase מדומה ----
function fakeSb(seed = {}) {
  const t = { rate_history: [], shifts: [], leave_days: [], payslips: [], settings: [], ...seed };
  return { t, auth: { getUser: async () => ({ data: { user: { id: 'u1' } }, error: null }) },
    from: tb => ({
      select: async () => ({ data: t[tb].map(x => ({ ...x })), error: null }),
      insert: async rows => { t[tb].push(...rows); return { data: null, error: null }; },
      upsert: async rows => { t[tb].push(...[].concat(rows)); return { data: null, error: null }; } }) };
}
const local = JSON.parse(JSON.stringify(D));
let sb = fakeSb(); let steps = [];
let rep = await migrateGuestToCloud(sb, local, x => steps.push(x));
assert.deepEqual([rep.rates, rep.shifts, rep.leave, rep.payslips, rep.settings, rep.skipped], [1, 2, 1, 1, true, 0]);
assert.ok(sb.t.shifts.every(s => !('id' in s)) && sb.t.payslips[0].user_id === 'u1' && steps.length === 5);
// הרצה שנייה לחשבון שכבר מכיל הכול: אין כפילויות, ההגדרות לא נדרסות
sb = fakeSb({ shifts: [{ start_at: '2026-10-07T05:00:00+00:00' }], settings: [{ user_id: 'u1' }], rate_history: [{ from_date: '2026-01-01' }] });
rep = await migrateGuestToCloud(sb, local);
assert.equal(rep.shifts, 1); assert.equal(rep.rates, 0); assert.equal(rep.settings, false); assert.equal(rep.skipped, 2);
// ניקוי מקומי עם גיבוי
await clearLocal(); assert.equal(D.shifts.length, 0); assert.equal((await readBackup()).data.shifts.length, 2);
console.log('ALL OK');
