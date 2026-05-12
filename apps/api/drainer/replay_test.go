package drainer

import (
	"context"
	"encoding/json"
	"errors"
	"sync"
	"testing"
	"time"

	"github.com/RailForLess/tracky/api/collector"
	"github.com/RailForLess/tracky/api/providers"
	"github.com/RailForLess/tracky/api/spec"
)

type recordingProcessor struct {
	mu      sync.Mutex
	seen    []string
	failOn  string
	failErr error
}

func (r *recordingProcessor) Process(_ context.Context, snap *collector.Snapshot) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	if snap.ProviderID == r.failOn {
		return r.failErr
	}
	r.seen = append(r.seen, snap.ProviderID)
	return nil
}

func mkItem(t *testing.T, provider string, ts time.Time) Item {
	t.Helper()
	snap := &collector.Snapshot{
		ProviderID: provider,
		Timestamp:  ts,
		Feed: &providers.RealtimeFeed{
			Positions: []spec.TrainPosition{{Provider: provider, TripID: "1"}},
		},
	}
	body, err := json.Marshal(snap)
	if err != nil {
		t.Fatal(err)
	}
	return Item{Key: snap.Key(), Body: body}
}

func TestReplay_AllSucceed(t *testing.T) {
	t0 := time.Date(2026, 5, 1, 12, 0, 0, 0, time.UTC)
	items := []Item{
		mkItem(t, "amtrak", t0),
		mkItem(t, "amtrak", t0.Add(time.Second)),
		mkItem(t, "brightline", t0),
	}
	proc := &recordingProcessor{}

	outcomes := Replay(t.Context(), items, proc)

	if len(outcomes) != 3 {
		t.Fatalf("outcomes = %d, want 3", len(outcomes))
	}
	for _, o := range outcomes {
		if o.Action != ActionDelete || o.ParseErr != nil || o.ProcessErr != nil {
			t.Errorf("outcome wrong: %+v", o)
		}
	}
	if got, want := proc.seen, []string{"amtrak", "amtrak", "brightline"}; !equalStrings(got, want) {
		t.Errorf("processed order = %v, want %v", got, want)
	}
}

func TestReplay_StopsOnProcessorErrorAndKeepsThatItem(t *testing.T) {
	t0 := time.Date(2026, 5, 1, 12, 0, 0, 0, time.UTC)
	items := []Item{
		mkItem(t, "amtrak", t0),
		mkItem(t, "metra", t0),
		mkItem(t, "brightline", t0), // never reached
	}
	proc := &recordingProcessor{failOn: "metra", failErr: errors.New("disk full")}

	outcomes := Replay(t.Context(), items, proc)

	if len(outcomes) != 2 {
		t.Fatalf("expected 2 outcomes (stopped at failure), got %d", len(outcomes))
	}
	if outcomes[0].Action != ActionDelete {
		t.Errorf("first outcome = %+v, want ActionDelete", outcomes[0])
	}
	last := outcomes[1]
	if last.Action != ActionKeep || last.ProcessErr == nil {
		t.Errorf("failing outcome = %+v, want ActionKeep + ProcessErr", last)
	}
	if !contains(last.Key, "metra") {
		t.Errorf("failing key = %s, expected metra blob", last.Key)
	}
}

func TestReplay_DiscardsCorruptJSONAndContinues(t *testing.T) {
	t0 := time.Date(2026, 5, 1, 12, 0, 0, 0, time.UTC)
	items := []Item{
		{Key: "backlog/amtrak/bad.bin", Body: []byte("{not json")},
		mkItem(t, "brightline", t0),
	}
	proc := &recordingProcessor{}

	outcomes := Replay(t.Context(), items, proc)

	if len(outcomes) != 2 {
		t.Fatalf("outcomes = %d, want 2 (corrupt should not stop the queue)", len(outcomes))
	}
	if outcomes[0].Action != ActionDelete || outcomes[0].ParseErr == nil {
		t.Errorf("corrupt outcome = %+v, want ActionDelete + ParseErr", outcomes[0])
	}
	if outcomes[1].Action != ActionDelete || outcomes[1].ParseErr != nil {
		t.Errorf("good outcome = %+v, want ActionDelete + no errors", outcomes[1])
	}
	if got, want := proc.seen, []string{"brightline"}; !equalStrings(got, want) {
		t.Errorf("processor saw %v, want %v (corrupt should be skipped, not processed)", got, want)
	}
}

func TestReplay_RespectsContextCancellation(t *testing.T) {
	t0 := time.Date(2026, 5, 1, 12, 0, 0, 0, time.UTC)
	items := []Item{mkItem(t, "amtrak", t0), mkItem(t, "amtrak", t0.Add(time.Second))}
	ctx, cancel := context.WithCancel(t.Context())
	cancel() // already cancelled

	outcomes := Replay(ctx, items, &recordingProcessor{})

	if len(outcomes) != 0 {
		t.Errorf("cancelled ctx should produce 0 outcomes, got %d", len(outcomes))
	}
}

func equalStrings(a, b []string) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}

func contains(s, sub string) bool {
	for i := 0; i+len(sub) <= len(s); i++ {
		if s[i:i+len(sub)] == sub {
			return true
		}
	}
	return false
}
