// Package realtime is the on-prem ingest pipeline. Both the live HTTP
// /ingest handler and the Drainer (R2 backfill) call Processor.Process —
// keeping a single sink in front of the WebSocket hub and (eventually)
// TimescaleDB.
package realtime

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/RailForLess/tracky/api/collector"
	"github.com/RailForLess/tracky/api/ws"
)

// Processor receives a Snapshot and pushes it into the live broadcast hub
// and (TODO) the TimescaleDB hypertables for historical queries.
type Processor struct {
	Hub *ws.Hub
}

func NewProcessor(hub *ws.Hub) *Processor {
	return &Processor{Hub: hub}
}

func (p *Processor) Process(_ context.Context, snap *collector.Snapshot) error {
	if snap == nil || snap.Feed == nil {
		return fmt.Errorf("realtime: nil snapshot or feed")
	}

	// Wire format matches the existing ws.RealtimeUpdate so iOS clients
	// see no change vs. the legacy in-process poller.
	payload, err := json.Marshal(ws.RealtimeUpdate{
		Type:      "realtime_update",
		Provider:  snap.ProviderID,
		Positions: snap.Feed.Positions,
	})
	if err != nil {
		return fmt.Errorf("realtime: marshal: %w", err)
	}
	p.Hub.Publish(snap.ProviderID, payload)

	// TODO(timescale): persist snap.Feed.Positions and snap.Feed.StopTimes
	// to vehicle_positions / trip_stop_times hypertables once the schema
	// exists. Until then the Drainer's only effect is to replay onto the
	// hub for any clients connected at replay time.

	return nil
}
