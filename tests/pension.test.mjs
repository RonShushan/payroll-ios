// בדיקות פנסיה: הרצה: node tests/pension.test.mjs
// בנוסף: כל קובץ tests/fixtures/payslip-*.json מושווה לתלוש אמיתי (ראה tests/fixtures/README.md)
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
const { computeMonth, comparePayslip, DEFAULT_SETTINGS, PENSION_START } = await import('../src/lib/payroll.js');
const { pension } = await import('../src/lib/engine.js');

// נוסחה: עובד 6%, מעסיק 6.5%, פיצויים 8.33% משכר מבוטח
assert.deepEqual(pension(7000), { emp: 420, employer: 455, severance: 583.1 });
assert.deepEqual(pension(0), { emp: 0, employer: 0, severance: 0 });
assert.deepEqual(pension(10000, { emp: .07, employer: .075, severance: .06 }), { emp: 700, employer: 750, severance: 600 });

const rates = [{ from_date: '2025-01-01', hourly_rate: 50 }];
const day = (ym, d, h) => ({ start_at: `${ym}-${d}T06:00:00.000Z`, end_at: new Date(Date.parse(`${ym}-${d}T06:00:00.000Z`) + h * 3600e3).toISOString() });
const base = { ...DEFAULT_SETTINGS, credit_points: 2.25, break_minutes: 0 };
const run = (ym, shifts, s = base, leave = []) => { const [y, m] = ym.split('-').map(Number); return computeMonth({ year: y, month: m, shifts, leave, rates, settings: s, prior: { cumIncome: 0, taxPaid: 0, monthIndex: 0 } }); };

// לפני תחילת הפנסיה: אפס
const before = run('2025-04', ['07', '08', '09'].map(d => day('2025-04', d, 8)));
assert.equal(before.pensionEmp, 0); assert.equal(before.pensionEmployer, 0); assert.equal(before.severance, 0);
assert.equal(PENSION_START, '2025-05');

// אחרי התחילה, בלי שעות נוספות: שכר מבוטח = שכר רגיל, פנסיה עובד = 6%
const six = run('2026-10', ['05', '06', '07', '08', '11', '12'].map(d => day('2026-10', d, 8)));
assert.equal(six.insured, six.payReg); assert.equal(six.pensionEmp, pension(six.insured).emp);
assert.equal(six.net, Math.round(six.gross - six.tax - six.bl - six.health - six.pensionEmp));

// שעות נוספות לא נכנסות לשכר המבוטח
const ot = run('2026-10', ['05', '06', '07', '08', '11', '12'].map(d => day('2026-10', d, 11)));
assert.ok(ot.gross > ot.insured); assert.equal(ot.insured, ot.payReg); assert.equal(ot.pensionEmp, pension(ot.payReg).emp);

// תוספת שסומנה כפנסיונית נכנסת לשכר המבוטח, ושאינה פנסיונית לא
const shifts = ['05', '06', '07'].map(d => day('2026-10', d, 8));
const withExtra = run('2026-10', shifts, { ...base, extras: [{ name: 'א', amount: 500, pensionable: true }, { name: 'ב', amount: 300, pensionable: false }] });
const none = run('2026-10', shifts);
assert.equal(withExtra.insured, none.insured + 500); assert.equal(withExtra.gross, none.gross + 800);

// שיעורים מותאמים מההגדרות
const custom = run('2026-10', shifts, { ...base, pension_emp_pct: 7, pension_employer_pct: 7.5, severance_pct: 6 });
assert.equal(custom.pensionEmp, pension(custom.insured, { emp: .07, employer: .075, severance: .06 }).emp);
assert.equal(custom.severance, pension(custom.insured, { emp: .07, employer: .075, severance: .06 }).severance);

// ימי חופשה בתשלום נכנסים לשכר המבוטח
const vac = run('2026-10', shifts, base, [{ day: '2026-10-14', kind: 'vacation' }]);
assert.ok(vac.insured > none.insured);
console.log('pension ok', { insured: six.insured, emp: six.pensionEmp, employer: six.pensionEmployer, severance: six.severance });

// השוואה לתלושים אמיתיים (אופציונלי). מבנה הקובץ: { slip, shifts, leave, rates, settings, prior }
const dir = new URL('./fixtures/', import.meta.url);
const files = existsSync(dir) ? readdirSync(dir).filter(f => /^payslip-.*\.json$/.test(f)) : [];
if (!files.length) console.log('אין קבצי תלוש אמיתי ב-tests/fixtures. ראה README.md שם.');
for (const f of files) {
  const j = JSON.parse(readFileSync(new URL(f, dir), 'utf8'));
  const [y, m] = j.slip.month.split('-').map(Number);
  const calc = computeMonth({ year: y, month: m, shifts: j.shifts || [], leave: j.leave || [], rates: j.rates, settings: { ...DEFAULT_SETTINGS, ...(j.settings || {}) }, prior: j.prior || { cumIncome: 0, taxPaid: 0, monthIndex: 0 } });
  const rows = comparePayslip(j.slip, calc);
  console.log(`\n${f}: חישוב מול תלוש`); for (const r of rows) console.log(`  ${r.status === 'ok' ? '✓' : '✗'} ${r.name}: תלוש ${r.slip}, חישוב ${r.calc}, פער ${r.diff}`);
  if (j.slip.insured_salary != null) console.log(`  ${Math.abs(j.slip.insured_salary - calc.insured) <= 1 ? '✓' : '✗'} שכר מבוטח: תלוש ${j.slip.insured_salary}, חישוב ${calc.insured}`);
  if (j.slip.severance != null) console.log(`  ${Math.abs(j.slip.severance - calc.severance) <= 2 ? '✓' : '✗'} פיצויים: תלוש ${j.slip.severance}, חישוב ${calc.severance}`);
  if (j.slip.pension_employer != null) console.log(`  ${Math.abs(j.slip.pension_employer - calc.pensionEmployer) <= 2 ? '✓' : '✗'} פנסיה מעסיק: תלוש ${j.slip.pension_employer}, חישוב ${calc.pensionEmployer}`);
  const pen = rows.find(r => r.name === 'פנסיה (עובד)'); if (pen) assert.equal(pen.status, 'ok', `פער בפנסיה עובד ב-${f}`);
}
