import { Capacitor } from '@capacitor/core';
export const isNativeApp = () => { try { return Capacitor.isNativePlatform(); } catch { return false; } };
