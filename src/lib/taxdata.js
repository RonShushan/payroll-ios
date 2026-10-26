// נתוני מס לעדכון שנתי. מקור: רשות המסים (חוברת הניכויים החודשיים 2026) ומדריכי נקודות זיכוי.
// חשוב: כל המספרים כאן הם אומדן להצגה באשף. הערך המחייב הוא של התלוש / טופס 101.
export const TAX_DATA_YEAR = 2026;
export const CREDIT_POINT_VALUE_MONTH = 242;         // ₪ לחודש (2,904 לשנה)

export const BASE_CREDIT = { m: 2.25, f: 2.75 };      // תושב ישראל / תושבת ישראל

// נקודות לפי גיל הילד (שנת המס פחות שנת הלידה). recv = ההורה שמקבל קצבת ילדים, other = ההורה השני
const KID = (age, recv) => {
  if (age < 0 || age > 18) return 0;
  if (age === 0) return 2.5;
  if (age <= 2) return 4.5;
  if (age === 3) return 3.5;
  if (age <= 5) return 2.5;
  if (age <= 17) return recv ? 2 : 1;
  return recv ? 0.5 : 0;                               // גיל 18
};
export const childCredit = (birthYear, recv, year = new Date().getFullYear()) => KID(year - birthYear, recv);
export const SINGLE_PARENT = 1;

// יישובים מזכים (סעיף 11): אחוז הנחה ותקרת הכנסה שנתית. רשימת היישובים המלאה תיטען בשלב 3.
export const SETTLEMENT_TIERS = [
  { pct: 20, ceil: 267840, eg: 'שדרות, ישובי העוטף' },
  { pct: 20, ceil: 259920, eg: 'קריית שמונה, מג׳דל שמס' },
  { pct: 18, ceil: 259920, eg: 'אופקים, ערד, מצפה רמון' },
  { pct: 18, ceil: 245400, eg: 'דימונה, ירוחם' },
  { pct: 16, ceil: 226560, eg: 'נתיבות, רהט' },
  { pct: 14, ceil: 259920, eg: 'מעלות תרשיחא, בית ג׳ן' },
  { pct: 14, ceil: 219960, eg: 'מטולה, מנרה, חניתה' },
  { pct: 12, ceil: 226560, eg: 'נהריה' },
  { pct: 12, ceil: 213240, eg: 'טבריה, צפת, בית שאן' },
  { pct: 12, ceil: 186000, eg: 'עכו, סכנין, טמרה' },
  { pct: 10, ceil: 180000, eg: 'קצרין' },
  { pct: 7, ceil: 146640, eg: 'כרמיאל, אשקלון, אשרת' },
];
export const SETTLEMENTS_LIST_URL = 'https://www.gov.il/he/departments/general/income-tax-monthly-deductions-booklet';
