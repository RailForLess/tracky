package routes

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/RailForLess/tracky/api/collector"
	"github.com/RailForLess/tracky/api/providers"
	"github.com/RailForLess/tracky/api/realtime"
	"github.com/RailForLess/tracky/api/spec"
	"github.com/RailForLess/tracky/api/ws"
)

func setup(t *testing.T, secret string) (*httptest.Server, *ws.Hub) {
	t.Helper()
	hub := ws.NewHub()
	ctx, cancel := context.WithCancel(context.Background())
	t.Cleanup(cancel)
	go hub.Run(ctx)

	mux := http.NewServeMux()
	mux.HandleFunc("POST /ingest", HandleIngest(realtime.NewProcessor(hub, nil), secret))
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)
	return srv, hub
}

func snapshotJSON(t *testing.T) []byte {
	t.Helper()
	body, err := json.Marshal(&collector.Snapshot{
		ProviderID: "amtrak",
		Timestamp:  time.Now().UTC(),
		Feed: &providers.RealtimeFeed{
			Positions: []spec.TrainPosition{{Provider: "amtrak", TripID: "1"}},
		},
	})
	if err != nil {
		t.Fatal(err)
	}
	return body
}

func TestIngest_Accepts204(t *testing.T) {
	srv, hub := setup(t, "")
	resp, err := http.Post(srv.URL+"/ingest", "application/json", bytes.NewReader(snapshotJSON(t)))
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusNoContent {
		t.Fatalf("status = %d", resp.StatusCode)
	}
	// Hub publish is async — wait briefly.
	for range 50 {
		if _, ok := hub.Snapshot("amtrak"); ok {
			return
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatal("hub never received snapshot")
}

func TestIngest_RejectsBadSecret(t *testing.T) {
	srv, _ := setup(t, "shh")

	req, _ := http.NewRequest(http.MethodPost, srv.URL+"/ingest", bytes.NewReader(snapshotJSON(t)))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Tracky-Ingest-Secret", "wrong")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusUnauthorized {
		t.Errorf("status = %d, want 401", resp.StatusCode)
	}
}

func TestIngest_AcceptsCorrectSecret(t *testing.T) {
	srv, _ := setup(t, "shh")
	req, _ := http.NewRequest(http.MethodPost, srv.URL+"/ingest", bytes.NewReader(snapshotJSON(t)))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Tracky-Ingest-Secret", "shh")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusNoContent {
		t.Errorf("status = %d, want 204", resp.StatusCode)
	}
}

func TestIngest_RejectsBadJSON(t *testing.T) {
	srv, _ := setup(t, "")
	resp, err := http.Post(srv.URL+"/ingest", "application/json", bytes.NewReader([]byte("garbage")))
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusBadRequest {
		t.Errorf("status = %d, want 400", resp.StatusCode)
	}
}
