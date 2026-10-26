import { SPECIAL_DAYS } from './payroll.js';
// חגי ישראל (ימי חג מלאים + ערבי חג) לפי הלוח העברי של הדפדפן/שרת
const _heb = new Intl.DateTimeFormat('en-u-ca-hebrew', { timeZone: 'UTC', day: 'numeric', month: 'long' });
const HOL = [
  ['Tishri', 1, 'ראש השנה'], ['Tishri', 2, 'ראש השנה (יום ב׳)'], ['Tishri', 10, 'יום כיפור'],
  ['Tishri', 15, 'סוכות'], ['Tishri', 22, 'שמיני עצרת / שמחת תורה'],
  ['Nisan', 15, 'פסח (יום ראשון)'], ['Nisan', 21, 'שביעי של פסח'], ['Sivan', 6, 'שבועות'],
];
const hebKey = ymdStr => {
  const p = _heb.formatToParts(new Date(ymdStr + 'T12:00:00Z')); const o = {};
  for (const x of p) o[x.type] = x.value;
  return [o.month, Number(o.day)];
};
const shiftDay = (ymdStr, n) => new Date(new Date(ymdStr + 'T12:00:00Z').getTime() + n * 86400000).toISOString().slice(0, 10);
// מחזיר {name, erev:boolean} או null
export function holidayOf(ymdStr) {
  if (SPECIAL_DAYS[ymdStr]) return { name: SPECIAL_DAYS[ymdStr].name, erev: false, special: true };
  const [m, d] = hebKey(ymdStr);
  const h = HOL.find(x => x[0] === m && x[1] === d);
  if (h) return { name: h[2], erev: false };
  const [m2, d2] = hebKey(shiftDay(ymdStr, 1));
  const e = HOL.find(x => x[0] === m2 && x[1] === d2 && !/יום ב׳|שביעי|שמיני/.test(x[2]) || (x && false));
  if (e) return { name: 'ערב ' + e[2].replace(/ \(.*\)/, ''), erev: true };
  // ערב שביעי של פסח / ערב שמחת תורה
  const e2 = HOL.find(x => x[0] === m2 && x[1] === d2 && /שביעי|שמיני/.test(x[2]));
  if (e2) return { name: 'ערב ' + e2[2].replace(/ \(.*\)/, ''), erev: true };
  return null;
}
export function holidaysInRange(fromYmd, toYmd) {
  const out = []; for (let d = fromYmd; d <= toYmd; d = shiftDay(d, 1)) { const h = holidayOf(d); if (h) out.push({ day: d, ...h }); }
  return out;
}
