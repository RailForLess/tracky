package routes

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/Tracky-Trains/tracky/api/providers"
)

// Setup registers all routes onto mux.
func Setup(mux *http.ServeMux, registry *providers.Registry) {
	mux.HandleFunc("GET /debug/providers", handleListProviders(registry))
	mux.HandleFunc("GET /debug/providers/{id}/static", handleSyncStatic(registry))
	mux.HandleFunc("GET /debug/providers/{id}/realtime", handleSyncRealtime(registry))
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}

// handleListProviders returns all registered providers.
func handleListProviders(registry *providers.Registry) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		type entry struct {
			ID       string `json:"id"`
			StaticEndpoint   string `json:"static_endpoint"`
			RealtimeEndpoint string `json:"realtime_endpoint"`
		}
		all := registry.All()
		out := make([]entry, len(all))
		for i, p := range all {
			out[i] = entry{
				ID:               p.ID(),
				StaticEndpoint:   "/debug/providers/" + p.ID() + "/static",
				RealtimeEndpoint: "/debug/providers/" + p.ID() + "/realtime",
			}
		}
		writeJSON(w, http.StatusOK, out)
	}
}

// handleSyncStatic triggers a GTFS static fetch for the given provider.
func handleSyncStatic(registry *providers.Registry) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id := r.PathValue("id")
		p, ok := registry.Get(id)
		if !ok {
			writeJSON(w, http.StatusNotFound, map[string]string{"error": "provider not found"})
			return
		}

		start := time.Now()
		feed, err := p.FetchStatic(r.Context())
		elapsed := time.Since(start).Milliseconds()

		if err != nil {
			writeJSON(w, http.StatusBadGateway, map[string]any{
				"provider":   id,
				"error":      err.Error(),
				"elapsed_ms": elapsed,
			})
			return
		}

		writeJSON(w, http.StatusOK, map[string]any{
			"provider":   id,
			"elapsed_ms": elapsed,
			"data":       feed,
		})
	}
}

// handleSyncRealtime triggers a GTFS-RT fetch for the given provider.
func handleSyncRealtime(registry *providers.Registry) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id := r.PathValue("id")
		p, ok := registry.Get(id)
		if !ok {
			writeJSON(w, http.StatusNotFound, map[string]string{"error": "provider not found"})
			return
		}

		start := time.Now()
		feed, err := p.FetchRealtime(r.Context())
		elapsed := time.Since(start).Milliseconds()

		if err != nil {
			writeJSON(w, http.StatusBadGateway, map[string]any{
				"provider":   id,
				"error":      err.Error(),
				"elapsed_ms": elapsed,
			})
			return
		}

		writeJSON(w, http.StatusOK, map[string]any{
			"provider":   id,
			"elapsed_ms": elapsed,
			"data":       feed,
		})
	}
}
