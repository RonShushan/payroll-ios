// בדיקות מנוע שכר: הרצה: node tests/engine.test.mjs
import assert from 'node:assert/strict';
const { computeMonth, effBreak, shiftHours, DEFAULT_SETTINGS } = await import('../src/lib/payroll.js');
const rates = [{ from_date: '2026-01-01', hourly_rate: 50 }];
const mk = (d, h) => ({ start_at: `2026-10-${d}T06:00:00.000Z`, end_at: new Date(Date.parse(`2026-10-${d}T06:00:00.000Z`) + h * 3600e3).toISOString() });
const shifts = ['05', '06', '07', '08'].map(d => mk(d, 9));    // 4 ימים, 9 שעות
const base = { ...DEFAULT_SETTINGS, credit_points: 2.25, break_minutes: 60 };
const run = s => computeMonth({ year: 2026, month: 10, shifts, leave: [], rates, settings: s, prior: { cumIncome: 0, taxPaid: 0, monthIndex: 0 } });
// הפסקה לא משולמת מנוכה, משולמת לא
assert.equal(effBreak(base), 60); assert.equal(effBreak({ ...base, break_paid: true }), 0);
assert.equal(run(base).hours, 32); assert.equal(run({ ...base, break_paid: true }).hours, 36);
// נסיעות: 4 ימים x 20, פטור: הברוטו לא משתנה והנטו גדל ב-80
const a = run(base), b = run({ ...base, travel_enabled: true, travel_per_day: 20 });
assert.equal(b.travel, 80); assert.equal(b.gross, a.gross); assert.equal(b.net - a.net, 80);
// נסיעות חייבות: נכנסות לברוטו
const c = run({ ...base, travel_enabled: true, travel_per_day: 20, travel_taxable: true });
assert.equal(c.gross, a.gross + 80);
// הנחת יישוב: מקטינה מס
const d = run({ ...base, settlement_discount_pct: 12, settlement_ceiling: 213240 });
assert.ok(d.tax <= a.tax && d.net >= a.net);
console.log('engine ok', { gross: a.gross, tax: a.tax, net: a.net, taxWithSettlement: d.tax });
// מס עם הנחת יישוב בהכנסה גבוהה יותר: ההנחה = אחוז x הכנסה (עד תקרה) ולא מורידה את המס מתחת ל-0
const hi = [{ from_date: '2026-01-01', hourly_rate: 150 }];
const runHi = s => computeMonth({ year: 2026, month: 1, shifts: ['05','06','07','08','11','12','13','14','15','18'].map(d => ({ start_at: `2026-01-${d}T06:00:00.000Z`, end_at: `2026-01-${d}T15:00:00.000Z` })), leave: [], rates: hi, settings: s, prior: { cumIncome: 0, taxPaid: 0, monthIndex: 0 } });
const t0 = runHi({ ...base, break_minutes: 0 }), t1 = runHi({ ...base, break_minutes: 0, settlement_discount_pct: 18, settlement_ceiling: 259920 });
const expectDisc = Math.min(t0.tax, 0.18 * Math.min(t0.gross, 259920 / 12));
assert.ok(Math.abs((t0.tax - t1.tax) - expectDisc) < 1, `discount ${t0.tax - t1.tax} vs ${expectDisc}`);
console.log('settlement ok', { gross: t0.gross, taxNo: t0.tax, taxWith: t1.tax });
