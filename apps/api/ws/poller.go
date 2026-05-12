package ws

import "github.com/RailForLess/tracky/api/spec"

// RealtimeUpdate is the JSON envelope sent to WebSocket clients. The shape
// is the legacy in-process-poller contract; realtime.Processor produces it
// from the collector's Snapshots so iOS sees no behavior change.
type RealtimeUpdate struct {
	Type      string               `json:"type"`
	Provider  string               `json:"provider"`
	Positions []spec.TrainPosition `json:"positions"`
}
