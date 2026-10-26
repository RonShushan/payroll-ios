# מחשבון שכר – אפליקציית iOS (Capacitor + Ionic)

שלב 1: הרשמה והתחברות (מייל, Google, אימות דו-שלבי), מצב אורח מקומי ושדרוג לחשבון.

## הרצה במק
```bash
cd payroll-ios
npm install
npm test            # בדיקות לוגיקה (אמור להדפיס ALL OK)
npm run dev         # פותח http://localhost:5173
```
פתח את הכתובת ב-Safari/Chrome ובדוק: "המשך כאורח", הרשמה, התחברות, גוגל, אימות דו-שלבי (הגדרות ← חשבון).

## מה צריך להגדיר ב-Supabase (פעם אחת)
- Authentication ← URL Configuration ← Redirect URLs, להוסיף:
  `http://localhost:5173` , כתובת האתר ב-Cloudflare , `com.ronshushan.payroll://login-callback`
- Authentication ← Providers ← Email: לכבות "Confirm email".
- Authentication ← Providers ← Google: Client ID ו-Secret מ-Google Cloud (Web application),
  עם Redirect URI: `https://zwrvbbapdcqyeslbsrvg.supabase.co/auth/v1/callback`
- Multi-Factor: TOTP מופעל.

## אתר (Cloudflare Pages)
Build command: `npm run build`, Build output directory: `dist`.

## אפליקציית iPhone (בדיקה ראשונה)
```bash
npx cap add ios      # פעם אחת
npm run ios          # בונה, מסנכרן ופותח Xcode
```
ב-Xcode: Target App ← Signing & Capabilities ← Team: ה-Apple ID שלך. בלשונית Info ← URL Types ← הוסף: URL Schemes = `com.ronshushan.payroll`
(זה מה שמחזיר מהתחברות עם Google אל האפליקציה). הרצה על האייפון: Product ← Run.
את ההתקנה המלאה והווידג'ט נעשה בשלבים 4 ו-5.

## מבנה
- `src/data/` אחסון: `local.js` (IndexedDB), `store.js` (אורח או Supabase), `migrate.js` (שדרוג אורח), `mode.js`
- `src/auth/` התחברות ומסכי Ionic
- `src/lib/` מנוע השכר (כמו באפליקציה הקיימת)
- `src/app.js` האפליקציה, `src/styles/` עיצוב iOS

## שלב 4 — אפליקציית אייפון (Capacitor)
פעם אחת: `npm install` ואז `npm run ios:add` (בונה, יוצר את פרויקט Xcode, מתקן Info.plist, מסנכרן).
אחרי כל שינוי בקוד: `npm run ios` (בונה, מסנכרן ופותח את Xcode).
