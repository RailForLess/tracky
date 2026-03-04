import ActivityKit
import SwiftUI
import WidgetKit

// MARK: - Attributes

struct TrainActivityAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        var delayMinutes: Int
        var status: String // "on-time", "delayed", "early"
        var lastUpdated: Double
    }

    var trainNumber: String
    var routeName: String
    var fromCode: String
    var toCode: String
    var from: String
    var to: String
    var departTime: String
    var arriveTime: String
}

// MARK: - Helpers

private func delayColor(_ delay: Int) -> Color {
    if delay > 0 { return .red }
    if delay < 0 { return .green }
    return .green
}

private func delayText(_ delay: Int) -> String {
    if delay > 0 { return "+\(delay)m" }
    if delay < 0 { return "\(delay)m" }
    return "On Time"
}

private func statusLabel(_ delay: Int) -> String {
    if delay > 0 {
        let h = delay / 60
        let m = delay % 60
        if h > 0 && m > 0 { return "Delayed \(h)h\(m)m" }
        if h > 0 { return "Delayed \(h)h" }
        return "Delayed \(m)m"
    }
    if delay < 0 {
        let abs = -delay
        return "\(abs)m early"
    }
    return "On Time"
}

// MARK: - Live Activity

struct TrainLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: TrainActivityAttributes.self) { context in
            // Lock Screen / banner view
            lockScreenView(context: context)
                .padding()
                .activityBackgroundTint(.black.opacity(0.85))
                .activitySystemActionForegroundColor(.white)
        } dynamicIsland: { context in
            DynamicIsland {
                // Expanded
                DynamicIslandExpandedRegion(.leading) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(context.attributes.fromCode)
                            .font(.headline).bold()
                        Text(context.attributes.departTime)
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                    }
                }
                DynamicIslandExpandedRegion(.trailing) {
                    VStack(alignment: .trailing, spacing: 2) {
                        Text(context.attributes.toCode)
                            .font(.headline).bold()
                        Text(context.attributes.arriveTime)
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                    }
                }
                DynamicIslandExpandedRegion(.center) {
                    VStack(spacing: 2) {
                        Text("Train \(context.attributes.trainNumber)")
                            .font(.caption).bold()
                        Text(statusLabel(context.state.delayMinutes))
                            .font(.caption2)
                            .foregroundColor(delayColor(context.state.delayMinutes))
                    }
                }
                DynamicIslandExpandedRegion(.bottom) {
                    Text(context.attributes.routeName)
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
            } compactLeading: {
                Image(systemName: "tram.fill")
                    .foregroundColor(.blue)
            } compactTrailing: {
                Text(delayText(context.state.delayMinutes))
                    .font(.caption2).bold()
                    .foregroundColor(delayColor(context.state.delayMinutes))
            } minimal: {
                Image(systemName: "tram.fill")
                    .foregroundColor(.blue)
            }
        }
    }

    @ViewBuilder
    private func lockScreenView(context: ActivityViewContext<TrainActivityAttributes>) -> some View {
        VStack(spacing: 12) {
            // Header
            HStack {
                Text("Train \(context.attributes.trainNumber)")
                    .font(.headline).bold()
                    .foregroundColor(.white)
                Spacer()
                Text(statusLabel(context.state.delayMinutes))
                    .font(.subheadline).bold()
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(delayColor(context.state.delayMinutes).opacity(0.3))
                    .foregroundColor(delayColor(context.state.delayMinutes))
                    .clipShape(Capsule())
            }

            // Route
            HStack(spacing: 8) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(context.attributes.fromCode)
                        .font(.title3).bold()
                        .foregroundColor(.white)
                    Text(context.attributes.departTime)
                        .font(.caption)
                        .foregroundColor(.white.opacity(0.7))
                }

                Spacer()

                Image(systemName: "arrow.right")
                    .foregroundColor(.white.opacity(0.5))

                Spacer()

                VStack(alignment: .trailing, spacing: 2) {
                    Text(context.attributes.toCode)
                        .font(.title3).bold()
                        .foregroundColor(.white)
                    Text(context.attributes.arriveTime)
                        .font(.caption)
                        .foregroundColor(.white.opacity(0.7))
                }
            }

            // Route name
            Text(context.attributes.routeName)
                .font(.caption)
                .foregroundColor(.white.opacity(0.5))
        }
    }
}
