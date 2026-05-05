package routes

import (
	"encoding/json"
	"net/http"

	"github.com/RailForLess/tracky/api/db"
	"github.com/RailForLess/tracky/api/realtime"
	"github.com/RailForLess/tracky/api/ws"
)

// Setup registers all routes onto mux. database may be nil; when nil, the
// /v1/* read endpoints are not registered.
func Setup(mux *http.ServeMux, hub *ws.Hub, processor *realtime.Processor, database *db.DB, ingestSecret string) {
	mux.HandleFunc("POST /ingest", HandleIngest(processor, ingestSecret))
	mux.HandleFunc("GET /debug/providers/{id}/realtime", handleSyncRealtime(hub))

	if database != nil {
		registerStatic(mux, database)
	}
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
