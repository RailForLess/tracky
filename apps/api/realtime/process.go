// Package realtime is the on-prem ingest pipeline. Both the live HTTP
// /ingest handler and the Drainer (R2 backfill) call Processor.Process —
// keeping a single sink in front of the WebSocket hub and TimescaleDB.
package realtime

import (
	"context"
	"encoding/json"
	"fmt"
	"log"

	"github.com/RailForLess/tracky/api/collector"
	"github.com/RailForLess/tracky/api/db"
	"github.com/RailForLess/tracky/api/ids"
	"github.com/RailForLess/tracky/api/ws"
)

// Processor receives a Snapshot and pushes it into the live broadcast hub
// and (when DB is configured) the train_stop_times table for historical
// queries.
type Processor struct {
	Hub *ws.Hub
	DB  *db.DB // optional; nil disables persistence
}

func NewProcessor(hub *ws.Hub, d *db.DB) *Processor {
	return &Processor{Hub: hub, DB: d}
}

func (p *Processor) Process(ctx context.Context, snap *collector.Snapshot) error {
	if snap == nil || snap.Feed == nil {
		return fmt.Errorf("realtime: nil snapshot or feed")
	}

	// Topic is the operator's typed global id (o-<provider>) so that future
	// versions can also publish to route/trip/vehicle topics without renaming.
	topic, err := ids.Encode(ids.KindOperator, snap.ProviderID, "")
	if err != nil {
		return fmt.Errorf("realtime: invalid provider id %q: %w", snap.ProviderID, err)
	}
	payload, err := json.Marshal(ws.RealtimeUpdate{
		Type:      "realtime_update",
		Provider:  snap.ProviderID,
		Positions: snap.Feed.Positions,
	})
	if err != nil {
		return fmt.Errorf("realtime: marshal: %w", err)
	}
	p.Hub.Publish(topic, payload)

	if p.DB != nil && len(snap.Feed.StopTimes) > 0 {
		if err := p.DB.UpsertTrainStopTimes(ctx, snap.Feed.StopTimes); err != nil {
			// Persistence failure must not block the WS broadcast.
			log.Printf("realtime: persist stop_times for %s: %v", snap.ProviderID, err)
		}
	}

	// TODO(timescale): persist snap.Feed.Positions to a train_positions
	// hypertable so saved-train hydration can hit a single row instead of
	// subscribing to the WS feed and filtering.

	return nil
}
