// סרגל לשוניות מקורי של iOS (זכוכית אמיתית). באתר ובגרסאות בלי הפלאגין נשאר הסרגל הרגיל.
import { registerPlugin } from '@capacitor/core';
import { isNativeApp } from './env.js';
const ICONS = { clock: 'clock', month: 'calendar', slips: 'doc.text', sum: 'chart.bar', set: 'slider.horizontal.3' };
let P = null, ready = false, failed = false, want = { selected: null, nav: false, style: 'system' };
const plugin = () => (P ||= registerPlugin('NativeTabBar'));
const authUp = () => { const a = document.getElementById('auth-root'); return !!a && !a.hidden; };
const overlay = () => !!(document.getElementById('modal') || document.getElementById('asheet')) || authUp();
function pushVisible() { if (ready) plugin().setVisible({ visible: want.nav && !overlay() }).catch(() => {}); }
export async function initNativeTabs($nav, tabs, onPick) {
  if (!isNativeApp() || failed || ready) return;
  try {
    plugin().addListener('select', e => onPick(e.key));
    await plugin().setup({ items: tabs.map(([key, title]) => ({ key, title, icon: ICONS[key] })), selected: want.selected });
    ready = true; document.documentElement.classList.add('native-tabs');
    plugin().setStyle({ style: want.style }).catch(() => {});
    new MutationObserver(() => { want.nav = !$nav.hidden; pushVisible(); }).observe($nav, { attributes: true, attributeFilter: ['hidden'] });
    new MutationObserver(pushVisible).observe(document.body, { childList: true });
    const ar = document.getElementById('auth-root'); if (ar) new MutationObserver(pushVisible).observe(ar, { attributes: true, attributeFilter: ['hidden'] });
    want.nav = !$nav.hidden; pushVisible();
  } catch { failed = true; document.documentElement.classList.remove('native-tabs'); }
}
export function selectNativeTab(key, navVisible) {
  want.selected = key; want.nav = navVisible;
  if (ready) { plugin().select({ key }).catch(() => {}); pushVisible(); }
}
export function setNativeTabStyle(style) {
  want.style = style;
  if (ready) plugin().setStyle({ style }).catch(() => {});
}
