package ws

import (
	"context"
	"encoding/json"
	"log"
	"time"

	"github.com/RailForLess/tracky/api/providers"
	"github.com/RailForLess/tracky/api/spec"
)

// Publisher accepts topic-keyed payloads. Satisfied by *Hub.
type Publisher interface {
	Publish(topic string, payload []byte)
}

// RealtimeUpdate is the JSON envelope sent to WebSocket clients.
type RealtimeUpdate struct {
	Type      string               `json:"type"`
	Provider  string               `json:"provider"`
	Positions []spec.TrainPosition `json:"positions"`
}

// StartPoller polls a single provider's realtime feed on the given interval,
// diffs against the previous snapshot, and publishes the full position list
// when changes are detected. It blocks until ctx is cancelled.
func StartPoller(ctx context.Context, provider providers.Provider, pub Publisher, interval time.Duration) {
	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	var prev map[string]spec.TrainPosition

	fetch := func() {
		feed, err := provider.FetchRealtime(ctx)
		if err != nil {
			log.Printf("poller[%s]: %v", provider.ID(), err)
			return
		}

		curr := make(map[string]spec.TrainPosition, len(feed.Positions))
		for _, p := range feed.Positions {
			curr[positionKey(p)] = p
		}

		if !hasChanges(prev, curr) {
			prev = curr
			return
		}
		prev = curr

		payload, err := json.Marshal(RealtimeUpdate{
			Type:      "realtime_update",
			Provider:  provider.ID(),
			Positions: feed.Positions,
		})
		if err != nil {
			log.Printf("poller[%s]: marshal error: %v", provider.ID(), err)
			return
		}

		pub.Publish(provider.ID(), payload)
	}

	fetch()

	for {
		select {
		case <-ticker.C:
			fetch()
		case <-ctx.Done():
			return
		}
	}
}

func positionKey(p spec.TrainPosition) string {
	return p.TripID + "|" + p.RunDate.Format("2006-01-02")
}

// hasChanges returns true if curr differs from prev (new, removed, or updated positions).
func hasChanges(prev, curr map[string]spec.TrainPosition) bool {
	if len(prev) != len(curr) {
		return true
	}
	for key, cp := range curr {
		pp, ok := prev[key]
		if !ok || !positionsEqual(pp, cp) {
			return true
		}
	}
	return false
}

// positionsEqual does a deep comparison of two TrainPosition values,
// correctly handling pointer fields by comparing pointed-to values.
func positionsEqual(a, b spec.TrainPosition) bool {
	if a.Provider != b.Provider ||
		a.TripID != b.TripID ||
		!a.RunDate.Equal(b.RunDate) ||
		a.TrainNumber != b.TrainNumber ||
		a.RouteID != b.RouteID ||
		a.VehicleID != b.VehicleID ||
		!a.LastUpdated.Equal(b.LastUpdated) {
		return false
	}
	return ptrEq(a.Lat, b.Lat) &&
		ptrEq(a.Lon, b.Lon) &&
		ptrEq(a.SpeedMPH, b.SpeedMPH) &&
		ptrEq(a.Heading, b.Heading) &&
		ptrEq(a.CurrentStopCode, b.CurrentStopCode) &&
		ptrEq(a.CurrentStatus, b.CurrentStatus)
}

func ptrEq[T comparable](a, b *T) bool {
	if a == nil && b == nil {
		return true
	}
	if a == nil || b == nil {
		return false
	}
	return *a == *b
}
