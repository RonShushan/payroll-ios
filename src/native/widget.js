// גשר לווידג'ט במסך הבית: דוחפים אליו את מצב המשמרת, וקוראים ממנו פעולות כניסה/יציאה שנלחצו בווידג'ט.
import { registerPlugin } from '@capacitor/core';
import { isNativeApp } from './env.js';

const WB = isNativeApp() ? registerPlugin('WidgetBridge') : null;
export const widgetAvailable = () => !!WB;
export async function widgetStatus() { return WB ? WB.status() : { available: false }; }
export async function widgetPush({ active, start, hours }) {
  if (!WB) return { available: false };
  return WB.setState({ active: !!active, start: start ? new Date(start).getTime() / 1000 : 0, hours: hours || '' });
}
export async function widgetQueue() { if (!WB) return []; const r = await WB.consumeQueue(); return (r.items || []).sort((a, b) => a.ts - b.ts); }
