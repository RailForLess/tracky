package realtime

import (
	"context"
	"encoding/json"
	"strings"
	"testing"
	"time"

	"github.com/RailForLess/tracky/api/collector"
	"github.com/RailForLess/tracky/api/providers"
	"github.com/RailForLess/tracky/api/spec"
	"github.com/RailForLess/tracky/api/ws"
)

func TestProcessor_PublishesToHubInLegacyShape(t *testing.T) {
	hub := ws.NewHub()
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	go hub.Run(ctx)

	p := NewProcessor(hub, nil)
	snap := &collector.Snapshot{
		ProviderID: "amtrak",
		Timestamp:  time.Now(),
		Feed: &providers.RealtimeFeed{
			Positions: []spec.TrainPosition{{Provider: "amtrak", TripID: "1"}},
		},
	}
	if err := p.Process(ctx, snap); err != nil {
		t.Fatalf("process: %v", err)
	}

	// Snapshot is async — wait briefly for hub Run loop to land it.
	deadline := time.After(time.Second)
	for {
		if payload, ok := hub.Snapshot("o-amtrak"); ok {
			var u ws.RealtimeUpdate
			if err := json.Unmarshal(payload, &u); err != nil {
				t.Fatalf("unmarshal: %v", err)
			}
			if u.Type != "realtime_update" || u.Provider != "amtrak" || len(u.Positions) != 1 {
				t.Errorf("update wrong: %+v", u)
			}
			return
		}
		select {
		case <-deadline:
			t.Fatal("timed out waiting for hub snapshot")
		case <-time.After(10 * time.Millisecond):
		}
	}
}

func TestProcessor_ReturnsErrorForInvalidProviderID(t *testing.T) {
	p := NewProcessor(nil, nil)
	snap := &collector.Snapshot{
		ProviderID: "bad-provider",
		Feed:       &providers.RealtimeFeed{},
	}

	err := p.Process(context.Background(), snap)
	if err == nil {
		t.Fatal("process error = nil, want invalid provider id error")
	}
	if !strings.Contains(err.Error(), `realtime: invalid provider id "bad-provider"`) {
		t.Fatalf("process error = %v", err)
	}
}

func TestProcessor_ReturnsErrorWhenHubIsNil(t *testing.T) {
	p := NewProcessor(nil, nil)
	snap := &collector.Snapshot{
		ProviderID: "amtrak",
		Feed:       &providers.RealtimeFeed{},
	}

	err := p.Process(context.Background(), snap)
	if err == nil {
		t.Fatal("process error = nil, want hub initialization error")
	}
	if err.Error() != "realtime: hub is not initialized" {
		t.Fatalf("process error = %v", err)
	}
}
