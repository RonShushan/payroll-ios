// מנוע חישוב שכר - ישראל. כל הפרמטרים לפי שנה בקובץ PARAMS
export const PARAMS = {
  2023: { brackets:[[6790,.10],[9740,.14],[15620,.20],[21710,.31],[45180,.35],[58190,.47],[Infinity,.50]],
          point:235, blThreshold:6331, blLow:.004, blHigh:.07, hLow:.031, hHigh:.05, cap:45075 },
  2024: { brackets:[[7010,.10],[10060,.14],[16150,.20],[22440,.31],[46690,.35],[60130,.47],[Infinity,.50]],
          point:235, blThreshold:7522, blLow:.004, blHigh:.07, hLow:.031, hHigh:.05, cap:49030 },
  2025: { brackets:[[7010,.10],[10060,.14],[16150,.20],[22440,.31],[46690,.35],[60130,.47],[Infinity,.50]],
          point:242, blThreshold:7522, blLow:.0104, blHigh:.07, hLow:.0323, hHigh:.0517, cap:50695 },
  2026: { brackets:[[7010,.10],[10060,.14],[19000,.20],[25100,.31],[46690,.35],[60130,.47],[Infinity,.50]],
          point:242, blThreshold:7703, blLow:.0104, blHigh:.07, hLow:.0323, hHigh:.0517, cap:51910 },
};
export const r2 = x => Math.round((x + Number.EPSILON) * 100) / 100;

export function bracketTax(income, brackets){
  let tax=0, prev=0;
  for (const [top,rate] of brackets){
    if (income>prev){ tax += (Math.min(income,top)-prev)*rate; }
    prev=top; if (income<=top) break;
  }
  return tax;
}
// ביטוח לאומי + בריאות (שניהם על כלל השכר החייב, עד תקרה)
export function insurance(gross, p){
  const g = Math.min(gross, p.cap);
  const low = Math.min(g, p.blThreshold), high = Math.max(0, g - p.blThreshold);
  return { bl: Math.round(low*p.blLow + high*p.blHigh), health: Math.round(low*p.hLow + high*p.hHigh) };
}
// פנסיה: לפי שכר מבוטח (ללא שעות נוספות)
export function pension(base, rates={emp:.06, employer:.065, severance:.0833}){
  return { emp:r2(base*rates.emp), employer:r2(base*rates.employer), severance:r2(base*rates.severance) };
}
// מס הכנסה בחישוב מצטבר: מס על ההכנסה המצטברת פחות זיכויים פחות הנחת יישוב (10% מההכנסה עד תקרה)
export function cumulativeTax({year, monthIndex, cumIncome, credits, discountPct=0, discountCeiling=180000, taxPaidBefore=0}){
  const p = PARAMS[year];
  const gross = bracketTax(cumIncome / monthIndex, p.brackets) * monthIndex; // ממוצע חודשי לכל חודש עד כה
  const creditAmt = credits * p.point * monthIndex;
  const discount = discountPct * Math.min(cumIncome, discountCeiling * monthIndex / 12);
  const due = Math.max(0, gross - creditAmt - discount);
  return r2(due - taxPaidBefore);
}
