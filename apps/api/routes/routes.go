package routes

import (
	"encoding/json"
	"net/http"

	"github.com/RailForLess/tracky/api/realtime"
	"github.com/RailForLess/tracky/api/ws"
)

// Setup registers all routes onto mux.
func Setup(mux *http.ServeMux, hub *ws.Hub, processor *realtime.Processor, ingestSecret string) {
	mux.HandleFunc("POST /ingest", HandleIngest(processor, ingestSecret))
	mux.HandleFunc("GET /debug/providers/{id}/realtime", handleSyncRealtime(hub))
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}

// handleSyncRealtime returns the cached realtime snapshot for a provider.
func handleSyncRealtime(hub *ws.Hub) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id := r.PathValue("id")
		snapshot, ok := hub.Snapshot(id)
		if !ok {
			writeJSON(w, http.StatusServiceUnavailable, map[string]string{
				"error": "no realtime data yet for provider " + id,
			})
			return
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		w.Write(snapshot)
	}
}
