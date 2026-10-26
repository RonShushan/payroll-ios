// מצב עבודה: 'guest' (נתונים רק במכשיר) או 'cloud' (חשבון ב-Supabase)
const KEY = 'payroll-mode', PENDING = 'payroll-pending-upgrade';
const ls = () => { try { return globalThis.localStorage; } catch { return null; } };
export const getMode = () => { try { return ls()?.getItem(KEY) || null; } catch { return null; } };
export const setMode = m => { try { m ? ls()?.setItem(KEY, m) : ls()?.removeItem(KEY); } catch {} };
export const isLocal = () => getMode() === 'guest';
// סימון "אני באמצע שדרוג אורח לחשבון" (נדרש כי כניסה עם גוגל יוצאת מהאפליקציה וחוזרת)
export const setPendingUpgrade = v => { try { v ? ls()?.setItem(PENDING, '1') : ls()?.removeItem(PENDING); } catch {} };
export const hasPendingUpgrade = () => { try { return ls()?.getItem(PENDING) === '1'; } catch { return false; } };
