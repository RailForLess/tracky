package collector

import (
	"context"
	"errors"
	"sync"
	"testing"
	"time"

	"github.com/RailForLess/tracky/api/providers"
	"github.com/RailForLess/tracky/api/spec"
)

type fakeProvider struct {
	id    string
	mu    sync.Mutex
	feeds []*providers.RealtimeFeed
	idx   int
}

func (f *fakeProvider) ID() string        { return f.id }
func (f *fakeProvider) StaticURL() string { return "" }

func (f *fakeProvider) FetchStatic(_ context.Context) (*providers.StaticFeed, error) {
	return &providers.StaticFeed{}, nil
}

func (f *fakeProvider) FetchRealtime(_ context.Context) (*providers.RealtimeFeed, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if len(f.feeds) == 0 {
		return nil, errors.New("fakeProvider: no realtime feeds configured")
	}
	if f.idx >= len(f.feeds) {
		return f.feeds[len(f.feeds)-1], nil
	}
	feed := f.feeds[f.idx]
	f.idx++
	return feed, nil
}

type recordingEmitter struct {
	mu      sync.Mutex
	snaps   []*Snapshot
	signal  chan struct{}
	failN   int // first N calls return error
	calls   int
	failErr error
}

func (r *recordingEmitter) Emit(_ context.Context, snap *Snapshot) error {
	r.mu.Lock()
	r.calls++
	if r.failN > 0 && r.calls <= r.failN {
		r.mu.Unlock()
		return r.failErr
	}
	r.snaps = append(r.snaps, snap)
	r.mu.Unlock()
	if r.signal != nil {
		select {
		case r.signal <- struct{}{}:
		default:
		}
	}
	return nil
}

func (r *recordingEmitter) snapshot() []*Snapshot {
	r.mu.Lock()
	defer r.mu.Unlock()
	out := make([]*Snapshot, len(r.snaps))
	copy(out, r.snaps)
	return out
}

func mkPos(tripID string) spec.TrainPosition {
	return spec.TrainPosition{Provider: "fake", TripID: tripID}
}

func waitFor(t *testing.T, em *recordingEmitter, want int, timeout time.Duration) {
	t.Helper()
	deadline := time.After(timeout)
	for {
		if len(em.snapshot()) >= want {
			return
		}
		select {
		case <-em.signal:
		case <-deadline:
			t.Fatalf("timed out waiting for %d snapshots, got %d", want, len(em.snapshot()))
		}
	}
}

func TestStartPoller_EmitsOneSnapshotPerTick(t *testing.T) {
	feed := &providers.RealtimeFeed{Positions: []spec.TrainPosition{mkPos("A"), mkPos("B")}}
	em := &recordingEmitter{signal: make(chan struct{}, 8)}
	p := &fakeProvider{id: "fake", feeds: []*providers.RealtimeFeed{feed, feed, feed}}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	done := make(chan struct{})
	go func() {
		StartPoller(ctx, p, em, 20*time.Millisecond)
		close(done)
	}()
	waitFor(t, em, 3, time.Second)
	cancel()
	select {
	case <-done:
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for StartPoller to stop after cancel")
	}

	for _, s := range em.snapshot() {
		if s.ProviderID != "fake" {
			t.Errorf("ProviderID = %s, want fake", s.ProviderID)
		}
		if s.Feed == nil || len(s.Feed.Positions) != 2 {
			t.Errorf("snapshot feed wrong: %+v", s.Feed)
		}
	}
}

func TestSnapshotKey_OperatorFirstSortable(t *testing.T) {
	t0 := time.Date(2026, 5, 1, 12, 0, 0, 0, time.UTC)
	a := (&Snapshot{ProviderID: "amtrak", Timestamp: t0}).Key()
	b := (&Snapshot{ProviderID: "amtrak", Timestamp: t0.Add(time.Second)}).Key()
	c := (&Snapshot{ProviderID: "metra", Timestamp: t0}).Key()
	if a >= b {
		t.Errorf("expected %s < %s (sortable by timestamp within operator)", a, b)
	}
	if a >= c {
		t.Errorf("expected %s < %s (sortable across operators by name)", a, c)
	}
	if a != "backlog/amtrak/2026-05-01T12:00:00Z.bin" {
		t.Errorf("key shape changed: %s", a)
	}
}

func TestFallbackEmitter_PrimarySuccessSkipsFallback(t *testing.T) {
	primary := &recordingEmitter{}
	fallback := &recordingEmitter{}
	chain := &FallbackEmitter{Primary: primary, Fallback: fallback}

	err := chain.Emit(context.Background(), &Snapshot{ProviderID: "x"})
	if err != nil {
		t.Fatalf("emit: %v", err)
	}
	if len(primary.snapshot()) != 1 {
		t.Errorf("primary calls = %d, want 1", len(primary.snapshot()))
	}
	if len(fallback.snapshot()) != 0 {
		t.Errorf("fallback should not have been called, got %d", len(fallback.snapshot()))
	}
}

func TestFallbackEmitter_PrimaryFailureUsesFallback(t *testing.T) {
	primary := &recordingEmitter{failN: 99, failErr: errors.New("on-prem down")}
	fallback := &recordingEmitter{}
	chain := &FallbackEmitter{Primary: primary, Fallback: fallback}

	err := chain.Emit(context.Background(), &Snapshot{ProviderID: "x"})
	if err != nil {
		t.Fatalf("expected fallback to succeed, got %v", err)
	}
	if len(fallback.snapshot()) != 1 {
		t.Errorf("fallback calls = %d, want 1", len(fallback.snapshot()))
	}
}

func TestFallbackEmitter_BothFailReturnsError(t *testing.T) {
	primary := &recordingEmitter{failN: 99, failErr: errors.New("on-prem down")}
	fallback := &recordingEmitter{failN: 99, failErr: errors.New("r2 down")}
	chain := &FallbackEmitter{Primary: primary, Fallback: fallback}

	err := chain.Emit(context.Background(), &Snapshot{ProviderID: "x"})
	if err == nil {
		t.Fatalf("expected error when both fail")
	}
}
