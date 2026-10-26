import WidgetKit
import SwiftUI
import AppIntents

// קבוצת האפליקציה המשותפת לאפליקציה ולווידג'ט (חייבת להיות זהה בשני ה-Targets)
private let appGroup = "group.com.ronshushan.payroll"

struct WState {
    var active: Bool
    var start: Date?
    var hours: String
}

private func readState() -> WState {
    let d = UserDefaults(suiteName: appGroup)
    let active = d?.bool(forKey: "w.active") ?? false
    let t = d?.double(forKey: "w.start") ?? 0
    return WState(active: active, start: (active && t > 0) ? Date(timeIntervalSince1970: t) : nil, hours: d?.string(forKey: "w.hours") ?? "")
}

// לחיצה על הכפתור: מעדכנים מיד את הווידג'ט (הטיימר מתחיל/נעצר), ורושמים את הפעולה בשעה המדויקת.
// האפליקציה קוראת את התור בפעם הבאה שהיא נפתחת ורושמת את המשמרת.
struct ToggleShiftIntent: AppIntent {
    static let title: LocalizedStringResource = "כניסה / יציאה"
    static let openAppWhenRun: Bool = false

    func perform() async throws -> some IntentResult {
        let d = UserDefaults(suiteName: appGroup)
        let now = Date().timeIntervalSince1970
        let active = d?.bool(forKey: "w.active") ?? false
        var q = (d?.array(forKey: "w.queue") as? [[String: Any]]) ?? []
        q.append(["kind": active ? "out" : "in", "ts": now])
        d?.set(q, forKey: "w.queue")
        d?.set(!active, forKey: "w.active")
        d?.set(active ? 0.0 : now, forKey: "w.start")
        WidgetCenter.shared.reloadAllTimelines()
        return .result()
    }
}

struct Entry: TimelineEntry {
    let date: Date
    let state: WState
}

struct Provider: TimelineProvider {
    func placeholder(in context: Context) -> Entry { Entry(date: Date(), state: WState(active: false, start: nil, hours: "")) }
    func getSnapshot(in context: Context, completion: @escaping (Entry) -> Void) { completion(Entry(date: Date(), state: readState())) }
    func getTimeline(in context: Context, completion: @escaping (Timeline<Entry>) -> Void) {
        let e = Entry(date: Date(), state: readState())
        completion(Timeline(entries: [e], policy: .after(Date().addingTimeInterval(15 * 60))))
    }
}

struct PayrollWidgetView: View {
    let entry: Entry
    var body: some View {
        let s = entry.state
        VStack(spacing: 6) {
            if s.active, let start = s.start {
                Text("במשמרת").font(.caption).foregroundStyle(.secondary)
                Text(start, style: .timer)
                    .font(.system(size: 32, weight: .bold, design: .rounded))
                    .monospacedDigit()
                    .minimumScaleFactor(0.6)
                    .lineLimit(1)
                HStack(spacing: 4) { Text("מ-"); Text(start, style: .time) }
                    .font(.caption2).foregroundStyle(.secondary)
            } else {
                Text("לא במשמרת").font(.subheadline).foregroundStyle(.secondary)
            }
            Button(intent: ToggleShiftIntent()) {
                Text(s.active ? "יציאה" : "כניסה").font(.headline).frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .tint(s.active ? .red : .green)
        }
        .containerBackground(.fill.tertiary, for: .widget)
    }
}

struct PayrollWidget: Widget {
    let kind = "PayrollWidget"
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: Provider()) { entry in
            PayrollWidgetView(entry: entry)
        }
        .configurationDisplayName("שעון נוכחות")
        .description("כניסה ויציאה מהמשמרת, וטיימר חי.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}
