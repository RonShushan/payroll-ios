// אשף התחלה: סטטוס אישי ונקודות זיכוי, יישוב, שכר ומעסיק, יתרות, ותלוש למילוי אוטומטי.
import { store } from '../data/store.js';
import { isLocal } from '../data/mode.js';
import { BASE_CREDIT, childCredit, SINGLE_PARENT } from '../lib/taxdata.js';
import { SETTLEMENTS, findSettlement } from '../lib/settlements.js';
import { ALL_PLACES } from '../lib/localities.js';
import { ymd } from '../lib/payroll.js';
import { field, checkRow, infoRow, segmented, onSegmented, monthStartItem, monthStartNote } from '../ui.js';

const FLAG = 'payroll-onboarded';
const root = () => document.getElementById('auth-root');
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nf = n => Number(n).toLocaleString('he-IL', { maximumFractionDigits: 2 });
// הדגל נשמר לכל חשבון בנפרד, כדי שמשתמש חדש באותו מכשיר (למשל אחרי מחיקת חשבון) יקבל את האשף
let UID = 'guest';
export const setOnboardUser = id => { UID = id || 'guest'; };
const key = () => `${FLAG}:${UID}`;
const flagSet = () => { try { return localStorage.getItem(key()) === '1'; } catch { return false; } };
const setFlag = () => { try { localStorage.setItem(key(), '1'); } catch {} };
export const clearOnboardFlag = () => { try { localStorage.removeItem(key()); } catch {} };

// מי צריך לראות את האשף: משתמש חדש בלי נתונים ובלי דילוג קודם
export const shouldOnboard = (settings, rates, slips) =>
  !settings?.profile?.onboarded && !flagSet() && !(rates?.length) && !(slips?.length);

const STEPS = ['תלוש', 'סטטוס אישי', 'יישוב', 'שכר ומעסיק', 'יתרות', 'סיכום'];
let W, onDone;

const fresh = settings => ({
  step: 0, slip: null, slipMsg: '', msd: Number(settings?.profile?.month_start_day) || 1,
  gender: settings?.profile?.gender || 'm', single: !!settings?.profile?.single_parent,
  kids: [...(settings?.profile?.kids || [])], extra: 0,
  credit: settings?.credit_points ?? '',
  tier: -1, disc: settings?.settlement_discount_pct || 0, ceil: settings?.settlement_ceiling || 0,
  employer: settings?.profile?.employer_name || '', rate: '', rateFrom: ymd(new Date(new Date().getFullYear(), new Date().getMonth(), 1)),
  pe: settings?.pension_emp_pct ?? 6, pr: settings?.pension_employer_pct ?? 6.5, sv: settings?.severance_pct ?? 8.33,
  vac: '', sick: '', asOf: ymd(new Date()),
  trv: !!settings?.travel_enabled, trvd: settings?.travel_per_day || '', brk: settings?.break_minutes ?? 0, brkPaid: !!settings?.break_paid,
});

export function runWizard({ settings, done }) {
  W = fresh(settings); onDone = done; W.base = settings;
  paint();
}

/* ---------- חישוב עזר ---------- */
const kidRecv = () => W.gender === 'f';                          // הנחה: האם מקבלת קצבה; ניתן לשנות ב"עזרה בחישוב"
const autoCredit = () => {
  let t = BASE_CREDIT[W.gender] + (W.single ? SINGLE_PARENT : 0) + Number(W.extra || 0);
  const parts = [`בסיס ${BASE_CREDIT[W.gender]}`];
  if (W.single) parts.push(`הורה יחיד ${SINGLE_PARENT}`);
  if (Number(W.extra)) parts.push(`נוספות ${W.extra}`);
  for (const y of W.kids) { const c = childCredit(Number(y), W.recv ?? kidRecv()); t += c; parts.push(`ילד ${y}: ${c}`); }
  return { total: Math.round(t * 100) / 100, parts };
};

/* ---------- מסגרת ---------- */
function frame(inner, { back = true, next = 'המשך', nextId = 'w-next', skip = false } = {}) {
  const r = root(); r.hidden = false;
  r.innerHTML = `<div class="auth-scroll"><div class="auth-wrap wiz">
    <div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="${STEPS.length}" aria-valuenow="${W.step + 1}"><i style="width:${((W.step + 1) / STEPS.length) * 100}%"></i></div>
    <p class="auth-note" style="margin:8px 0 0">שלב ${W.step + 1} מתוך ${STEPS.length} · ${STEPS[W.step]}</p>
    ${inner}
    <p class="auth-err" id="auth-err"></p>
    <button type="button" id="${nextId}" class="btn-block ">${next}</button>
    ${back && W.step > 0 ? '<button type="button" id="w-back" class="btn-block plain">חזרה</button>' : ''}
    ${skip ? '<button type="button" id="w-skip" class="btn-block plain">דלג על האשף</button>' : ''}
  </div></div>`;
  const n = $(nextId); if (n) n.onclick = go;
  const b = $('w-back'); if (b) b.onclick = () => { W.step--; paint(); };
  const s = $('w-skip'); if (s) s.onclick = () => { setFlag(); close(); };
}
const setErr = m => { const e = $('auth-err'); if (!e) return; e.textContent = m || ''; if (m) { e.classList.remove('shake'); void e.offsetWidth; e.classList.add('shake'); } };
function close() { const r = root(); r.hidden = true; r.innerHTML = ''; onDone && onDone(); }

// קישור שדה Ionic למפתח במצב
function bind(id, key, num = true) {
  const el = $(id); if (!el) return;
  el.addEventListener('input', e => { const v = e.target.value ?? ''; W[key] = num ? (v === '' ? '' : Number(v)) : v; });
}


/* ---------- שלבים ---------- */
function paint() {
  const fn = [s0, s1, s2, s3, s4, s5][W.step]; fn();
}

function s0() {
  const local = isLocal();
  frame(`<h1 class="auth-title sm">בוא נכיר</h1>
    <p class="auth-sub">כמה שאלות קצרות כדי שהחישוב יהיה מדויק. אפשר לדלג על כל שלב ולמלא אחר כך בהגדרות.</p>
    ${local
      ? `<div class="list auth-list"><div class="item">קריאת תלוש אוטומטית: אפשר להירשם בהגדרות, ובינתיים למלא ידנית.</div></div>
         <button type="button" class="btn-block sec" disabled>העלאת תלוש</button>
         <p class="auth-note">זמין רק למשתמש רשום</p>`
      : `<div class="list auth-list"><div class="item">יש לך תלוש שכר אחרון? העלה PDF או תמונה, והאפליקציה תמלא בשבילך שכר שעתי, נקודות זיכוי, פנסיה ויתרות.</div></div>
         <input type="file" id="w-file" accept="application/pdf,image/*" hidden>
         <button type="button" id="w-pick" class="btn-block sec">העלאת תלוש</button>
         <p class="auth-note" id="w-slipmsg">${esc(W.slipMsg)}</p>`}`,
    { next: W.slip ? 'המשך' : (local ? 'התחל' : 'אין לי תלוש כרגע'), skip: true });
  const pick = $('w-pick'), f = $('w-file');
  if (pick) pick.onclick = () => f.click();
  if (f) f.onchange = readSlip;
}

async function readSlip(e) {
  const f = e.target.files[0]; if (!f) return;
  const msg = $('w-slipmsg'); msg.textContent = 'קורא את התלוש... זה לוקח כמה שניות.';
  try {
    const b64 = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.onerror = rej; r.readAsDataURL(f); });
    const d = await store.readPayslipFile(b64, f.type || 'application/pdf');
    W.slip = d;
    const got = [];
    if (d.employer) { W.employer = d.employer; got.push('מעסיק'); }
    if (d.hourly_rate) { W.rate = d.hourly_rate; got.push('שכר שעתי'); }
    if (d.credit_points) { W.credit = d.credit_points; got.push('נקודות זיכוי'); }
    if (d.pension_emp_pct != null) { W.pe = d.pension_emp_pct; got.push('פנסיה עובד'); }
    if (d.pension_employer_pct != null) { W.pr = d.pension_employer_pct; got.push('פנסיה מעסיק'); }
    if (d.severance_pct != null) { W.sv = d.severance_pct; got.push('פיצויים'); }
    if (d.vacation_balance != null) { W.vac = d.vacation_balance; got.push('יתרת חופשה'); }
    if (d.sick_balance != null) { W.sick = d.sick_balance; got.push('יתרת מחלה'); }
    if (d.month) W.asOf = d.month + '-' + '28';
    W.slipMsg = got.length ? 'נקרא ✓ מילאתי: ' + got.join(', ') + '. תוכל לבדוק ולתקן בשלבים הבאים.' : 'התלוש נקרא, אבל לא זיהיתי שדות שימושיים. מלא ידנית.';
    s0();
  } catch (err) { msg.textContent = 'לא הצלחתי לקרוא: ' + err.message; }
}

function s1() {
  const a = autoCredit();
  frame(`<h1 class="auth-title sm">סטטוס אישי</h1>
    <p class="auth-sub">קובע את נקודות הזיכוי, שמפחיתות את המס.</p>
    ${segmented('w-gender', W.gender, [['m', 'גבר'], ['f', 'אישה']])}
    <div class="list auth-list">
      ${field('w-credit', 'נקודות זיכוי (הערך שלך)', W.credit, 'type="number" inputmode="decimal" step="0.25" dir="ltr"')}
    </div>
    <p class="auth-note">${W.slip?.credit_points ? 'הערך נקרא מהתלוש.' : 'הערך הנכון מופיע בתלוש ובטופס 101. אם אינך בטוח, השתמש בחישוב שלמטה.'}</p>
    <details class="acc" ${W.acc ? 'open' : ''}><summary>עזרה בחישוב (אומדן)</summary>
      <div class="acc-body">
        ${checkRow('w-single', 'הורה יחיד', W.single)}
        ${checkRow('w-recv', 'אני ההורה שמקבל את קצבת הילדים', W.recv ?? kidRecv())}
        ${field('w-extra', 'נקודות נוספות (עולה, חייל משוחרר, תואר)', W.extra, 'type="number" step="0.25" dir="ltr"')}
        <p class="auth-note" style="text-align:start">שנות לידה של ילדים עד גיל 18:</p>
        <div id="w-kids">${W.kids.map((y, i) => `<button type="button" class="chip" data-i="${i}" aria-label="הסר ילד שנולד ב-${y}">${y} ✕</button>`).join('') || '<span class="auth-note">אין ילדים</span>'}</div>
        <div class="item add"><div><label for="w-kid">שנת לידה</label><input id="w-kid" type="number" inputmode="numeric" placeholder="2019" dir="ltr"></div><button type="button" class="btn-inline" id="w-addkid">הוסף</button></div>
        <p class="auth-note" id="w-calc" style="text-align:start">${a.total} נקודות (${esc(a.parts.join(', '))})</p>
        <button type="button" id="w-apply" class="btn-block sm">השתמש בחישוב: ${a.total}</button>
        <p class="auth-note" style="text-align:start">הטבלה משתנה משנה לשנה ויש הבדלים בין הורים. זו הערכה בלבד.</p>
      </div></details>`);
  bind('w-credit', 'credit'); bind('w-extra', 'extra');
  document.querySelector('details.acc').addEventListener('toggle', e => { W.acc = e.target.open; });
  onSegmented('w-gender', v => { W.gender = v; W.recv = undefined; s1(); });
  $('w-single').addEventListener('change', e => { W.single = e.target.checked; s1(); });
  $('w-recv').addEventListener('change', e => { W.recv = e.target.checked; s1(); });
  $('w-extra').addEventListener('change', () => s1());
  $('w-addkid').onclick = () => { const y = Number($('w-kid').value), cy = new Date().getFullYear(); if (y >= cy - 18 && y <= cy) { W.kids.push(y); s1(); } else setErr(`שנת לידה בין ${cy - 18} ל-${cy}`); };
  document.querySelectorAll('#w-kids .chip').forEach(c => c.onclick = () => { W.kids.splice(Number(c.dataset.i), 1); s1(); });
  $('w-apply').onclick = () => { W.credit = autoCredit().total; s1(); };
}

function s2() {
  const dl = ALL_PLACES.map(n => `<option value="${esc(n)}"></option>`).join('');
  const on = !!(W.city || W.disc > 0);
  frame(`<h1 class="auth-title sm">יישוב מזכה</h1>
    <p class="auth-sub">תושבי יישובים מסוימים מקבלים הנחה במס, באחוז מההכנסה עד תקרה שנתית.</p>
    ${segmented('w-sett', on ? 'yes' : 'no', [['no', 'לא גר ביישוב מזכה'], ['yes', 'גר ביישוב מזכה']])}
    <div id="w-settbox" ${on ? '' : 'hidden'}>
      <div class="list auth-list">
        ${field('w-city', 'יישוב (הקלד או בחר)', W.city || '', 'placeholder="התחל להקליד שם" list="w-cities" autocomplete="off"')}
        ${field('w-disc', 'אחוז הנחה', W.disc || '', 'type="number" step="0.5" dir="ltr"')}
        ${field('w-ceil', 'תקרת הכנסה שנתית (₪)', W.ceil || '', 'type="number" dir="ltr"')}
      </div>
      <p class="auth-note" id="w-cityst">הרשימה היא של רשות המסים לשנת 2026. אפשר גם להזין אחוז ותקרה ידנית.</p>
    </div><datalist id="w-cities">${dl}</datalist>`);
  bind('w-disc', 'disc'); bind('w-ceil', 'ceil');
  onSegmented('w-sett', v => { const y = v === 'yes'; $('w-sett').querySelectorAll('button').forEach(b => { const on = b.dataset.v === v; b.classList.toggle('on', on); b.setAttribute('aria-checked', on); }); $('w-settbox').hidden = !y; if (!y) { W.city = ''; W.disc = 0; W.ceil = 0; } });
  const city = $('w-city');
  city.addEventListener('input', e => {
    const v = String(e.target.value || '').trim(); W.city = v; const r = findSettlement(v);
    const st = $('w-cityst');
    st.textContent = !v ? 'הרשימה היא של רשות המסים לשנת 2026.' : r ? `${r[0]}: הנחה ${r[1]}% עד ${r[2].toLocaleString('he-IL')} ₪ בשנה ✓` : 'היישוב שנבחר לא זכאי';
    st.style.color = v && !r ? 'var(--bad)' : ''; st.style.fontWeight = v && !r ? '600' : '';
    if (r) { W.disc = r[1]; W.ceil = r[2]; $('w-disc').value = r[1]; $('w-ceil').value = r[2]; } else if (v) { W.disc = 0; $('w-disc').value = 0; }
  });
}

function s3() {
  frame(`<h1 class="auth-title sm">שכר ומעסיק</h1>
    <div class="list auth-list">
      ${field('w-emp', 'שם המעסיק', W.employer, '')}
      ${monthStartItem('w-msd', W.msd)}
      ${field('w-rate', 'שכר שעתי ברוטו (₪)', W.rate, 'type="number" inputmode="decimal" step="0.01" dir="ltr"')}
      ${field('w-from', 'תקף מתאריך', W.rateFrom, 'type="date" dir="ltr"')}
      ${field('w-pe', 'פנסיה עובד (%)', W.pe, 'type="number" step="0.01" dir="ltr"')}
      ${field('w-pr', 'פנסיה מעסיק (%)', W.pr, 'type="number" step="0.01" dir="ltr"')}
      ${field('w-sv', 'פיצויים (%)', W.sv, 'type="number" step="0.01" dir="ltr"')}
      ${field('w-brk', 'הפסקה קבועה בכל משמרת (דקות)', W.brk, 'type="number" dir="ltr"')}
      ${checkRow('w-brkpaid', 'ההפסקה משולמת', W.brkPaid)}
      ${checkRow('w-trv', 'משולמים לי דמי נסיעות', W.trv)}
      <div id="w-trvbox" ${W.trv ? '' : 'hidden'}>${field('w-trvd', 'סכום ליום עבודה (₪)', W.trvd, 'type="number" step="0.01" dir="ltr"')}</div>
    </div><p class="auth-note" id="w-msdnote">${monthStartNote(W.msd)}</p><p class="auth-note">${W.slip ? 'הערכים נקראו מהתלוש. בדוק שהם נכונים.' : 'אפשר להשאיר ריק ולמלא אחר כך בהגדרות.'}</p>`);
  bind('w-emp', 'employer', false); bind('w-rate', 'rate'); bind('w-from', 'rateFrom', false); bind('w-pe', 'pe'); bind('w-pr', 'pr'); bind('w-sv', 'sv'); bind('w-brk', 'brk'); bind('w-trvd', 'trvd');
  $('w-msd').addEventListener('change', e => { W.msd = Number(e.target.value) || 1; $('w-msdnote').textContent = monthStartNote(W.msd); });
  $('w-brkpaid').addEventListener('change', e => { W.brkPaid = e.target.checked; });
  $('w-trv').addEventListener('change', e => { W.trv = e.target.checked; $('w-trvbox').hidden = !e.target.checked; });
}

function s4() {
  frame(`<h1 class="auth-title sm">יתרות חופשה ומחלה</h1>
    <p class="auth-sub">כמה ימים יש לך כרגע, כדי שהמעקב יתחיל מהמספר הנכון.</p>
    <div class="list auth-list">
      ${field('w-vac', 'יתרת חופשה (ימים)', W.vac, 'type="number" step="0.01" dir="ltr"')}
      ${field('w-sick', 'יתרת מחלה (ימים)', W.sick, 'type="number" step="0.01" dir="ltr"')}
      ${field('w-asof', 'נכון לתאריך', W.asOf, 'type="date" dir="ltr"')}
    </div><p class="auth-note">${W.slip && (W.vac !== '' || W.sick !== '') ? 'הנתונים נקראו מהתלוש.' : 'היתרה מופיעה בתלוש תחת "יתרה חדשה". אפשר לדלג.'}</p>`);
  bind('w-vac', 'vac'); bind('w-sick', 'sick'); bind('w-asof', 'asOf', false);
}

function s5() {
  const row = infoRow;
  frame(`<h1 class="auth-title sm">הכול מוכן</h1><p class="auth-sub">בדוק ולחץ סיום. הכול ניתן לשינוי בהגדרות.</p>
    <div class="list auth-list">
      ${row('מעסיק', esc(W.employer) || '—')}${Number(W.msd) > 1 ? row('תחילת חודש עבודה', W.msd + ' בחודש') : ''}
      ${row('שכר שעתי', W.rate !== '' ? '₪' + nf(W.rate) : '—')}
      ${row('נקודות זיכוי', W.credit !== '' ? nf(W.credit) : '—')}
      ${row('יישוב מזכה', W.disc ? `${W.disc}% עד ${nf(W.ceil)}` : 'לא')}
      ${row('פנסיה עובד / מעסיק', `${nf(W.pe)}% / ${nf(W.pr)}%`)}
      ${row('חופשה / מחלה', `${W.vac === '' ? '—' : nf(W.vac)} / ${W.sick === '' ? '—' : nf(W.sick)}`)}
    </div>`, { next: 'סיום' });
}

/* ---------- ניווט ושמירה ---------- */
async function go() {
  setErr('');
  if (W.step === 1 && W.credit !== '' && (W.credit < 0 || W.credit > 20)) return setErr('נקודות זיכוי נראות לא סבירות');
  if (W.step === 3 && W.rate !== '' && (W.rate <= 0 || W.rate > 2000)) return setErr('שכר שעתי לא סביר');
  if (W.step < STEPS.length - 1) { W.step++; return paint(); }
  const btn = $('w-next'); if (btn) btn.disabled = true;
  try { await save(); setFlag(); close(); }
  catch (e) { if (btn) btn.disabled = false; setErr('שמירה נכשלה: ' + e.message); }
}

async function save() {
  const s = await store.settings();
  const profile = { ...(s.profile || {}), onboarded: true, version: 1, settlement_name: W.city || null, gender: W.gender, single_parent: W.single, kids: W.kids, employer_name: W.employer,
    month_start_day: Number(W.msd) > 1 ? Number(W.msd) : null, vacation_start: W.vac === '' ? null : Number(W.vac), sick_start: W.sick === '' ? null : Number(W.sick), balances_as_of: W.asOf || null };
  const next = { ...s,
    ...(W.credit !== '' ? { credit_points: Number(W.credit) } : {}),
    settlement_discount_pct: Number(W.disc) || 0,  settlement_ceiling: Number(W.ceil) || s.settlement_ceiling,
    pension_emp_pct: Number(W.pe), pension_employer_pct: Number(W.pr), severance_pct: Number(W.sv), profile,
    break_minutes: Number(W.brk) || 0, break_paid: W.brkPaid, travel_enabled: W.trv && Number(W.trvd) > 0, travel_per_day: Number(W.trvd) || 0 };
  try { await store.saveSettings(next); }
  catch (e) {                                                  // עמודת profile עדיין לא קיימת בבסיס הנתונים: שומרים בלעדיה
    if (!/profile/i.test(e.message)) throw e;
    const { profile: _p, ...rest } = next; await store.saveSettings(rest);
  }
  if (W.rate !== '' && W.rate > 0) {
    const have = (await store.rates()).some(r => r.from_date === W.rateFrom);
    if (!have) await store.addRate({ from_date: W.rateFrom, hourly_rate: Number(W.rate) });
  }
  const d = W.slip;                                            // שומרים גם את התלוש עצמו, כדי שתהיה היסטוריה
  if (d && d.month && d.gross != null && d.net != null) {
    try {
      await store.savePayslips([{ month: d.month, employer_name: d.employer ?? W.employer ?? '', gross: d.gross, net: d.net, income_tax: d.income_tax ?? 0,
        national_insurance: d.national_insurance ?? 0, health: d.health ?? 0, pension_emp: d.pension_emp ?? null, pension_employer: d.pension_employer ?? null,
        severance: d.severance ?? null, insured_salary: d.insured_salary ?? null, hours: d.hours ?? null, workdays: d.workdays ?? null,
        vacation_balance: d.vacation_balance ?? null, sick_balance: d.sick_balance ?? null }]);
    } catch (e) { console.warn('slip save', e); }
  }
}
