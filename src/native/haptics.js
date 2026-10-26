// רטט קל כמו במערכת (select / light / success / warning / error). בטוח לקריאה גם באתר.
import { registerPlugin } from '@capacitor/core';
import { isNativeApp } from './env.js';
let P = null;
export function haptic(kind = 'light') {
  if (!isNativeApp()) return;
  try { (P ||= registerPlugin('DeviceUI')).haptic({ kind }); } catch {}
}
