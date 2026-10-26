// חישוב חודש שלם משעות עבודה + הגדרות
import { PARAMS, insurance, pension, cumulativeTax, r2 } from './engine.js';

export const DEFAULT_SETTINGS = {
  credit_points: 2.25,
  settlement_discount_pct: 0,
  settlement_ceiling: 180000,
  break_minutes: 0,
  break_paid: false,
  travel_enabled: false,   // האם משולמים דמי נסיעות
  travel_per_day: 0,       // סכום ליום עבודה
  travel_taxable: false,   // רוב ההחזרים עד התקרה פטורים ממס; סמן רק אם בתלוש הם חייבים
  pension_emp_pct: 6,
  pension_employer_pct: 6.5,
  severance_pct: 8.33,
  daily_hours: 8,
  shabbat_150: true,
  extras: [],            // [{name, amount, pensionable}] תוספות חודשיות קבועות
  extra_deductions: [],  // [{name, amount}] ניכויים חודשיים קבועים
  report_email: '',
  remind_enabled: true,
  remind_in: '08:15',
  remind_out: '17:15',
  remind_fri_out: '13:15',
  remind_days: [0, 1, 2, 3, 4, 5],   // א׳-ו׳
};

// ימים מיוחדים בחוק: יום שבתון. מי שעבד בו מקבל 200% (פרשנות מקובלת, אלא אם יש הסכם אחר), ומי שלא עבד זכאי לשכר היום.
// 27.10.2026: יום הבחירות לכנסת ה-26 (חוק יסוד: הכנסת סעיף 10, חוק הבחירות סעיף 136)
export const SPECIAL_DAYS = { '2026-10-27': { name: 'יום הבחירות לכנסת', pay200: true } };

export const PENSION_START = '2025-05';              // תחילת הפנסיה בסמארטפיקס
const pad = n => String(n).padStart(2, '0');
export const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const _ilFmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit' });
const _ilDow = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Jerusalem', weekday: 'short' });
export const ilYmd = d => _ilFmt.format(new Date(d));                       // תאריך בשעון ישראל
export const ilDow = d => ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].indexOf(_ilDow.format(new Date(d)));
export const monthKey = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;

// ===== חודש עבודה מותאם =====
// יום תחילת חודש העבודה (1-28). ברירת מחדל 1 = חודש קלנדרי. נשמר ב-settings.profile כדי לא לדרוש עמודה חדשה.
export const startDayOf = st => { const n = Math.round(Number(st?.profile?.month_start_day)); return n >= 2 && n <= 28 ? n : 1; };
// התקופה ששמה (y,m): נקראת לפי חודש הסיום שלה. כשהיום 25: 25.10 עד 24.11 = נובמבר. from כולל, to לא כולל (תאריכים מקומיים)
export function periodOf(y, m, sd = 1) {
  if (sd <= 1) return { from: new Date(y, m - 1, 1), to: new Date(y, m, 1) };
  return { from: new Date(y, m - 2, sd), to: new Date(y, m - 1, sd) };
}
// לאיזה חודש עבודה שייך תאריך נתון
export function periodLabelOf(date, sd = 1) {
  const d = new Date(date); let y = d.getFullYear(), m = d.getMonth() + 1;
  if (sd > 1 && d.getDate() >= sd) { m++; if (m > 12) { m = 1; y++; } }
  return { y, m };
}
// שעות עשרוניות ← "9:30" (דקה אחת = מספר אחד, 60 דקות = שעה)
export function fmtHM(h) {
  const t = Math.round(Math.max(0, Number(h) || 0) * 60);
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
}

// הפסקה שמנוכה משעות העבודה: אם ההפסקה משולמת, לא מנכים
export const effBreak = s => (s && !s.break_paid ? Number(s.break_minutes) || 0 : 0);

export function shiftHours(s, defaultBreak = 0) {
  if (!s.end_at) return 0;
  const ms = new Date(s.end_at) - new Date(s.start_at);
  const br = (s.break_minutes ?? defaultBreak) * 60000;
  return Math.max(0, (ms - br) / 3600000);
}

// שכר שעתי בתוקף בתאריך נתון
export function rateAt(rates, date) {
  const d = typeof date === 'string' && date.length === 10 ? date : ilYmd(date);
  let best = null;
  for (const r of rates) if (r.from_date <= d && (!best || r.from_date > best.from_date)) best = r;
  return best ? Number(best.hourly_rate) : 0;
}

// פיצול שעות ליום: רגילות / 125% / 150%
export function splitDay(hours, isRestDay, s, special = false) {
  if (special) return { reg: 0, ot125: 0, ot150: 0, ot200: hours };
  if (isRestDay && s.shabbat_150) return { reg: 0, ot125: 0, ot150: hours, ot200: 0 };
  const d = s.daily_hours || 8;
  const reg = Math.min(hours, d);
  const over = Math.max(0, hours - d);
  return { reg, ot125: Math.min(over, 2), ot150: Math.max(0, over - 2), ot200: 0 };
}

// ימי מחלה לפי חוק: יום 1 ללא תשלום, ימים 2-3 50%, מיום 4 100% (לפי רצף)
export function sickPayDays(days) {
  const sorted = [...days].sort();
  let streak = 0, prev = null, paid = 0;
  for (const d of sorted) {
    const cur = new Date(d + 'T12:00:00');
    streak = prev && (cur - prev) / 86400000 === 1 ? streak + 1 : 1;
    paid += streak === 1 ? 0 : streak <= 3 ? 0.5 : 1;
    prev = cur;
  }
  return paid;
}

/**
 * חישוב חודש.
 * shifts: משמרות החודש. leave: ימי חופשה/חג/מחלה בחודש. rates: היסטוריית שכר.
 * prior: {cumIncome, taxPaid, monthIndex} - נתוני השנה עד החודש הנוכחי (לא כולל)
 */
export function computeMonth({ year, month, shifts, leave = [], rates, settings, prior }) {
  const s = { ...DEFAULT_SETTINGS, ...settings };
  const p = PARAMS[year] || PARAMS[2026];
  const days = {};
  for (const sh of shifts) {
    const h = shiftHours(sh, effBreak(s));
    if (!h) continue;
    const d = new Date(sh.start_at);
    const k = ilYmd(d);
    days[k] = days[k] || { hours: 0, rest: ilDow(d) === 6, rate: rateAt(rates, d), special: !!SPECIAL_DAYS[k]?.pay200 };
    days[k].hours += h;
  }
  let reg = 0, o125 = 0, o150 = 0, o200 = 0, payReg = 0, pay125 = 0, pay150 = 0, pay200 = 0;
  for (const [k, v] of Object.entries(days)) {
    const sp = splitDay(v.hours, v.rest, s, v.special);
    reg += sp.reg; o125 += sp.ot125; o150 += sp.ot150; o200 += sp.ot200;
    payReg += sp.reg * v.rate; pay125 += sp.ot125 * v.rate * 1.25; pay150 += sp.ot150 * v.rate * 1.5; pay200 += sp.ot200 * v.rate * 2;
  }
  const lastRate = rateAt(rates, `${year}-${String(month).padStart(2, '0')}-28`);
  const daily = (s.daily_hours || 8) * lastRate;
  const vac = leave.filter(l => l.kind === 'vacation' || l.kind === 'holiday' || l.kind === 'reserve').length;
  const sickPaid = sickPayDays(leave.filter(l => l.kind === 'sick').map(l => l.day));
  const payLeave = (vac + sickPaid) * daily;

  const extrasPay = s.extras.reduce((a, e) => a + Number(e.amount || 0), 0);
  const extrasPensionable = s.extras.filter(e => e.pensionable).reduce((a, e) => a + Number(e.amount || 0), 0);

  const travel = s.travel_enabled ? r2(Object.keys(days).length * Number(s.travel_per_day || 0)) : 0;   // רק ימים שבהם הגעת לעבודה
  const gross = r2(payReg + pay125 + pay150 + pay200 + payLeave + extrasPay + (s.travel_taxable ? travel : 0));
  const insured = r2(payReg + payLeave + extrasPensionable);          // שעות נוספות לא מבוטחות בפנסיה
  const ins = insurance(gross, p);
  const penOn = `${year}-${String(month).padStart(2, '0')}` >= PENSION_START;
  const pen = !penOn ? { emp: 0, employer: 0, severance: 0 } : pension(insured, { emp: s.pension_emp_pct / 100, employer: s.pension_employer_pct / 100, severance: s.severance_pct / 100 });

  const pr = prior || { cumIncome: 0, taxPaid: 0, monthIndex: 0 };
  const tax = gross > 0 ? cumulativeTax({
    year, monthIndex: pr.monthIndex + 1, cumIncome: pr.cumIncome + gross, credits: s.credit_points,
    discountPct: s.settlement_discount_pct / 100, discountCeiling: s.settlement_ceiling, taxPaidBefore: pr.taxPaid,
  }) : 0;
  const other = s.extra_deductions.reduce((a, e) => a + Number(e.amount || 0), 0);
  const net = gross > 0 || travel > 0 ? Math.round(gross - tax - ins.bl - ins.health - pen.emp - other + (s.travel_taxable ? 0 : travel)) : 0;

  return {
    payReg: r2(payReg), pay125: r2(pay125), pay150: r2(pay150), pay200: r2(pay200), ot200: r2(o200), payLeave: r2(payLeave), extrasPay: r2(extrasPay), travel, travelTaxable: !!s.travel_taxable, rate: lastRate, daily: r2(daily), sickPaid,
    workDays: Object.keys(days).length,
    hours: r2(reg + o125 + o150 + o200), reg: r2(reg), ot125: r2(o125), ot150: r2(o150),
    leaveDays: { vacation: vac, sickPaid }, gross, insured, tax, bl: ins.bl, health: ins.health,
    pensionEmp: pen.emp, pensionEmployer: pen.employer, severance: pen.severance, other, net,
    totalDeductions: r2(gross - net),
  };
}

// הערכת נטו למשמרת = הפרש נטו חודשי עם ובלי המשמרת
export function shiftNetEstimate(args, shift) {
  const without = computeMonth({ ...args, shifts: args.shifts.filter(x => x !== shift && x.id !== shift.id) });
  const withIt = computeMonth({ ...args, shifts: args.shifts.some(x => x === shift || (x.id && x.id === shift.id)) ? args.shifts : [...args.shifts, shift] });
  const h = shiftHours(shift, effBreak(args.settings));
  return { hours: r2(h), gross: r2(withIt.gross - without.gross), net: Math.round(withIt.net - without.net) };
}

// נתוני מצטבר לשנה מתלושים קיימים לפני חודש מסוים (למעסיק הנוכחי)
export function priorFromPayslips(payslips, year, month) {
  const list = payslips.filter(p => p.month.startsWith(String(year)) && +p.month.slice(5) < month);
  if (!list.length) return { cumIncome: 0, taxPaid: 0, monthIndex: 0 };
  const first = Math.min(...list.map(p => +p.month.slice(5)));
  return {
    cumIncome: list.reduce((a, p) => a + Number(p.cum_gross ?? p.gross ?? 0), 0),
    taxPaid: list.reduce((a, p) => a + Number(p.income_tax || 0), 0),
    monthIndex: month - first,
  };
}

// השוואת תלוש לחישוב: מחזיר שורות עם פער
export function comparePayslip(slip, calc) {
  const fields = [
    ['ברוטו', slip.gross, calc.gross, 1],
    ['מס הכנסה', slip.income_tax, calc.tax, 2],
    ['ביטוח לאומי', slip.national_insurance, calc.bl, 2],
    ['ביטוח בריאות', slip.health, calc.health, 2],
    ['פנסיה (עובד)', slip.pension_emp, calc.pensionEmp, 2],
    ['נטו', slip.net, calc.net, 2],
  ];
  return fields.filter(f => f[1] !== null && f[1] !== undefined && f[1] !== '').map(([name, a, b, tol]) => {
    const diff = r2(Number(a) - Number(b));
    return { name, slip: Number(a), calc: b, diff, status: Math.abs(diff) <= tol ? 'ok' : 'diff' };
  });
}
