import UIKit
import Capacitor
import CoreLocation
import UserNotifications
import AuthenticationServices
import WidgetKit
import LocalAuthentication

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        GeoMonitor.shared.boot()   // חובה בהפעלה, כדי לקבל אירועי אזור גם כשהאפליקציה הייתה סגורה
        return true
    }

    func applicationWillResignActive(_ application: UIApplication) {
        // Sent when the application is about to move from active to inactive state. This can occur for certain types of temporary interruptions (such as an incoming phone call or SMS message) or when the user quits the application and it begins the transition to the background state.
        // Use this method to pause ongoing tasks, disable timers, and invalidate graphics rendering callbacks. Games should use this method to pause the game.
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
        // Use this method to release shared resources, save user data, invalidate timers, and store enough application state information to restore your application to its current state in case it is terminated later.
        // If your application supports background execution, this method is called instead of applicationWillTerminate: when the user quits.
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
        // Called as part of the transition from the background to the active state; here you can undo many of the changes made on entering the background.
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        // Restart any tasks that were paused (or not yet started) while the application was inactive. If the application was previously in the background, optionally refresh the user interface.
    }

    func applicationWillTerminate(_ application: UIApplication) {
        // Called when the application is about to terminate. Save data if appropriate. See also applicationDidEnterBackground:.
    }

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        // Called when the app was launched with a url. Feel free to add additional processing here,
        // but if you want the App API to support tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        // Called when the app was launched with an activity, including Universal Links.
        // Feel free to add additional processing here, but if you want the App API to support
        // tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }

}

// ===== Scene lifecycle (חובה ב-Xcode / iOS SDK חדש) =====
// החלון נוצר אוטומטית מ-Main.storyboard (UISceneStoryboardFile). כאן רק מעבירים קישורים (חזרה מגוגל) ל-Capacitor.
class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        for ctx in URLContexts {
            _ = ApplicationDelegateProxy.shared.application(UIApplication.shared, open: ctx.url, options: [:])
        }
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        _ = ApplicationDelegateProxy.shared.application(UIApplication.shared, continue: userActivity, restorationHandler: { _ in })
    }
}

// ===== מעקב הגעה / יציאה ממקום העבודה (Region Monitoring, עובד גם כשהאפליקציה סגורה) =====
final class GeoMonitor: NSObject, CLLocationManagerDelegate {
    static let shared = GeoMonitor()
    private let lm = CLLocationManager()
    private let ud = UserDefaults.standard
    private var locCompletion: ((Result<CLLocation, Error>) -> Void)?
    private let regionId = "payroll.workplace"

    override init() {
        super.init()
        lm.delegate = self
    }

    // נקרא בהפעלת האפליקציה (גם כשאייפון מעיר אותה ברקע בגלל אירוע אזור)
    func boot() {
        if let cfg = ud.dictionary(forKey: "geo.cfg"), (cfg["enabled"] as? Bool) == true,
           let lat = cfg["lat"] as? Double, let lng = cfg["lng"] as? Double, let r = cfg["radius"] as? Double {
            startMonitoring(lat: lat, lng: lng, radius: r)
        }
    }

    var authString: String {
        switch lm.authorizationStatus {
        case .authorizedAlways: return "always"
        case .authorizedWhenInUse: return "whenInUse"
        case .denied, .restricted: return "denied"
        default: return "notDetermined"
        }
    }

    func requestWhenInUse() { lm.requestWhenInUseAuthorization() }
    func requestAlways() { lm.requestAlwaysAuthorization() }

    func getLocation(_ done: @escaping (Result<CLLocation, Error>) -> Void) {
        locCompletion = done
        lm.desiredAccuracy = kCLLocationAccuracyBest
        lm.requestLocation()
    }

    func startMonitoring(lat: Double, lng: Double, radius: Double) {
        stopMonitoring(keepConfig: true)
        guard CLLocationManager.isMonitoringAvailable(for: CLCircularRegion.self) else { return }
        let r = max(50, min(radius, 1000))
        let region = CLCircularRegion(center: CLLocationCoordinate2D(latitude: lat, longitude: lng), radius: min(r, lm.maximumRegionMonitoringDistance), identifier: regionId)
        region.notifyOnEntry = true
        region.notifyOnExit = true
        lm.startMonitoring(for: region)
        ud.set(["enabled": true, "lat": lat, "lng": lng, "radius": r] as [String: Any], forKey: "geo.cfg")
    }

    func stopMonitoring(keepConfig: Bool = false) {
        for r in lm.monitoredRegions where r.identifier == regionId { lm.stopMonitoring(for: r) }
        if !keepConfig { ud.set(["enabled": false], forKey: "geo.cfg") }
    }

    var isMonitoring: Bool { lm.monitoredRegions.contains { $0.identifier == regionId } }
    func saveState(_ json: String) { ud.set(json, forKey: "geo.state") }
    func consumePending() -> [String: Any]? {
        let p = ud.dictionary(forKey: "geo.pending"); ud.removeObject(forKey: "geo.pending"); return p
    }

    // ---- אירועי אזור ----
    func locationManager(_ manager: CLLocationManager, didEnterRegion region: CLRegion) { handle("in") }
    func locationManager(_ manager: CLLocationManager, didExitRegion region: CLRegion) { handle("out") }

    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        if let l = locations.last, let c = locCompletion { locCompletion = nil; c(.success(l)) }
    }
    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        if let c = locCompletion { locCompletion = nil; c(.failure(error)) }
    }

    // יומן אבחון קצר (30 שורות אחרונות), מוצג בהגדרות
    func log(_ msg: String) {
        let f = DateFormatter(); f.dateFormat = "dd/MM HH:mm:ss"
        var l = ud.stringArray(forKey: "geo.log") ?? []
        l.append("\(f.string(from: Date())) \(msg)")
        ud.set(Array(l.suffix(30)), forKey: "geo.log")
    }
    func readLog() -> [String] { ud.stringArray(forKey: "geo.log") ?? [] }

    private func handle(_ kind: String) {
        log("אירוע \(kind == "in" ? "כניסה" : "יציאה") לאזור")
        guard let s = ud.string(forKey: "geo.state"), let data = s.data(using: .utf8),
              let st = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { log("אין מצב שמור, דילוג"); return }
        let cal = Calendar.current
        let now = Date()
        let dow = cal.component(.weekday, from: now) - 1                    // 0 = ראשון, כמו ב-JS
        let workDays = (st["workDays"] as? [Int]) ?? [0, 1, 2, 3, 4, 5]
        guard workDays.contains(dow) else { log("לא יום עבודה"); return }
        let f = DateFormatter(); f.dateFormat = "yyyy-MM-dd"; f.locale = Locale(identifier: "en_US_POSIX")
        let today = f.string(from: now)
        if let skip = st["skipDays"] as? [String], skip.contains(today) { log("יום חופש/חג"); return }   // חג / יום חופש
        let minutes = cal.component(.hour, from: now) * 60 + cal.component(.minute, from: now)
        let window = (st["windowMin"] as? Int) ?? 90
        let target: Int
        if kind == "in" { target = (st["inMin"] as? Int) ?? 495 }
        else { target = dow == 5 ? ((st["friOutMin"] as? Int) ?? 795) : ((st["outMin"] as? Int) ?? 1035) }
        guard abs(minutes - target) <= window else { log("מחוץ לחלון הזמן (\(minutes) מול \(target))"); return }                        // רק סביב שעות העבודה
        if kind == "in" {
            if (st["stateDate"] as? String) == today, (st["hasShiftToday"] as? Bool) == true { log("כבר יש משמרת היום"); return }
        } else {
            if (st["activeShift"] as? Bool) != true { log("אין משמרת פעילה"); return }
        }
        ud.set(["kind": kind, "ts": now.timeIntervalSince1970] as [String: Any], forKey: "geo.pending")
        let c = UNMutableNotificationContent()
        c.title = "מחשבון שכר"
        c.body = kind == "in" ? "הגעת לעבודה. להתחיל משמרת?" : "יצאת מהעבודה. לסיים משמרת?"
        c.sound = .default
        c.userInfo = ["geo": kind] as [AnyHashable: Any]
        c.threadIdentifier = "geo"
        // התראה מיידית, ובקשת זמן ריצה נוסף כדי שהמערכת לא תשהה את התהליך לפני שהיא נרשמה
        var bg = UIBackgroundTaskIdentifier.invalid
        bg = UIApplication.shared.beginBackgroundTask(withName: "geo-notify") { UIApplication.shared.endBackgroundTask(bg) }
        let req = UNNotificationRequest(identifier: "geo-\(kind)-\(Int(now.timeIntervalSince1970))", content: c, trigger: nil)
        UNUserNotificationCenter.current().getNotificationSettings { s in
            self.log("הרשאת התראות: \(s.authorizationStatus.rawValue)")
            UNUserNotificationCenter.current().add(req) { err in
                self.log(err == nil ? "התראה נשלחה" : "שגיאת התראה: \(err!.localizedDescription)")
                if bg != .invalid { UIApplication.shared.endBackgroundTask(bg) }
            }
        }
    }
}

// פלאגין Capacitor שמחבר את ה-JS ל-GeoMonitor
@objc(GeofencePlugin)
public class GeofencePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "GeofencePlugin"
    public let jsName = "Geofence"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "requestWhenInUse", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestAlways", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "status", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getLocation", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "updateState", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "consumePending", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getLog", returnType: CAPPluginReturnPromise),
    ]
    @objc func getLog(_ call: CAPPluginCall) { call.resolve(["lines": GeoMonitor.shared.readLog()]) }

    @objc func requestWhenInUse(_ call: CAPPluginCall) { GeoMonitor.shared.requestWhenInUse(); call.resolve(["auth": GeoMonitor.shared.authString]) }
    @objc func requestAlways(_ call: CAPPluginCall) { GeoMonitor.shared.requestAlways(); call.resolve(["auth": GeoMonitor.shared.authString]) }
    @objc func status(_ call: CAPPluginCall) { call.resolve(["auth": GeoMonitor.shared.authString, "monitoring": GeoMonitor.shared.isMonitoring]) }
    @objc func getLocation(_ call: CAPPluginCall) {
        GeoMonitor.shared.getLocation { res in
            switch res {
            case .success(let l): call.resolve(["lat": l.coordinate.latitude, "lng": l.coordinate.longitude, "accuracy": l.horizontalAccuracy])
            case .failure(let e): call.reject(e.localizedDescription)
            }
        }
    }
    @objc func start(_ call: CAPPluginCall) {
        guard let lat = call.getDouble("lat"), let lng = call.getDouble("lng") else { call.reject("missing lat/lng"); return }
        GeoMonitor.shared.startMonitoring(lat: lat, lng: lng, radius: call.getDouble("radius") ?? 50)
        call.resolve(["monitoring": GeoMonitor.shared.isMonitoring])
    }
    @objc func stop(_ call: CAPPluginCall) { GeoMonitor.shared.stopMonitoring(); call.resolve() }
    @objc func updateState(_ call: CAPPluginCall) { GeoMonitor.shared.saveState(call.getString("state") ?? "{}"); call.resolve() }
    @objc func consumePending(_ call: CAPPluginCall) {
        if let p = GeoMonitor.shared.consumePending() { call.resolve(["kind": p["kind"] as? String ?? "", "ts": p["ts"] as? Double ?? 0]) }
        else { call.resolve([:]) }
    }
}

// מסך ראשי של Capacitor שרושם את הפלאגין המקומי
@objc(MainViewController)
class MainViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(GeofencePlugin())
        bridge?.registerPluginInstance(AuthSessionPlugin())
        bridge?.registerPluginInstance(WidgetBridgePlugin())
        bridge?.registerPluginInstance(DeviceUIPlugin())
        bridge?.registerPluginInstance(BiometricPlugin())
        bridge?.registerPluginInstance(NativeTabBarPlugin())
    }
}

// התחברות OAuth (גוגל) דרך ASWebAuthenticationSession: החלון הרשמי של המערכת, מחזיר ישירות את כתובת החזרה
@objc(AuthSessionPlugin)
public class AuthSessionPlugin: CAPPlugin, CAPBridgedPlugin, ASWebAuthenticationPresentationContextProviding {
    public let identifier = "AuthSessionPlugin"
    public let jsName = "AuthSession"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "cancel", returnType: CAPPluginReturnPromise),
    ]
    private var session: ASWebAuthenticationSession?

    @objc func start(_ call: CAPPluginCall) {
        guard let s = call.getString("url"), let url = URL(string: s), let scheme = call.getString("scheme") else { call.reject("bad arguments"); return }
        DispatchQueue.main.async {
            self.session?.cancel()
            let sess = ASWebAuthenticationSession(url: url, callbackURLScheme: scheme) { [weak self] callback, error in
                self?.session = nil
                if let e = error as? ASWebAuthenticationSessionError, e.code == .canceledLogin { call.resolve(["cancelled": true]); return }
                if let e = error { call.reject(e.localizedDescription); return }
                call.resolve(["url": callback?.absoluteString ?? ""])
            }
            sess.presentationContextProvider = self
            sess.prefersEphemeralWebBrowserSession = false
            self.session = sess
            if !sess.start() { call.reject("could not start the sign-in session") }
        }
    }

    @objc func cancel(_ call: CAPPluginCall) {
        DispatchQueue.main.async { self.session?.cancel(); self.session = nil; call.resolve() }
    }

    public func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        if let w = self.bridge?.viewController?.view.window { return w }
        for sc in UIApplication.shared.connectedScenes {
            if let ws = sc as? UIWindowScene, let w = ws.windows.first(where: { $0.isKeyWindow }) ?? ws.windows.first { return w }
        }
        return ASPresentationAnchor()
    }
}

// גשר בין האפליקציה לווידג'ט (דרך App Group משותף)
@objc(WidgetBridgePlugin)
public class WidgetBridgePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "WidgetBridgePlugin"
    public let jsName = "WidgetBridge"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "status", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setState", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "consumeQueue", returnType: CAPPluginReturnPromise),
    ]
    private let group = "group.com.ronshushan.payroll"
    private var defaults: UserDefaults? { UserDefaults(suiteName: group) }
    private var available: Bool { FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: group) != nil }

    @objc func status(_ call: CAPPluginCall) { call.resolve(["available": available]) }

    @objc func setState(_ call: CAPPluginCall) {
        guard available, let d = defaults else { call.resolve(["available": false]); return }
        let active = call.getBool("active") ?? false
        d.set(active, forKey: "w.active")
        d.set(active ? (call.getDouble("start") ?? 0) : 0.0, forKey: "w.start")
        d.set(call.getString("hours") ?? "", forKey: "w.hours")
        WidgetCenter.shared.reloadAllTimelines()
        call.resolve(["available": true])
    }

    @objc func consumeQueue(_ call: CAPPluginCall) {
        guard let d = defaults else { call.resolve(["items": []]); return }
        let q = (d.array(forKey: "w.queue") as? [[String: Any]]) ?? []
        d.removeObject(forKey: "w.queue")
        call.resolve(["items": q])
    }
}

// הגדרות נגישות של המכשיר שהווב לא רואה (הפחת שקיפות)
@objc(DeviceUIPlugin)
public class DeviceUIPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "DeviceUIPlugin"
    public let jsName = "DeviceUI"
    public let pluginMethods: [CAPPluginMethod] = [CAPPluginMethod(name: "accessibility", returnType: CAPPluginReturnPromise), CAPPluginMethod(name: "haptic", returnType: CAPPluginReturnNone), CAPPluginMethod(name: "secureGet", returnType: CAPPluginReturnPromise), CAPPluginMethod(name: "secureSet", returnType: CAPPluginReturnPromise), CAPPluginMethod(name: "secureRemove", returnType: CAPPluginReturnPromise)]
    @objc func accessibility(_ call: CAPPluginCall) {
        DispatchQueue.main.async { call.resolve(["reduceTransparency": UIAccessibility.isReduceTransparencyEnabled]) }
    }
    // אחסון מאובטח ב-Keychain (בלי ביומטרית): לסשן ההתחברות
    private func kcQuery(_ key: String) -> [String: Any] { [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: "payroll.secure", kSecAttrAccount as String: key] }
    @objc func secureGet(_ call: CAPPluginCall) {
        guard let k = call.getString("key") else { call.reject("missing key"); return }
        var q = kcQuery(k); q[kSecReturnData as String] = true; q[kSecMatchLimit as String] = kSecMatchLimitOne
        var out: CFTypeRef?
        if SecItemCopyMatching(q as CFDictionary, &out) == errSecSuccess, let d = out as? Data, let v = String(data: d, encoding: .utf8) { call.resolve(["value": v]) } else { call.resolve([:]) }
    }
    @objc func secureSet(_ call: CAPPluginCall) {
        guard let k = call.getString("key"), let v = call.getString("value"), let d = v.data(using: .utf8) else { call.reject("missing args"); return }
        SecItemDelete(kcQuery(k) as CFDictionary)
        var q = kcQuery(k); q[kSecValueData as String] = d; q[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        let st = SecItemAdd(q as CFDictionary, nil)
        if st == errSecSuccess { call.resolve() } else { call.reject("keychain set failed (\(st))") }
    }
    @objc func secureRemove(_ call: CAPPluginCall) {
        if let k = call.getString("key") { SecItemDelete(kcQuery(k) as CFDictionary) }
        call.resolve()
    }
    // רטט קצר: select / light / success / warning / error
    @objc func haptic(_ call: CAPPluginCall) {
        let k = call.getString("kind") ?? "light"
        DispatchQueue.main.async {
            switch k {
            case "select": UISelectionFeedbackGenerator().selectionChanged()
            case "success": UINotificationFeedbackGenerator().notificationOccurred(.success)
            case "warning": UINotificationFeedbackGenerator().notificationOccurred(.warning)
            case "error": UINotificationFeedbackGenerator().notificationOccurred(.error)
            default: UIImpactFeedbackGenerator(style: .light).impactOccurred()
            }
        }
    }
}

// כניסה חוזרת עם Face ID: שומר את אסימון ההתחברות ב-Keychain מוגן ביומטרית (נפתח רק אחרי Face ID / Touch ID / קוד המכשיר)
@objc(BiometricPlugin)
public class BiometricPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "BiometricPlugin"
    public let jsName = "Biometric"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "available", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "authenticate", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "save", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "read", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "remove", returnType: CAPPluginReturnPromise),
    ]
    private let service = "payroll.faceid.session"
    @objc func available(_ call: CAPPluginCall) {
        let ctx = LAContext()
        let ok = ctx.canEvaluatePolicy(.deviceOwnerAuthentication, error: nil)
        var kind = "passcode"
        if ctx.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: nil) { kind = ctx.biometryType == .faceID ? "face" : (ctx.biometryType == .touchID ? "touch" : "passcode") }
        call.resolve(["available": ok, "type": kind])
    }
    @objc func authenticate(_ call: CAPPluginCall) {
        let ctx = LAContext(); ctx.localizedCancelTitle = "ביטול"; ctx.localizedFallbackTitle = "הזן קוד מכשיר"
        ctx.evaluatePolicy(.deviceOwnerAuthentication, localizedReason: call.getString("reason") ?? "אימות") { ok, error in
            if ok { call.resolve(["ok": true]) } else { call.resolve(["ok": false, "cancelled": self.isCancel(error)]) }
        }
    }
    private func isCancel(_ e: Error?) -> Bool {
        let c = (e as NSError?)?.code ?? 0
        return c == LAError.userCancel.rawValue || c == LAError.appCancel.rawValue || c == LAError.systemCancel.rawValue
    }
    private func baseQuery() -> [String: Any] { [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecAttrAccount as String: "refresh"] }
    @objc func save(_ call: CAPPluginCall) {
        guard let v = call.getString("value"), let data = v.data(using: .utf8) else { call.reject("missing value"); return }
        SecItemDelete(baseQuery() as CFDictionary)
        var err: Unmanaged<CFError>?
        guard let ac = SecAccessControlCreateWithFlags(nil, kSecAttrAccessibleWhenPasscodeSetThisDeviceOnly, .userPresence, &err) else { call.reject("access control failed"); return }
        var q = baseQuery(); q[kSecValueData as String] = data; q[kSecAttrAccessControl as String] = ac
        let st = SecItemAdd(q as CFDictionary, nil)
        if st == errSecSuccess { call.resolve(["ok": true]) } else { call.reject("keychain save failed (\(st))") }
    }
    @objc func read(_ call: CAPPluginCall) {
        let ctx = LAContext(); ctx.localizedReason = call.getString("reason") ?? "כניסה לחשבון"; ctx.localizedCancelTitle = "ביטול"; ctx.localizedFallbackTitle = "הזן קוד מכשיר"
        DispatchQueue.global().async {
            var q = self.baseQuery(); q[kSecReturnData as String] = true; q[kSecMatchLimit as String] = kSecMatchLimitOne; q[kSecUseAuthenticationContext as String] = ctx
            var out: CFTypeRef?
            let st = SecItemCopyMatching(q as CFDictionary, &out)
            if st == errSecSuccess, let d = out as? Data, let s = String(data: d, encoding: .utf8) { call.resolve(["value": s]) }
            else if st == errSecItemNotFound { call.resolve(["missing": true]) }
            else if st == errSecUserCanceled { call.resolve(["cancelled": true]) }
            else if st == errSecAuthFailed { call.resolve(["failed": true]) }
            else { call.resolve(["error": "keychain read failed (\(st))"]) }
        }
    }
    @objc func remove(_ call: CAPPluginCall) { SecItemDelete(baseQuery() as CFDictionary); call.resolve(["ok": true]) }
}

// סרגל לשוניות מקורי (UITabBar): ב-iOS 26 הוא מקבל אוטומטית את חומר הזכוכית (Liquid Glass) של המערכת, כולל הבועה הנגררת.
@objc(NativeTabBarPlugin)
public class NativeTabBarPlugin: CAPPlugin, CAPBridgedPlugin, UITabBarDelegate {
    public let identifier = "NativeTabBarPlugin"
    public let jsName = "NativeTabBar"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "setup", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "select", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setVisible", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setStyle", returnType: CAPPluginReturnPromise),
    ]
    private var bar: UITabBar?
    private var style: UIUserInterfaceStyle = .unspecified
    private var keys: [String] = []

    @objc func setup(_ call: CAPPluginCall) {
        guard let items = call.getArray("items") as? [[String: Any]], !items.isEmpty else { call.reject("missing items"); return }
        let selected = call.getString("selected")
        DispatchQueue.main.async {
            guard let host = self.bridge?.viewController?.view else { call.reject("no view"); return }
            self.bar?.removeFromSuperview()
            let bar = UITabBar()
            bar.delegate = self
            bar.semanticContentAttribute = .forceRightToLeft
            bar.tintColor = UIColor(red: 0.0, green: 0.38, blue: 0.8, alpha: 1)
            bar.unselectedItemTintColor = .secondaryLabel
            self.keys = items.map { $0["key"] as? String ?? "" }
            let tabItems = items.enumerated().map { i, d -> UITabBarItem in
                let it = UITabBarItem(title: d["title"] as? String, image: UIImage(systemName: d["icon"] as? String ?? "circle"), tag: i)
                return it
            }
            bar.items = tabItems
            if let sel = selected, let i = self.keys.firstIndex(of: sel) { bar.selectedItem = tabItems[i] } else { bar.selectedItem = tabItems.first }
            bar.translatesAutoresizingMaskIntoConstraints = false
            host.addSubview(bar)
            NSLayoutConstraint.activate([
                bar.leadingAnchor.constraint(equalTo: host.leadingAnchor),
                bar.trailingAnchor.constraint(equalTo: host.trailingAnchor),
                bar.bottomAnchor.constraint(equalTo: host.bottomAnchor),
            ])
            bar.overrideUserInterfaceStyle = self.style
            bar.isHidden = true
            self.bar = bar
            call.resolve(["height": bar.intrinsicContentSize.height])
        }
    }
    @objc func select(_ call: CAPPluginCall) {
        let key = call.getString("key") ?? ""
        DispatchQueue.main.async {
            if let bar = self.bar, let i = self.keys.firstIndex(of: key), let items = bar.items, i < items.count, bar.selectedItem != items[i] { bar.selectedItem = items[i] }
            call.resolve()
        }
    }
    // מראה ידני מההגדרות (בהיר/כהה/לפי המכשיר): הסרגל המקורי לא יודע על data-theme של הרשת
    @objc func setStyle(_ call: CAPPluginCall) {
        let v = call.getString("style") ?? "system"
        DispatchQueue.main.async {
            self.style = v == "dark" ? .dark : (v == "light" ? .light : .unspecified)
            self.bar?.overrideUserInterfaceStyle = self.style
            call.resolve()
        }
    }
    @objc func setVisible(_ call: CAPPluginCall) {
        let visible = call.getBool("visible") ?? true
        DispatchQueue.main.async {
            guard let bar = self.bar else { call.resolve(); return }
            if visible { bar.isHidden = false }
            UIView.animate(withDuration: 0.25, animations: { bar.alpha = visible ? 1 : 0; bar.transform = visible ? .identity : CGAffineTransform(translationX: 0, y: 24) }, completion: { _ in if !visible { bar.isHidden = true } })
            call.resolve()
        }
    }
    public func tabBar(_ tabBar: UITabBar, didSelect item: UITabBarItem) {
        guard item.tag < keys.count else { return }
        notifyListeners("select", data: ["key": keys[item.tag]])
    }
}
