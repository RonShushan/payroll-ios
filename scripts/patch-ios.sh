#!/bin/bash
# מתקן את Info.plist של פרויקט ה-iOS אחרי "cap add ios": כתובת חזרה מגוגל, שפה, ושם. בטוח להרצה חוזרת.
set -e
PL="ios/App/App/Info.plist"
[ -f "$PL" ] || { echo "לא נמצא $PL. הרץ קודם: npm run ios:add"; exit 1; }
PB=/usr/libexec/PlistBuddy
$PB -c "Delete :CFBundleURLTypes" "$PL" 2>/dev/null || true
$PB -c "Add :CFBundleURLTypes array" "$PL"
$PB -c "Add :CFBundleURLTypes:0 dict" "$PL"
$PB -c "Add :CFBundleURLTypes:0:CFBundleURLName string com.ronshushan.payroll" "$PL"
$PB -c "Add :CFBundleURLTypes:0:CFBundleURLSchemes array" "$PL"
$PB -c "Add :CFBundleURLTypes:0:CFBundleURLSchemes:0 string com.ronshushan.payroll" "$PL"
$PB -c "Set :CFBundleDisplayName מחשבון\ שכר" "$PL" 2>/dev/null || $PB -c "Add :CFBundleDisplayName string מחשבון\ שכר" "$PL"
$PB -c "Delete :CFBundleDevelopmentRegion" "$PL" 2>/dev/null || true
$PB -c "Add :CFBundleDevelopmentRegion string he" "$PL"
$PB -c "Delete :UIUserInterfaceStyle" "$PL" 2>/dev/null || true
$PB -c "Add :UIUserInterfaceStyle string Automatic" "$PL"
echo "Info.plist עודכן ✓"
# גרסת iOS מינימלית 16 (Xcode חדש לא תומך ב-14)
sed -i '' "s/platform :ios, '[0-9.]*'/platform :ios, '16.0'/" ios/App/Podfile
sed -i '' 's/IPHONEOS_DEPLOYMENT_TARGET = [0-9.]*;/IPHONEOS_DEPLOYMENT_TARGET = 16.0;/' ios/App/App.xcodeproj/project.pbxproj
grep -q "IPHONEOS_DEPLOYMENT_TARGET" ios/App/Podfile || python3 - <<'PY'
p='ios/App/Podfile'; s=open(p).read()
s=s.replace("  assertDeploymentTarget(installer)\n","  assertDeploymentTarget(installer)\n  installer.pods_project.targets.each do |t|\n    t.build_configurations.each { |c| c.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '16.0' }\n  end\n",1)
open(p,'w').write(s)
PY
echo "גרסת iOS מינימלית עודכנה ל-16 ✓"
# Scene lifecycle: נדרש ב-Xcode חדש, אחרת האפליקציה קורסת בהפעלה
if ! grep -q "UIApplicationSceneManifest" "$PL"; then
  $PB -c "Add :UIApplicationSceneManifest dict" "$PL"
  $PB -c "Add :UIApplicationSceneManifest:UIApplicationSupportsMultipleScenes bool false" "$PL"
  $PB -c "Add :UIApplicationSceneManifest:UISceneConfigurations dict" "$PL"
  $PB -c "Add :UIApplicationSceneManifest:UISceneConfigurations:UIWindowSceneSessionRoleApplication array" "$PL"
  $PB -c "Add :UIApplicationSceneManifest:UISceneConfigurations:UIWindowSceneSessionRoleApplication:0 dict" "$PL"
  $PB -c "Add :UIApplicationSceneManifest:UISceneConfigurations:UIWindowSceneSessionRoleApplication:0:UISceneConfigurationName string Default\ Configuration" "$PL"
  $PB -c "Add :UIApplicationSceneManifest:UISceneConfigurations:UIWindowSceneSessionRoleApplication:0:UISceneDelegateClassName string \$(PRODUCT_MODULE_NAME).SceneDelegate" "$PL"
  $PB -c "Add :UIApplicationSceneManifest:UISceneConfigurations:UIWindowSceneSessionRoleApplication:0:UISceneStoryboardFile string Main" "$PL"
fi
echo "Scene lifecycle ✓"
# הרשאות מיקום והפלאגין המקומי
$PB -c "Delete :NSLocationWhenInUseUsageDescription" "$PL" 2>/dev/null || true
$PB -c "Add :NSLocationWhenInUseUsageDescription string המיקום משמש לזהות שהגעת למקום העבודה, כדי להציע לך להתחיל משמרת." "$PL"
$PB -c "Delete :NSLocationAlwaysAndWhenInUseUsageDescription" "$PL" 2>/dev/null || true
$PB -c "Add :NSLocationAlwaysAndWhenInUseUsageDescription string כדי להתריע שהגעת או יצאת ממקום העבודה גם כשהאפליקציה סגורה. המיקום נשמר רק במכשיר שלך." "$PL"
sed -i '' 's/customClass="CAPBridgeViewController" customModule="Capacitor"/customClass="MainViewController" customModule="App"/' ios/App/App/Base.lproj/Main.storyboard
echo "מיקום ✓"
