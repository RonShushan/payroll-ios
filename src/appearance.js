// מראה: ברירת מחדל "לפי המכשיר". אפשר לבחור בהיר/כהה בהגדרות.
// וגם: כיבוד "הפחת שקיפות" של iOS (דרך קוד נייטיב, כי WebKit לא חושף את ההגדרה).
import { registerPlugin } from '@capacitor/core';
import { isNativeApp } from './native/env.js';

const KEY = 'payroll-theme';
const root = document.documentElement;
const META = { light: '#f2f2f7', dark: '#000000' };

export const getTheme = () => { try { return localStorage.getItem(KEY) || 'system'; } catch { return 'system'; } };
export function setTheme(v) {
  try { v === 'system' ? localStorage.removeItem(KEY) : localStorage.setItem(KEY, v); } catch {}
  applyTheme();
}
function applyTheme() {
  const v = getTheme();
  if (v === 'light' || v === 'dark') root.setAttribute('data-theme', v); else root.removeAttribute('data-theme');
  // צבע שורת המצב בדפדפן: מתעדכן לפי המראה בפועל
  const dark = v === 'dark' || (v === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.querySelectorAll('meta[name="theme-color"]').forEach(m => m.remove());
  const m = document.createElement('meta'); m.name = 'theme-color'; m.content = dark ? META.dark : META.light; document.head.appendChild(m);
}
async function applyTransparency() {
  if (!isNativeApp()) return;
  try {
    const { reduceTransparency } = await registerPlugin('DeviceUI').accessibility();
    root.classList.toggle('rt', !!reduceTransparency);
  } catch {}
}
export function initAppearance() {
  applyTheme();
  matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', applyTheme);   // המכשיר עבר בין יום ולילה
  applyTransparency();
  document.addEventListener('visibilitychange', () => { if (!document.hidden) applyTransparency(); });
}
