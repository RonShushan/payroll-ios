// כניסה חוזרת עם Face ID / Touch ID: אסימון ההתחברות נשמר ב-Keychain מוגן ביומטרית. ההגדרה לכל מכשיר בנפרד.
import { registerPlugin } from '@capacitor/core';
import { isNativeApp } from './env.js';
const KEY = 'payroll-faceid', ASKED = 'payroll-faceid-asked';
const P = () => registerPlugin('Biometric');
const ls = { get: k => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch {} }, del: k => { try { localStorage.removeItem(k); } catch {} } };
export const faceEnabled = () => ls.get(KEY) === '1';
export const setFaceEnabled = on => on ? ls.set(KEY, '1') : ls.del(KEY);
export const faceAsked = () => ls.get(ASKED) === '1';
export const markFaceAsked = () => ls.set(ASKED, '1');
export async function bioInfo() {
  if (!isNativeApp()) return { available: false, type: 'none' };
  try { return await P().available(); } catch { return { available: false, type: 'none' }; }
}
export const bioName = t => t === 'face' ? 'Face ID' : t === 'touch' ? 'Touch ID' : 'קוד המכשיר';
export async function bioAuth(reason) { try { return await P().authenticate({ reason }); } catch (e) { return { ok: false, error: String(e?.message || e) }; } }
export const saveToken = async v => { try { await P().save({ value: v }); return true; } catch { return false; } };
export const readToken = async reason => { try { return await P().read({ reason }); } catch (e) { return { error: String(e?.message || e) }; } };
export const clearToken = async () => { try { await P().remove(); } catch {} };
