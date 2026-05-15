package routes

import (
	"encoding/json"
	"net/http"

	"github.com/RailForLess/tracky/api/db"
	"github.com/RailForLess/tracky/api/ids"
	"github.com/RailForLess/tracky/api/realtime"
	"github.com/RailForLess/tracky/api/ws"
)

// Setup registers all routes onto mux. database may be nil; when nil, the
// /v1/* read endpoints are not registered.
func Setup(mux *http.ServeMux, hub *ws.Hub, processor *realtime.Processor, database *db.DB, ingestSecret string) {
	mux.HandleFunc("POST /ingest", HandleIngest(processor, ingestSecret))

	// Currently-tracked runs, sourced from the hub snapshot. Future history
	// (past-day runs) will live at `/v1/trips/{trip_id}/runs?from=&to=` backed
	// by Timescale — this endpoint stays scoped to "live now".
	mux.HandleFunc("GET /v1/realtime", handleRealtimeRuns(hub))

	if database != nil {
		registerStatic(mux, database)
	}
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}

// Run identifies a single in-progress run, derived from the latest hub
// snapshot. A run is a trip × run_date instance — distinct from the scheduled
// trip template returned by /v1/trips.
type Run struct {
	ProviderID  string `json:"providerId"`  // bare provider for ergonomics
	TripID      string `json:"tripId"`      // t-amtrak-...
	RunDate     string `json:"runDate"`
	TrainNumber string `json:"trainNumber"`
	RouteID     string `json:"routeId"` // r-amtrak-...
}

// handleRealtimeRuns serves GET /v1/realtime?topic= — currently-tracked runs
// from the hub's most-recent snapshot for the given topic.
//
// The topic param accepts any well-formed global id (operator, route, trip,
// etc.), mirroring the WebSocket subscribe protocol. Today only operator
// topics ('o-<provider>') are published by the realtime processor; route/trip
// topics return empty until finer-grained fan-out lands.
func handleRealtimeRuns(hub *ws.Hub) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		topic := r.URL.Query().Get("topic")
		if topic == "" {
			writeError(w, http.StatusBadRequest, "topic query param required (typed global id)")
			return
		}
		if _, err := ids.Decode(topic); err != nil {
			writeError(w, http.StatusBadRequest, "topic must be a well-formed global id")
			return
		}

		out := struct {
			Runs []Run `json:"runs"`
		}{Runs: []Run{}}

		snapshot, ok := hub.Snapshot(topic)
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
			out.Runs = append(out.Runs, Run{
				ProviderID:  p.Provider,
				TripID:      p.TripID,
				RunDate:     p.RunDate.Format("2006-01-02"),
				TrainNumber: p.TrainNumber,
				RouteID:     p.RouteID,
			})
		}

		writeJSON(w, http.StatusOK, out)
	}
}
