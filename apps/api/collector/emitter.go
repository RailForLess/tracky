// Package collector polls provider realtime feeds and emits per-tick
// snapshots to a pluggable Emitter chain (primary on-prem HTTP, fallback
// Cloudflare R2 via the parent Worker's outbound interceptor).
package collector

import (
	"context"
	"log"
)

// Emitter delivers a single per-tick snapshot to its destination.
type Emitter interface {
	Emit(ctx context.Context, snap *Snapshot) error
}

// MockEmitter logs each snapshot to stderr. Default for local dev.
type MockEmitter struct{}

func (MockEmitter) Emit(_ context.Context, snap *Snapshot) error {
	if snap == nil {
		log.Printf("[emit] nil snapshot")
		return nil
	}
	positions, stopTimes := 0, 0
	if snap.Feed != nil {
		positions = len(snap.Feed.Positions)
		stopTimes = len(snap.Feed.StopTimes)
	}
	log.Printf("[emit] provider=%s ts=%s positions=%d stopTimes=%d",
		snap.ProviderID, snap.Timestamp.Format("15:04:05"), positions, stopTimes)
	return nil
}
