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

// ===== התראות פוש (Web Push) =====
import webpush from 'npm:web-push@3.6.7';
webpush.setVapidDetails(Deno.env.get('VAPID_SUBJECT') || 'mailto:ronshushan1@gmail.com', Deno.env.get('VAPID_PUBLIC_KEY') || '', Deno.env.get('VAPID_PRIVATE_KEY') || '');
// שולח התראה לכל המכשירים של המשתמש; מנקה מנויים שפגו
async function sendPush(userId, payload) {
  const subs = await q(`push_subs?user_id=eq.${userId}`);
  let sent = 0;
  for (const s of subs) {
    try { await webpush.sendNotification(s.sub, JSON.stringify(payload), { TTL: 3600 }); sent++; }
    catch (e) { if (e.statusCode === 404 || e.statusCode === 410) await dbWrite('DELETE', `push_subs?id=eq.${s.id}`, undefined, 'return=minimal').catch(() => {}); else console.error('push', e.statusCode, e.body); }
  }
  return { devices: subs.length, sent };
}
// שולח פעם אחת בלבד לכל מפתח (למשל "in-2026-10-11")
async function sendPushOnce(userId, key, payload) {
  const ex = await q(`notif_log?user_id=eq.${userId}&key=eq.${encodeURIComponent(key)}`);
  if (ex.length) return { skipped: 'already sent' };
  const r = await sendPush(userId, payload);
  if (r.sent) await dbWrite('POST', 'notif_log', { user_id: userId, key }, 'return=minimal');
  return r;
}

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

// ===== פונקציית שרת: קליטת תלוש מהמייל + השוואה + התראה =====
// @ts-nocheck
const AKEY = Deno.env.get('ANTHROPIC_API_KEY');
const INGEST_SECRET = Deno.env.get('INGEST_SECRET') || '';
const PROMPT = `זהו קובץ שאמור להיות תלוש שכר ישראלי. אם זה לא תלוש שכר החזר {"not_payslip":true}. אחרת חלץ את הערכים והחזר JSON בלבד (בלי טקסט נוסף) במבנה:
{"month":"YYYY-MM","employer":"שם המעסיק","gross":number,"net":number,"income_tax":number,"national_insurance":number,"health":number,"pension_emp":number|null,"pension_employer":number|null,"severance":number|null,"insured_salary":number|null,"hours":number|null,"workdays":number|null,"vacation_balance":number|null,"sick_balance":number|null}
כללים: gross = סה"כ תשלומים; net = שכר נטו; income_tax = ניכוי מס הכנסה החודשי (0 אם אין; שלילי אם זיכוי); pension_emp = ניכוי פנסיה/קופת גמל של העובד; insured_salary = שכר מבוטח לפנסיה; vacation_balance ו-sick_balance = "יתרה חדשה" בימים בחשבון חופשה ומחלה. אם ערך לא מופיע החזר null. מספרים בלי פסיקים ובלי סימן ₪.`;


// בחירת דגם: ANTHROPIC_MODEL אם הוגדר, אחרת הדגם הכי חדש מסוג sonnet שהחשבון רואה
let _model = Deno.env.get('ANTHROPIC_MODEL') || '';
async function pickModel(force) {
  if (_model && !force) return _model;
  const r = await fetch('https://api.anthropic.com/v1/models?limit=100', { headers: { 'x-api-key': AKEY, 'anthropic-version': '2023-06-01' } });
  const j = await r.json();
  const ids = (j.data || []).map(m => m.id);
  _model = ids.find(i => /sonnet/.test(i)) || ids.find(i => /haiku/.test(i)) || ids[0] || 'claude-sonnet-4-5';
  return _model;
}
async function callClaude(content) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const model = await pickModel(attempt > 0);
    const r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST',
      headers: { 'x-api-key': AKEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model, max_tokens: 800, messages: [{ role: 'user', content }] }) });
    const j = await r.json();
    if (r.ok) return j.content.map(c => c.text || '').join('');
    if (attempt === 0 && (r.status === 404 || j.error?.type === 'not_found_error')) { _model = ''; continue; }
    throw new Error(j.error?.message || 'anthropic error');
  }
}

async function readSlip(base64, mediaType) {
  const block = mediaType === 'application/pdf'
    ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } }
    : { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } };
  const txt = await callClaude([block, { type: 'text', text: PROMPT }]);
  return JSON.parse(txt.slice(txt.indexOf('{'), txt.lastIndexOf('}') + 1));
}
const normEmployer = e => /סמארט/.test(e || '') ? 'סמארטפיקס' : /ביתך/.test(e || '') ? 'בנה ביתך גולן' : /השוק/.test(e || '') ? 'מחסני השוק' : (e || '');
const empKey = e => /סמארט/.test(e) ? 'smart' : /ביתך/.test(e) ? 'bnei' : /השוק/.test(e) ? 'mahsanei' : 'other';


const mailOf = s => ((s || '').match(/[\w.+-]+@[\w-]+(\.[\w-]+)+/) || [''])[0].toLowerCase();
async function employerMap() {   // מייל מעסיק (מההגדרות באפליקציה) -> משתמש
  try {
    const rows = await q('settings?select=user_id,profile');
    const m = {}; for (const r of rows) { const e = mailOf(r.profile?.employer_email); if (e) m[e] = r.user_id; }
    return m;
  } catch (e) { return {}; }
}
async function ownerId() {
  const r = await fetch(`${SB_URL}/auth/v1/admin/users?per_page=1`, { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } });
  const j = await r.json(); const u = (j.users || [])[0]; if (!u) throw new Error('no user'); return u.id;
}

Deno.serve(async (req) => {
  const J = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { 'Content-Type': 'application/json' } });
  try {
    const b = await req.json();
    if (!INGEST_SECRET || b.secret !== INGEST_SECRET) return J({ error: 'forbidden' }, 403);
    if (b.action === 'config') return J({ senders: Object.keys(await employerMap()) });
    if (!b.base64) return J({ error: 'missing file' }, 400);
    const mediaType = b.mediaType || 'application/pdf';
    const data = await readSlip(b.base64, mediaType);
    if (data.not_payslip || !/^\d{4}-\d{2}$/.test(data.month || '') || !data.gross) return J({ skipped: 'not a payslip' });
    const emap = await employerMap(); const uid = emap[mailOf(b.from)] || await ownerId();
    const employer = normEmployer(data.employer);
    const prev = (await q(`payslips?user_id=eq.${uid}&month=eq.${data.month}&employer_name=eq.${encodeURIComponent(employer)}`))[0];
    if (prev && Number(prev.gross) === Number(data.gross) && Number(prev.net) === Number(data.net)) return J({ duplicate: true, month: data.month });

    const row = { user_id: uid, month: data.month, employer_name: employer, gross: data.gross, net: data.net, income_tax: data.income_tax ?? 0, national_insurance: data.national_insurance, health: data.health,
      pension_emp: data.pension_emp ?? null, pension_employer: data.pension_employer ?? null, severance: data.severance ?? null, insured_salary: data.insured_salary ?? null,
      hours: data.hours ?? null, workdays: data.workdays ?? null, vacation_balance: data.vacation_balance ?? null, sick_balance: data.sick_balance ?? null, is_corrected: !!prev };
    const saved = (await dbWrite('POST', 'payslips?on_conflict=user_id,month,employer_name', row, 'resolution=merge-duplicates,return=representation'))[0];

    // שמירת הקובץ המקורי
    const ext = mediaType === 'application/pdf' ? 'pdf' : (mediaType.split('/')[1] || 'jpg').replace('jpeg', 'jpg');
    const path = `${uid}/${data.month}_${empKey(employer)}.${ext}`;
    const bytes = Uint8Array.from(atob(b.base64), c => c.charCodeAt(0));
    const up = await fetch(`${SB_URL}/storage/v1/object/payslips/${path}`, { method: 'POST', headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': mediaType, 'x-upsert': 'true' }, body: bytes });
    if (up.ok) await dbWrite('PATCH', `payslips?id=eq.${saved.id}`, { file_path: path }, 'return=minimal');

    // השוואה והתראה
    const cmp = await compareSlipFull(uid, saved);
    const [yy, mm] = data.month.split('-');
    const gapNames = cmp.gaps.map(g => g.name).join(', ');
    const bodyTxt = `נטו ${money(data.net)} · ברוטו ${money(data.gross)}\n` + (cmp.gaps.length ? `⚠️ שים לב יש פער בין התלושים (${gapNames})` : cmp.hasShifts ? 'התלוש תואם לחישוב שלנו ✓' : 'ניכויי התלוש תקינים ✓ (אין שעות באפליקציה להשוואה)');
    const push = await sendPush(uid, { title: 'יש תלוש חדש 🥳', body: 'לחץ כדי לצפות' + (cmp.gaps.length ? `\n⚠️ שים לב יש פער בין התלושים (${gapNames})` : ''), tag: 'slip', url: './?remind=slip' });
    return J({ ok: true, month: data.month, employer, gaps: cmp.gaps, push, fileSaved: up.ok });
  } catch (e) { return J({ error: String(e) }, 500); }
});
