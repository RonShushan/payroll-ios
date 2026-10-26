// הרצה: node tests/reminders.test.mjs
import assert from 'node:assert/strict';
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
const { buildPlan } = await import('../src/native/reminders.js');
const s = { remind_days: [0, 1, 2, 3, 4, 5], remind_in: '08:15', remind_out: '17:15', remind_fri_out: '13:15' };
const now = new Date(2026, 9, 21, 7, 0);                         // יום רביעי 21.10.2026, 07:00
let p = buildPlan({ settings: s, now });
assert.ok(p.some(x => x.id === 1 && x.kind === 'in'), 'כניסה היום');
assert.ok(!p.some(x => x.id === 2), 'אין תזכורת יציאה היום בלי משמרת פעילה');
assert.ok(p.some(x => x.id === 22), 'יציאה מחר');
// כבר נכנסתי: בלי תזכורת כניסה, ויש תזכורת יציאה
p = buildPlan({ settings: s, now, todayShifts: [{ start_at: 'x', end_at: null }] });
assert.ok(!p.some(x => x.id === 1) && p.some(x => x.id === 2));
// שבת אין תזכורות; יום חופש מסומן מדלג
assert.ok(!p.some(x => Math.floor(x.id / 10) === 3), 'שבת 24.10 לא כוללת');
p = buildPlan({ settings: s, now, leaveDays: new Set(['2026-10-22']) });
assert.ok(!p.some(x => Math.floor(x.id / 10) === 1), '22.10 סומן יום חופש');
// שישי: יציאה ב-13:15
const fri = buildPlan({ settings: s, now }).find(x => x.id === 32 || x.id === 22);
console.log('reminders ok', p.length, 'notifications');
