// @ts-nocheck
// מנוע חישוב שכר - ישראל. כל הפרמטרים לפי שנה בקובץ PARAMS
const PARAMS = {
  2023: { brackets:[[6790,.10],[9740,.14],[15620,.20],[21710,.31],[45180,.35],[58190,.47],[Infinity,.50]],
          point:235, blThreshold:6331, blLow:.004, blHigh:.07, hLow:.031, hHigh:.05, cap:45075 },
  2024: { brackets:[[7010,.10],[10060,.14],[16150,.20],[22440,.31],[46690,.35],[60130,.47],[Infinity,.50]],
          point:235, blThreshold:7522, blLow:.004, blHigh:.07, hLow:.031, hHigh:.05, cap:49030 },
  2025: { brackets:[[7010,.10],[10060,.14],[16150,.20],[22440,.31],[46690,.35],[60130,.47],[Infinity,.50]],
          point:242, blThreshold:7522, blLow:.0104, blHigh:.07, hLow:.0323, hHigh:.0517, cap:50695 },
  2026: { brackets:[[7010,.10],[10060,.14],[19000,.20],[25100,.31],[46690,.35],[60130,.47],[Infinity,.50]],
          point:242, blThreshold:7703, blLow:.0104, blHigh:.07, hLow:.0323, hHigh:.0517, cap:51910 },
};
const r2 = x => Math.round((x + Number.EPSILON) * 100) / 100;

function bracketTax(income, brackets){
  let tax=0, prev=0;
  for (const [top,rate] of brackets){
    if (income>prev){ tax += (Math.min(income,top)-prev)*rate; }
    prev=top; if (income<=top) break;
  }
  return tax;
}
// ביטוח לאומי + בריאות (שניהם על כלל השכר החייב, עד תקרה)
function insurance(gross, p){
  const g = Math.min(gross, p.cap);
  const low = Math.min(g, p.blThreshold), high = Math.max(0, g - p.blThreshold);
  return { bl: Math.round(low*p.blLow + high*p.blHigh), health: Math.round(low*p.hLow + high*p.hHigh) };
}
// פנסיה: לפי שכר מבוטח (ללא שעות נוספות)
function pension(base, rates={emp:.06, employer:.065, severance:.0833}){
  return { emp:r2(base*rates.emp), employer:r2(base*rates.employer), severance:r2(base*rates.severance) };
}
// מס הכנסה בחישוב מצטבר: מס על ההכנסה המצטברת פחות זיכויים פחות הנחת יישוב (10% מההכנסה עד תקרה)
function cumulativeTax({year, monthIndex, cumIncome, credits, discountPct=0, discountCeiling=180000, taxPaidBefore=0}){
  const p = PARAMS[year];
  const gross = bracketTax(cumIncome / monthIndex, p.brackets) * monthIndex; // ממוצע חודשי לכל חודש עד כה
  const creditAmt = credits * p.point * monthIndex;
  const discount = discountPct * Math.min(cumIncome, discountCeiling * monthIndex / 12);
  const due = Math.max(0, gross - creditAmt - discount);
  return r2(due - taxPaidBefore);
}

// חישוב חודש שלם משעות עבודה + הגדרות

const DEFAULT_SETTINGS = {
  credit_points: 2.25,
  settlement_discount_pct: 10,
  settlement_ceiling: 180000,
  break_minutes: 0,
  break_paid: false,
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

const PENSION_START = '2025-05';              // תחילת הפנסיה בסמארטפיקס
const pad = n => String(n).padStart(2, '0');
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const _ilFmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit' });
const _ilDow = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Jerusalem', weekday: 'short' });
const ilYmd = d => _ilFmt.format(new Date(d));                       // תאריך בשעון ישראל
const ilDow = d => ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].indexOf(_ilDow.format(new Date(d)));
const monthKey = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;

function shiftHours(s, defaultBreak = 0) {
  if (!s.end_at) return 0;
  const ms = new Date(s.end_at) - new Date(s.start_at);
  const br = (s.break_minutes ?? defaultBreak) * 60000;
  return Math.max(0, (ms - br) / 3600000);
}

// שכר שעתי בתוקף בתאריך נתון
function rateAt(rates, date) {
  const d = typeof date === 'string' && date.length === 10 ? date : ilYmd(date);
  let best = null;
  for (const r of rates) if (r.from_date <= d && (!best || r.from_date > best.from_date)) best = r;
  return best ? Number(best.hourly_rate) : 0;
}

// פיצול שעות ליום: רגילות / 125% / 150%
function splitDay(hours, isRestDay, s) {
  if (isRestDay && s.shabbat_150) return { reg: 0, ot125: 0, ot150: hours };
  const d = s.daily_hours || 8;
  const reg = Math.min(hours, d);
  const over = Math.max(0, hours - d);
  return { reg, ot125: Math.min(over, 2), ot150: Math.max(0, over - 2) };
}

// ימי מחלה לפי חוק: יום 1 ללא תשלום, ימים 2-3 50%, מיום 4 100% (לפי רצף)
function sickPayDays(days) {
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
function computeMonth({ year, month, shifts, leave = [], rates, settings, prior }) {
  const s = { ...DEFAULT_SETTINGS, ...settings };
  const p = PARAMS[year] || PARAMS[2026];
  const days = {};
  for (const sh of shifts) {
    const h = shiftHours(sh, s.break_minutes);
    if (!h) continue;
    const d = new Date(sh.start_at);
    const k = ilYmd(d);
    days[k] = days[k] || { hours: 0, rest: ilDow(d) === 6, rate: rateAt(rates, d) };
    days[k].hours += h;
  }
  let reg = 0, o125 = 0, o150 = 0, payReg = 0, pay125 = 0, pay150 = 0;
  for (const [k, v] of Object.entries(days)) {
    const sp = splitDay(v.hours, v.rest, s);
    reg += sp.reg; o125 += sp.ot125; o150 += sp.ot150;
    payReg += sp.reg * v.rate; pay125 += sp.ot125 * v.rate * 1.25; pay150 += sp.ot150 * v.rate * 1.5;
  }
  const lastRate = rateAt(rates, `${year}-${String(month).padStart(2, '0')}-28`);
  const daily = (s.daily_hours || 8) * lastRate;
  const vac = leave.filter(l => l.kind === 'vacation' || l.kind === 'holiday' || l.kind === 'reserve').length;
  const sickPaid = sickPayDays(leave.filter(l => l.kind === 'sick').map(l => l.day));
  const payLeave = (vac + sickPaid) * daily;

  const extrasPay = s.extras.reduce((a, e) => a + Number(e.amount || 0), 0);
  const extrasPensionable = s.extras.filter(e => e.pensionable).reduce((a, e) => a + Number(e.amount || 0), 0);

  const gross = r2(payReg + pay125 + pay150 + payLeave + extrasPay);
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
  const net = gross > 0 ? Math.round(gross - tax - ins.bl - ins.health - pen.emp - other) : 0;

  return {
    payReg: r2(payReg), pay125: r2(pay125), pay150: r2(pay150), payLeave: r2(payLeave), extrasPay: r2(extrasPay), rate: lastRate, daily: r2(daily), sickPaid,
    workDays: Object.keys(days).length,
    hours: r2(reg + o125 + o150), reg: r2(reg), ot125: r2(o125), ot150: r2(o150),
    leaveDays: { vacation: vac, sickPaid }, gross, insured, tax, bl: ins.bl, health: ins.health,
    pensionEmp: pen.emp, pensionEmployer: pen.employer, severance: pen.severance, other, net,
    totalDeductions: r2(gross - net),
  };
}

// הערכת נטו למשמרת = הפרש נטו חודשי עם ובלי המשמרת
function shiftNetEstimate(args, shift) {
  const without = computeMonth({ ...args, shifts: args.shifts.filter(x => x !== shift && x.id !== shift.id) });
  const withIt = computeMonth({ ...args, shifts: args.shifts.some(x => x === shift || (x.id && x.id === shift.id)) ? args.shifts : [...args.shifts, shift] });
  const h = shiftHours(shift, args.settings?.break_minutes || 0);
  return { hours: r2(h), gross: r2(withIt.gross - without.gross), net: Math.round(withIt.net - without.net) };
}

// נתוני מצטבר לשנה מתלושים קיימים לפני חודש מסוים (למעסיק הנוכחי)
function priorFromPayslips(payslips, year, month) {
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
function comparePayslip(slip, calc) {
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

// ===== כלי עזר משותפים לפונקציות שרת =====
const SB_URL = Deno.env.get('SUPABASE_URL');
const SB_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const SB_H = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json' };
async function q(path) { const r = await fetch(`${SB_URL}/rest/v1/${path}`, { headers: SB_H }); if (!r.ok) throw new Error(path + ' ' + await r.text()); return r.json(); }
async function dbWrite(method, path, body, prefer) {
  const r = await fetch(`${SB_URL}/rest/v1/${path}`, { method, headers: { ...SB_H, Prefer: prefer || 'return=representation' }, body: body === undefined ? undefined : JSON.stringify(body) });
  if (!r.ok) throw new Error(method + ' ' + path + ' ' + await r.text());
  const t = await r.text(); return t ? JSON.parse(t) : null;
}
// מזהה משתמש מתוך טוקן המשתמש (לקריאות מהאפליקציה)
async function userFromReq(req) {
  const a = req.headers.get('authorization') || '';
  const r = await fetch(`${SB_URL}/auth/v1/user`, { headers: { apikey: SB_KEY, Authorization: a } });
  if (!r.ok) return null; const u = await r.json(); return u && u.id ? u : null;
}
const money = n => '₪' + Number(n || 0).toLocaleString('he-IL', { maximumFractionDigits: 2 });
const num = n => Number(n || 0).toLocaleString('he-IL', { maximumFractionDigits: 2 });
const il = d => new Date(d.toLocaleString('en-US', { timeZone: 'Asia/Jerusalem' }));
const ilHM = d => new Date(d).toLocaleTimeString('en-GB', { timeZone: 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit' });
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ===== חישוב חודש מהמסד + בדיקת תלוש =====
async function calcMonthFor(userId, y, m) {
  const mk = `${y}-${String(m).padStart(2, '0')}`;
  const from = new Date(Date.UTC(y, m - 1, 1) - 3 * 3600e3).toISOString(), to = new Date(Date.UTC(y, m, 1) - 3 * 3600e3).toISOString();
  const u = `user_id=eq.${userId}`;
  const [sRows, rates, shifts, leave, slips] = await Promise.all([
    q(`settings?${u}`), q(`rate_history?${u}&order=from_date`), q(`shifts?${u}&start_at=gte.${from}&start_at=lt.${to}&order=start_at`),
    q(`leave_days?${u}&day=gte.${mk}-01&day=lte.${mk}-31`), q(`payslips?${u}&order=month`)]);
  const settings = { ...DEFAULT_SETTINGS, ...(sRows[0] || {}), extras: sRows[0]?.extras || [], extra_deductions: sRows[0]?.extra_deductions || [] };
  let cum = 0, tax = 0, first = null;
  for (let k = 1; k < m; k++) {
    const key = `${y}-${String(k).padStart(2, '0')}`; const ps = slips.filter(p => p.month === key);
    let g = 0, t = 0;
    if (ps.length) { g = ps.reduce((a, p) => a + Number(p.gross || 0), 0); t = ps.reduce((a, p) => a + Number(p.income_tax || 0), 0); }
    else {
      const f2 = new Date(Date.UTC(y, k - 1, 1) - 3 * 3600e3).toISOString(), t2 = new Date(Date.UTC(y, k, 1) - 3 * 3600e3).toISOString();
      const sh2 = await q(`shifts?${u}&start_at=gte.${f2}&start_at=lt.${t2}`);
      const lv2 = await q(`leave_days?${u}&day=gte.${key}-01&day=lte.${key}-31`);
      if (!sh2.length && !lv2.length) continue;
      const c2 = computeMonth({ year: y, month: k, shifts: sh2, leave: lv2, rates, settings, prior: { cumIncome: cum, taxPaid: tax, monthIndex: first === null ? 0 : k - first - 1 } });
      g = c2.gross; t = c2.tax;
    }
    if (g > 0) { if (first === null) first = k; cum += g; tax += t; }
  }
  const c = computeMonth({ year: y, month: m, shifts, leave, rates, settings, prior: { cumIncome: cum, taxPaid: tax, monthIndex: first === null ? 0 : m - first } });
  return { c, shifts, leave, slips, settings, rates, ytdGross: r2(cum + c.gross), ytdTax: r2(tax + c.tax) };
}

// בדיקת ניכויי תלוש מתוך הברוטו שלו (אותה לוגיקה כמו באפליקציה)
function verifyFromGross(p, slips, settings) {
  const [y] = p.month.split('-').map(Number); const mo = +p.month.slice(5);
  const par = PARAMS[y]; if (!par) return null;
  const list = slips.filter(x => x.month.startsWith(String(y)) && x.month < p.month && !(x.month === p.month && x.employer_name === p.employer_name));
  const first = list.length ? Math.min(...list.map(x => +x.month.slice(5))) : null;
  const prior = first === null ? { cumIncome: 0, taxPaid: 0, monthIndex: 0 } : { cumIncome: list.reduce((a, x) => a + Number(x.gross || 0), 0), taxPaid: list.reduce((a, x) => a + Number(x.income_tax || 0), 0), monthIndex: mo - first };
  const ins = insurance(Number(p.gross), par);
  const pen = p.insured_salary ? pension(Number(p.insured_salary)) : null;
  const tax = cumulativeTax({ year: y, monthIndex: prior.monthIndex + 1, cumIncome: prior.cumIncome + Number(p.gross), credits: settings.credit_points,
    discountPct: p.month >= '2025-04' ? settings.settlement_discount_pct / 100 : 0, discountCeiling: settings.settlement_ceiling, taxPaidBefore: prior.taxPaid });
  return { gross: Number(p.gross), tax: Math.max(0, tax), bl: ins.bl, health: ins.health, pensionEmp: pen?.emp ?? null, net: null };
}
// השוואה מלאה: ניכויים מול חישוב + (אם יש משמרות) ברוטו/נטו מול השעות באפליקציה
async function compareSlipFull(userId, slip) {
  const [y, m] = slip.month.split('-').map(Number);
  const d = await calcMonthFor(userId, y, m);
  const v = verifyFromGross(slip, d.slips, d.settings);
  const rowsA = v ? comparePayslip(slip, v).filter(r => ['מס הכנסה', 'ביטוח לאומי', 'ביטוח בריאות', 'פנסיה (עובד)'].includes(r.name)) : [];
  const rowsB = d.shifts.length ? comparePayslip(slip, d.c).filter(r => ['ברוטו', 'נטו'].includes(r.name)) : [];
  return { gaps: [...rowsA, ...rowsB].filter(r => r.status === 'diff'), hasShifts: d.shifts.length > 0 };
}

// תבנית הדוח החודשי: מקור יחיד לתצוגה המקדימה באפליקציה ולדוח שנשלח במייל מהשרת.
// פונקציה טהורה בלי תלויות: מקבלת נתונים מחושבים ומחזירה HTML. (מחוברת גם לבניית פונקציות השרת.)
const rEsc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const rMoney = n => '₪' + Number(n || 0).toLocaleString('he-IL', { maximumFractionDigits: 2 });
const rNum = n => Number(n || 0).toLocaleString('he-IL', { maximumFractionDigits: 2 });
const rHm = d => new Date(d).toLocaleTimeString('en-GB', { timeZone: 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit' });
const rDay = s => new Date(s).toLocaleDateString('he-IL', { weekday: 'short', day: '2-digit', month: '2-digit', timeZone: 'Asia/Jerusalem' });
const R_TD = 'padding:6px 8px;border-bottom:1px solid #e5e7eb;';
const rRow = (a, b, o = {}) => `<tr><td style="${R_TD}${o.bold ? 'font-weight:700;' : ''}">${a}</td><td style="${R_TD}text-align:left;${o.bold ? 'font-weight:700;' : ''}${o.color ? 'color:' + o.color + ';' : ''}">${b}</td></tr>`;
const rHead = t => `<tr><td colspan="2" style="padding:10px 8px 4px;background:#f3f4f6;font-weight:700;border-top:2px solid #111827">${t}</td></tr>`;

// d: { y, m, employer, bal, ytdGross, ytdTax, c (תוצאת computeMonth), settings, shifts: [{start_at, end_at, hours}], leave, cmp: [{name, slip, calc, status, diff}] | null }
function buildReportHtml(d) {
  const { y, m, c, shifts, leave, settings, employer, bal, cmp: cmpRows } = d;
  const mn = new Date(Date.UTC(y, m - 1, 15)).toLocaleDateString('he-IL', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  let missing = 0, long = 0;
  const shRows = shifts.map(s => {
    const open = !s.end_at, h = open ? 0 : s.hours, warn = !open && h > 12;
    if (open) missing++; if (warn) long++;
    const bg = open ? 'background:#fee2e2;color:#b91c1c;font-weight:700;' : warn ? 'background:#fef3c7;' : '';
    return `<tr style="${bg}"><td style="padding:5px 8px;border-bottom:1px solid #eee">${rDay(s.start_at)}</td>
      <td style="padding:5px 8px;border-bottom:1px solid #eee;direction:ltr;text-align:center">${rHm(s.start_at)}</td>
      <td style="padding:5px 8px;border-bottom:1px solid #eee;direction:ltr;text-align:center">${open ? '—' : rHm(s.end_at)}</td>
      <td style="padding:5px 8px;border-bottom:1px solid #eee;text-align:left">${open ? 'חסרה יציאה' : rNum(h)}</td></tr>`;
  }).join('');
  const lvRows = leave.map(l => `<tr><td style="padding:5px 8px;border-bottom:1px solid #eee">${new Date(l.day + 'T12:00:00').toLocaleDateString('he-IL', { weekday: 'short', day: '2-digit', month: '2-digit' })}</td><td colspan="3" style="padding:5px 8px;border-bottom:1px solid #eee">${{ vacation: 'חופשה', sick: 'מחלה', holiday: 'חג', reserve: 'מילואים', off: 'יום חופש' }[l.kind] || l.kind}</td></tr>`).join('');
  const alert = (missing || long) ? `<div style="background:#fee2e2;border:1px solid #fca5a5;color:#991b1b;padding:10px;border-radius:8px;margin:12px 0">${missing ? `<b>נמצאו ${missing} משמרות בלי יציאה</b> (מסומנות באדום). יש לתקן באפליקציה, אחרת הן לא נספרות בשכר.` : ''}${long ? `<br>${long} משמרות ארוכות מ-12 שעות (בצהוב), כדאי לבדוק.` : ''}</div>` : '';
  const cmp = cmpRows && cmpRows.length ? `<h3 style="margin:18px 0 6px">השוואה לתלוש שהתקבל</h3><table style="width:100%;border-collapse:collapse">${cmpRows.map(r => rRow(r.name, `${rMoney(r.slip)} מול ${rMoney(r.calc)} ${r.status === 'ok' ? '✓' : '<b style="color:#dc2626">פער ' + rMoney(r.diff) + '</b>'}`)).join('')}</table>` : '';

  const pay = [];
  const L = (name, qty, rate, amt) => `<tr><td style="${R_TD}">${name}</td><td style="${R_TD}text-align:center">${qty}</td><td style="${R_TD}text-align:center">${rate}</td><td style="${R_TD}text-align:left">${rMoney(amt)}</td></tr>`;
  if (c.reg) pay.push(L('שעות רגילות (100%)', rNum(c.reg), rMoney(c.rate), c.payReg));
  if (c.ot125) pay.push(L('שעות נוספות 125%', rNum(c.ot125), rMoney(c.rate * 1.25), c.pay125));
  if (c.ot150) pay.push(L('שעות נוספות / שבת 150%', rNum(c.ot150), rMoney(c.rate * 1.5), c.pay150));
  if (c.ot200) pay.push(L('יום שבתון 200%', rNum(c.ot200), rMoney(c.rate * 2), c.pay200));
  if (c.leaveDays.vacation) pay.push(L('חופשה / חג / מילואים', rNum(c.leaveDays.vacation) + ' ימים', rMoney(c.daily), c.leaveDays.vacation * c.daily));
  if (c.leaveDays.sickPaid) pay.push(L('מחלה', rNum(c.leaveDays.sickPaid) + ' ימים', rMoney(c.daily), c.leaveDays.sickPaid * c.daily));
  for (const e of settings.extras || []) pay.push(L(rEsc(e.name), '', '', Number(e.amount)));
  if (c.travel) pay.push(L('דמי נסיעות' + (c.travelTaxable ? '' : ' (פטורים)'), '', '', c.travel));

  return `<div dir="rtl" style="font-family:Arial,sans-serif;max-width:600px;margin:auto;color:#111827;background:#fff">
  <div style="border:2px solid #111827;border-radius:6px;padding:12px">
    <div style="display:flex;justify-content:space-between"><div><div style="font-size:20px;font-weight:700">תלוש שכר – ${mn}</div><div style="color:#6b7280">הערכה לפי נתוני האפליקציה${employer ? ' · ' + rEsc(employer) : ''}</div></div></div>
    <table style="width:100%;border-collapse:collapse;margin-top:10px">
      ${rRow('ימי עבודה', rNum(c.workDays))}${rRow('סה״כ שעות', rNum(c.hours))}${rRow('שכר שעתי', rMoney(c.rate))}
    </table>
    <table style="width:100%;border-collapse:collapse;margin-top:12px">
      <tr style="background:#f3f4f6;font-weight:700"><td style="${R_TD}">רכיבי שכר</td><td style="${R_TD}text-align:center">כמות</td><td style="${R_TD}text-align:center">תעריף</td><td style="${R_TD}text-align:left">סכום</td></tr>
      ${pay.join('') || `<tr><td colspan="4" style="${R_TD}">אין נתונים</td></tr>`}
      <tr style="font-weight:700"><td colspan="3" style="${R_TD}">סה״כ ברוטו</td><td style="${R_TD}text-align:left">${rMoney(c.gross)}</td></tr>
    </table>
    <table style="width:100%;border-collapse:collapse;margin-top:12px">
      ${rHead('ניכויי חובה')}${rRow('מס הכנסה', rMoney(c.tax))}${rRow('ביטוח לאומי', rMoney(c.bl))}${rRow('ביטוח בריאות', rMoney(c.health))}
      ${rHead('ניכויים אחרים')}${rRow('פנסיה (עובד)', rMoney(c.pensionEmp))}${(settings.extra_deductions || []).map(e => rRow(rEsc(e.name), rMoney(e.amount))).join('')}
      ${rRow('סה״כ ניכויים', rMoney(c.totalDeductions), { bold: true })}
            <tr><td style="padding:12px 8px;font-size:18px;font-weight:700;background:#ecfdf5">שכר נטו לתשלום</td><td style="padding:12px 8px;font-size:20px;font-weight:700;text-align:left;background:#ecfdf5;color:#047857">${rMoney(c.net)}</td></tr>
    </table>
    <table style="width:100%;border-collapse:collapse;margin-top:12px">
      ${rHead('פנסיה והפרשות מעסיק')}${rRow('שכר מבוטח (ללא שעות נוספות)', rMoney(c.insured))}${rRow('פנסיה עובד', rMoney(c.pensionEmp))}${rRow('פנסיה מעסיק', rMoney(c.pensionEmployer))}${rRow('פיצויים', rMoney(c.severance))}${rRow('סה״כ הפקדה', rMoney(c.pensionEmp + c.pensionEmployer + c.severance), { bold: true })}
      ${rHead('מצטבר שנתי (עד החודש, כולל)')}${rRow('ברוטו מצטבר', rMoney(d.ytdGross))}${rRow('מס הכנסה מצטבר', rMoney(d.ytdTax))}
      ${bal ? rHead(`יתרות (לפי תלוש ${rEsc(bal.month)})`) + rRow('ימי חופשה', rNum(bal.vacation_balance)) + rRow('ימי מחלה', rNum(bal.sick_balance)) : ''}
    </table>
  </div>
  ${alert}
  <h3 style="margin:18px 0 6px">פירוט שעות עבודה</h3>
  <table style="width:100%;border-collapse:collapse"><tr style="background:#f3f4f6;font-weight:700"><td style="padding:5px 8px">יום</td><td style="padding:5px 8px;text-align:center">כניסה</td><td style="padding:5px 8px;text-align:center">יציאה</td><td style="padding:5px 8px;text-align:left">שעות</td></tr>
  ${shRows || '<tr><td colspan="4" style="padding:8px">אין משמרות</td></tr>'}${lvRows}
  <tr style="font-weight:700"><td colspan="3" style="padding:8px">סה״כ</td><td style="padding:8px;text-align:left">${rNum(c.hours)}</td></tr></table>
  ${cmp}
  <p style="color:#6b7280;font-size:12px">חישוב אוטומטי להערכה. הסכום הקובע הוא התלוש מהמעסיק.</p></div>`;
}

// ===== פונקציית שרת: דוח חודשי במייל (תלוש מערכת) =====
// @ts-nocheck
const RESEND_KEY = Deno.env.get('RESEND_API_KEY');
const FROM = Deno.env.get('REPORT_FROM') || 'דוח שכר <onboarding@resend.dev>';
const CRON_SECRET = Deno.env.get('CRON_SECRET') || '';

function buildHtml(y, m, d, employer, bal) {
  const mk = `${y}-${String(m).padStart(2, '0')}`;
  const slip = d.slips.filter(p => p.month === mk).pop() || null;
  return buildReportHtml({ y, m, c: d.c, settings: d.settings, leave: d.leave, employer, bal, ytdGross: d.ytdGross, ytdTax: d.ytdTax,
    shifts: d.shifts.map(s => ({ ...s, hours: s.end_at ? shiftHours(s, d.settings.break_minutes) : 0 })),
    cmp: slip ? comparePayslip(slip, d.c) : null });
}

async function reportFor(userId, email, y, m, force) {
  const mk = `${y}-${String(m).padStart(2, '0')}`;
  const d = await calcMonthFor(userId, y, m);
  if (!d.shifts.length && !d.leave.length && !force) return { skipped: 'no data' };
  const latest = [...d.slips].reverse();
  const bal = latest.find(p => p.vacation_balance !== null && p.vacation_balance !== undefined) || null;
  const employer = (latest[0] || {}).employer_name || '';
  const missing = d.shifts.filter(s => !s.end_at).length;
  const html = buildHtml(y, m, d, employer, bal);
  const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM, to: [email], subject: `תלוש שכר ${mk} – נטו ${money(d.c.net)}${missing ? ` · ${missing} משמרות בלי יציאה` : ''}`, html }) });
  return { sent: r.ok, status: r.status, detail: r.ok ? undefined : await r.text(), net: d.c.net, missingExits: missing };
}

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const J = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });
  try {
    const body = await req.json().catch(() => ({}));
    const now = il(new Date());
    // תצוגה מקדימה: המשתמש מבקש מהאפליקציה לשלוח לעצמו את דוח החודש הנוכחי
    if (body.preview) {
      const u = await userFromReq(req); if (!u) return J({ error: 'not signed in' }, 401);
      const s = (await q(`settings?user_id=eq.${u.id}`))[0] || {};
      const [y, m] = body.month ? body.month.split('-').map(Number) : [now.getFullYear(), now.getMonth() + 1];
      return J(await reportFor(u.id, s.report_email || u.email, y, m, true));
    }
    const tomorrow = new Date(now); tomorrow.setDate(now.getDate() + 1);
    const lastDay = tomorrow.getDate() === 1;
    const force = body.force && CRON_SECRET && body.secret === CRON_SECRET;
    if (!lastDay && !force) return J({ skipped: 'not last day of month' });
    const [y, m] = body.month && force ? body.month.split('-').map(Number) : [now.getFullYear(), now.getMonth() + 1];
    const users = await q('settings?select=user_id,report_email&report_email=not.is.null');
    const out = [];
    for (const u of users) if (u.report_email) out.push(await reportFor(u.user_id, u.report_email, y, m, force));
    return J({ month: `${y}-${m}`, results: out });
  } catch (e) { return J({ error: String(e) }, 500); }
});
