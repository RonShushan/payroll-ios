// לקוח Supabase יחיד (נטען בעצלתיים, כך שמצב אורח לא צריך אינטרנט בכלל)
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../config.js';
import { registerPlugin } from '@capacitor/core';
import { isNativeApp } from '../native/env.js';
let sb = null;
// באייפון הסשן נשמר ב-Keychain של המערכת (ולא ב-localStorage). אם הרכיב לא זמין: נופלים חזרה ל-localStorage.
const ls = { g: k => { try { return localStorage.getItem(k); } catch { return null; } }, s: (k, v) => { try { localStorage.setItem(k, v); } catch {} }, r: k => { try { localStorage.removeItem(k); } catch {} } };
const secureStorage = {
  async getItem(k) {
    try { const r = await registerPlugin('DeviceUI').secureGet({ key: k }); if (r && r.value != null) return r.value; } catch { return ls.g(k); }
    const v = ls.g(k);                                                  // מעבר חד-פעמי מהאחסון הישן
    if (v != null) { try { await registerPlugin('DeviceUI').secureSet({ key: k, value: v }); ls.r(k); } catch {} }
    return v;
  },
  async setItem(k, v) { try { await registerPlugin('DeviceUI').secureSet({ key: k, value: v }); ls.r(k); } catch { ls.s(k, v); } },
  async removeItem(k) { try { await registerPlugin('DeviceUI').secureRemove({ key: k }); } catch {} ls.r(k); },
};
export async function getClient() {
  if (sb) return sb;
  const { createClient } = await import('@supabase/supabase-js');
  sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { ...(isNativeApp() ? { storage: secureStorage } : {}), persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, flowType: 'pkce' },
  });
  return sb;
}
