package collector

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/RailForLess/tracky/api/providers"
	"github.com/RailForLess/tracky/api/spec"
)

func TestStorageEmitter_PutsToCorrectKey(t *testing.T) {
	var (
		mu     sync.Mutex
		gotKey string
		gotBody []byte
	)
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPut {
			t.Errorf("method = %s, want PUT", r.Method)
		}
		body, _ := io.ReadAll(r.Body)
		mu.Lock()
		gotKey = strings.TrimPrefix(r.URL.Path, "/")
		gotBody = body
		mu.Unlock()
		w.WriteHeader(http.StatusNoContent)
	}))
	defer srv.Close()

	em := NewStorageEmitter(srv.URL)
	snap := &Snapshot{
		ProviderID: "amtrak",
		Timestamp:  time.Date(2026, 5, 1, 12, 0, 0, 0, time.UTC),
		Feed:       &providers.RealtimeFeed{Positions: []spec.TrainPosition{{TripID: "1"}}},
	}
	if err := em.Emit(context.Background(), snap); err != nil {
		t.Fatalf("emit: %v", err)
	}
	mu.Lock()
	defer mu.Unlock()
	if gotKey != "backlog/amtrak/2026-05-01T12:00:00Z.bin" {
		t.Errorf("key = %s", gotKey)
	}
	var roundTrip Snapshot
	if err := json.Unmarshal(gotBody, &roundTrip); err != nil {
		t.Fatalf("body not valid JSON: %v", err)
	}
	if roundTrip.ProviderID != "amtrak" {
		t.Errorf("body provider = %s", roundTrip.ProviderID)
	}
}

func TestHTTPEmitter_PostsWithSecret(t *testing.T) {
	var gotSecret string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			t.Errorf("method = %s, want POST", r.Method)
		}
		if r.URL.Path != "/ingest" {
			t.Errorf("path = %s", r.URL.Path)
		}
		gotSecret = r.Header.Get(ingestSecretHeader)
		w.WriteHeader(http.StatusNoContent)
	}))
	defer srv.Close()

	em := NewHTTPEmitter(srv.URL+"/ingest", "shh")
	if err := em.Emit(context.Background(), &Snapshot{ProviderID: "x"}); err != nil {
		t.Fatalf("emit: %v", err)
	}
	if gotSecret != "shh" {
		t.Errorf("secret header = %q, want shh", gotSecret)
	}
}
