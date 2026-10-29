// תבנית הדוח החודשי: מקור יחיד לתצוגה המקדימה באפליקציה ולדוח שנשלח במייל מהשרת.
// פונקציה טהורה בלי תלויות: מקבלת נתונים מחושבים ומחזירה HTML. (מחוברת גם לבניית פונקציות השרת.)
const rEsc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const rMoney = n => '₪' + Number(n || 0).toLocaleString('he-IL', { maximumFractionDigits: 2 });
const rNum = n => Number(n || 0).toLocaleString('he-IL', { maximumFractionDigits: 2 });
const rHm = d => new Date(d).toLocaleTimeString('en-GB', { timeZone: 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit' });
const rDay = s => new Date(s).toLocaleDateString('he-IL', { weekday: 'short', day: '2-digit', month: '2-digit', timeZone: 'Asia/Jerusalem' });
const R_TD = 'padding:6px 8px;border-bottom:1px solid #e5e7eb;';
// צבעים: ירוק=חג/נטו, כחול=חופשה/שכר, כתום=מחלה/אזהרה, סגול=מילואים/פנסיה, אדום=חסר/ניכוי, אפור=לידיעה
const R_KIND = { holiday: ['חג', '#dcfce7', '#166534'], vacation: ['חופשה', '#dbeafe', '#1e40af'], sick: ['מחלה', '#fef3c7', '#92400e'], reserve: ['מילואים', '#ede9fe', '#5b21b6'], off: ['יום חופש', '#f3f4f6', '#374151'] };
const rRow = (a, b, o = {}) => `<tr><td style="${R_TD}${o.bold ? 'font-weight:700;' : ''}">${a}</td><td style="${R_TD}text-align:left;${o.bold ? 'font-weight:700;' : ''}${o.color ? 'color:' + o.color + ';' : ''}">${b}</td></tr>`;
const rHead = (t, bg = '#f3f4f6', fg = '#111827') => `<tr><td colspan="2" style="padding:10px 8px 4px;background:${bg};color:${fg};font-weight:700;border-top:2px solid ${fg}">${t}</td></tr>`;

// d: { y, m, employer, bal, ytdGross, ytdTax, c (תוצאת computeMonth), settings, shifts: [{start_at, end_at, hours}], leave, cmp: [{name, slip, calc, status, diff}] | null }
export function buildReportHtml(d) {
  const { y, m, c, shifts, leave, settings, employer, bal, cmp: cmpRows } = d;
  const mn = new Date(Date.UTC(y, m - 1, 15)).toLocaleDateString('he-IL', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const sd = Math.round(Number(settings?.profile?.month_start_day)) || 1, pr = sd > 1 ? (() => { const a = new Date(Date.UTC(y, m - 2, sd)), b = new Date(Date.UTC(y, m - 1, sd - 1)); return `${a.getUTCDate()}.${a.getUTCMonth() + 1} – ${b.getUTCDate()}.${b.getUTCMonth() + 1}`; })() : '';
  let missing = 0, long = 0;
  const jDay = iso => new Date(iso).toLocaleDateString('sv-SE', { timeZone: 'Asia/Jerusalem' });
  const holWork = new Set(leave.filter(l => l.kind === 'holiday' && shifts.some(s => jDay(s.start_at) === l.day)).map(l => l.day));
  const shRows = shifts.map(s => {
    const open = !s.end_at, h = open ? 0 : s.hours, warn = !open && h > 12;
    if (open) missing++; if (warn) long++;
    const dow = new Date(new Date(s.start_at).toLocaleString('en-US', { timeZone: 'Asia/Jerusalem' })).getDay(), rest = dow === 5 || dow === 6;
    const hw = holWork.has(jDay(s.start_at)), hn = hw && d.holName ? d.holName(jDay(s.start_at)) : '';
    const bg = hw ? 'background:#dcfce7;color:#166534;font-weight:600;' : open ? 'background:#fee2e2;color:#b91c1c;font-weight:700;' : warn ? 'background:#fef3c7;color:#92400e;' : rest ? 'background:#ede9fe;color:#5b21b6;' : '';
    return `<tr style="${bg}"><td style="padding:5px 8px;border-bottom:1px solid #eee${hw ? ';border-inline-start:4px solid #166534' : ''}">${rDay(s.start_at)}${hw ? `<br><small>חג${hn ? ' · ' + hn : ''}</small>` : ''}</td>
      <td style="padding:5px 8px;border-bottom:1px solid #eee;direction:ltr;text-align:center">${rHm(s.start_at)}</td>
      <td style="padding:5px 8px;border-bottom:1px solid #eee;direction:ltr;text-align:center">${open ? '—' : rHm(s.end_at)}</td>
      <td style="padding:5px 8px;border-bottom:1px solid #eee;text-align:left">${open ? 'חסרה יציאה' : rNum(h)}</td></tr>`;
  }).join('');
  const lvRows = leave.filter(l => !(l.kind === 'holiday' && holWork.has(l.day))).map(l => { const [nm, bg, fg] = R_KIND[l.kind] || ['', '#f3f4f6', '#374151']; return `<tr style="background:${bg};color:${fg};font-weight:600"><td style="padding:5px 8px;border-bottom:1px solid #eee;border-inline-start:4px solid ${fg}">${new Date(l.day + 'T12:00:00').toLocaleDateString('he-IL', { weekday: 'short', day: '2-digit', month: '2-digit' })}</td><td colspan="3" style="padding:5px 8px;border-bottom:1px solid #eee">${nm || l.kind}</td></tr>`; }).join('');
  const alert = (missing || long) ? `<div style="background:#fee2e2;border:1px solid #fca5a5;color:#991b1b;padding:10px;border-radius:8px;margin:12px 0">${missing ? `<b>נמצאו ${missing} משמרות בלי יציאה</b> (מסומנות באדום). יש לתקן באפליקציה, אחרת הן לא נספרות בשכר.` : ''}${long ? `<br>${long} משמרות ארוכות מ-12 שעות (בצהוב), כדאי לבדוק.` : ''}</div>` : '';
  const cmp = cmpRows && cmpRows.length ? `<h3 style="margin:18px 0 6px">השוואה לתלוש שהתקבל</h3><table style="width:100%;border-collapse:collapse">${cmpRows.map(r => rRow(r.name, `${rMoney(r.slip)} מול ${rMoney(r.calc)} ${r.status === 'ok' ? '<b style="color:#15803d">✓</b>' : '<b style="color:#dc2626">פער ' + rMoney(r.diff) + '</b>'}`)).join('')}</table>` : '';

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
    <div style="display:flex;justify-content:space-between"><div><div style="font-size:20px;font-weight:700">תלוש שכר – ${mn}</div>${pr ? `<div style="color:#6b7280;direction:ltr;text-align:right">${pr}</div>` : ''}<div style="color:#6b7280">הערכה לפי נתוני האפליקציה${employer ? ' · ' + rEsc(employer) : ''}</div></div></div>
    <table style="width:100%;border-collapse:collapse;margin-top:10px">
      ${rRow('ימי עבודה', rNum(c.workDays))}${rRow('סה״כ שעות', rNum(c.hours))}${rRow('שכר שעתי', rMoney(c.rate))}
    </table>
    <table style="width:100%;border-collapse:collapse;margin-top:12px">
      <tr style="background:#dbeafe;color:#1e40af;font-weight:700"><td style="${R_TD}">רכיבי שכר</td><td style="${R_TD}text-align:center">כמות</td><td style="${R_TD}text-align:center">תעריף</td><td style="${R_TD}text-align:left">סכום</td></tr>
      ${pay.join('') || `<tr><td colspan="4" style="${R_TD}">אין נתונים</td></tr>`}
      <tr style="font-weight:700;background:#eff6ff;color:#1e3a8a"><td colspan="3" style="${R_TD}">סה״כ ברוטו</td><td style="${R_TD}text-align:left">${rMoney(c.gross)}</td></tr>
    </table>
    <table style="width:100%;border-collapse:collapse;margin-top:12px">
      ${rHead('ניכויי חובה', '#fee2e2', '#991b1b')}${rRow('מס הכנסה', rMoney(c.tax))}${rRow('ביטוח לאומי', rMoney(c.bl))}${rRow('ביטוח בריאות', rMoney(c.health))}
      ${rHead('ניכויים אחרים', '#fee2e2', '#991b1b')}${rRow('פנסיה (עובד)', rMoney(c.pensionEmp))}${(settings.extra_deductions || []).map(e => rRow(rEsc(e.name), rMoney(e.amount))).join('')}
      ${rRow('סה״כ ניכויים', rMoney(c.totalDeductions), { bold: true })}
            <tr><td style="padding:12px 8px;font-size:18px;font-weight:700;background:#ecfdf5">שכר נטו לתשלום</td><td style="padding:12px 8px;font-size:20px;font-weight:700;text-align:left;background:#ecfdf5;color:#047857">${rMoney(c.net)}</td></tr>
    </table>
    <table style="width:100%;border-collapse:collapse;margin-top:12px">
      ${rHead('פנסיה והפרשות מעסיק', '#ede9fe', '#5b21b6')}${rRow('שכר מבוטח (ללא שעות נוספות)', rMoney(c.insured))}${rRow('פנסיה עובד', rMoney(c.pensionEmp))}${rRow('פנסיה מעסיק', rMoney(c.pensionEmployer))}${rRow('פיצויים', rMoney(c.severance))}${rRow('סה״כ הפקדה', rMoney(c.pensionEmp + c.pensionEmployer + c.severance), { bold: true })}
      ${rHead('מצטבר שנתי (עד החודש, כולל)', '#dbeafe', '#1e40af')}${rRow('ברוטו מצטבר', rMoney(d.ytdGross))}${rRow('מס הכנסה מצטבר', rMoney(d.ytdTax))}
      ${bal ? rHead(`יתרות (לפי תלוש ${rEsc(bal.month)})`, '#fef3c7', '#92400e') + rRow('ימי חופשה', rNum(bal.vacation_balance)) + rRow('ימי מחלה', rNum(bal.sick_balance)) : ''}
    </table>
  </div>
  ${alert}
  <h3 style="margin:18px 0 6px">פירוט שעות עבודה</h3>
  <table style="width:100%;border-collapse:collapse"><tr style="background:#dbeafe;color:#1e40af;font-weight:700"><td style="padding:5px 8px">יום</td><td style="padding:5px 8px;text-align:center">כניסה</td><td style="padding:5px 8px;text-align:center">יציאה</td><td style="padding:5px 8px;text-align:left">שעות</td></tr>
  ${shRows || '<tr><td colspan="4" style="padding:8px">אין משמרות</td></tr>'}${lvRows}
  <tr style="font-weight:700"><td colspan="3" style="padding:8px">סה״כ</td><td style="padding:8px;text-align:left">${rNum(c.hours)}</td></tr></table>
  ${cmp}
  <p style="color:#6b7280;font-size:12px">חישוב אוטומטי להערכה. הסכום הקובע הוא התלוש מהמעסיק.</p></div>`;
}
