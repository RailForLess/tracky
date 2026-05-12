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
	mux.HandleFunc("GET /v1/active", handleActiveTrains(hub))

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

// ActiveTrain identifies a single in-progress run, derived from the latest
// hub snapshot. Used by clients (e.g. the "live only" filter in the mobile
// trip search) to know which runs are currently being tracked without
// needing a full WebSocket subscription.
type ActiveTrain struct {
	Provider    string `json:"provider"`
	TripID      string `json:"tripId"`
	RunDate     string `json:"runDate"`
	TrainNumber string `json:"trainNumber"`
	RouteID     string `json:"routeId"`
}

// handleActiveTrains returns the set of currently-tracked runs for a provider,
// sourced from the most-recent realtime snapshot the hub has published.
//
// GET /v1/active?provider=amtrak → { activeTrains: [...] }
func handleActiveTrains(hub *ws.Hub) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		provider := r.URL.Query().Get("provider")
		if provider == "" {
			writeError(w, http.StatusBadRequest, "provider query param required")
			return
		}

		out := struct {
			ActiveTrains []ActiveTrain `json:"activeTrains"`
		}{ActiveTrains: []ActiveTrain{}}

		snapshot, ok := hub.Snapshot(provider)
		if !ok {
			// No realtime data yet — return empty list (not an error).
			writeJSON(w, http.StatusOK, out)
			return
		}

		var update ws.RealtimeUpdate
		if err := json.Unmarshal(snapshot, &update); err != nil {
			serverError(w, err)
			return
		}

		for _, p := range update.Positions {
			out.ActiveTrains = append(out.ActiveTrains, ActiveTrain{
				Provider:    p.Provider,
				TripID:      p.TripID,
				RunDate:     p.RunDate.Format("2006-01-02"),
				TrainNumber: p.TrainNumber,
				RouteID:     p.RouteID,
			})
		}

		writeJSON(w, http.StatusOK, out)
	}
}
