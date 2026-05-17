package routes

import (
	"encoding/json"
	"net/http"

	"github.com/RailForLess/tracky/api/db"
	"github.com/RailForLess/tracky/api/ids"
	"github.com/RailForLess/tracky/api/realtime"
	"github.com/RailForLess/tracky/api/spec"
	"github.com/RailForLess/tracky/api/ws"
)

// Setup registers all routes onto mux. database may be nil; when nil, the
// /v1/* read endpoints are not registered.
func Setup(mux *http.ServeMux, hub *ws.Hub, processor *realtime.Processor, database *db.DB, ingestSecret string) {
	mux.HandleFunc("POST /ingest", HandleIngest(processor, ingestSecret))

	// Snapshot of currently-tracked positions for a topic. Returns the exact
	// same envelope shape that ws.RealtimeUpdate publishes — clients hitting
	// this endpoint and clients subscribing on the WS see byte-identical
	// payloads. Future history (past-day runs) will live at
	// `/v1/trips/{trip_id}/runs?from=&to=` backed by Timescale.
	mux.HandleFunc("GET /v1/realtime", handleRealtime(hub))

	if database != nil {
		registerStatic(mux, database)
	}
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}

// handleRealtime serves GET /v1/realtime?topic= — the latest cached snapshot
// for the given topic. The response shape is identical to ws.RealtimeUpdate
// so HTTP catch-up and WS streaming deliver the same data.
//
// The topic param accepts any well-formed global id (operator, route, trip,
// etc.), mirroring the WebSocket subscribe protocol. Today only operator
// topics ('o-<provider>') are published; route/trip topics return an empty
// envelope until finer-grained fan-out lands.
func handleRealtime(hub *ws.Hub) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		topic := r.URL.Query().Get("topic")
		if topic == "" {
			writeError(w, http.StatusBadRequest, "topic query param required (typed global id)")
			return
		}
		id, err := ids.Decode(topic)
		if err != nil {
			writeError(w, http.StatusBadRequest, "topic must be a well-formed global id")
			return
		}

		if snapshot, ok := hub.Snapshot(topic); ok {
			// Pass through — bytes are already RealtimeUpdate-shaped.
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusOK)
			w.Write(snapshot)
			return
		}

		// No snapshot yet — emit an empty envelope with the same shape so
		// clients have one code path.
		writeJSON(w, http.StatusOK, ws.RealtimeUpdate{
			Type:      "realtime_update",
			Provider:  id.Provider,
			Positions: []spec.TrainPosition{},
		})
	}
}
