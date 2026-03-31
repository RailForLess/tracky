package routes

import (
	"encoding/json"
	"net/http"
	"sync"
	"time"

	"github.com/RailForLess/tracky/api/db"
	"github.com/RailForLess/tracky/api/providers"
)

// Setup registers all routes onto mux.
func Setup(mux *http.ServeMux, registry *providers.Registry, database *db.DB) {
	mux.HandleFunc("GET /debug/providers", handleListProviders(registry))
	mux.HandleFunc("GET /debug/providers/{id}/static", handleSyncStatic(registry))
	mux.HandleFunc("GET /debug/providers/{id}/realtime", handleSyncRealtime(registry))

	mux.HandleFunc("POST /sync/static", handleSyncAllStatic(registry, database))
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
			ID               string `json:"id"`
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

// handleSyncAllStatic fetches static GTFS data from all providers and saves to the database.
func handleSyncAllStatic(registry *providers.Registry, database *db.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		allProviders := registry.All()

		type fetchResult struct {
			providerID string
			feed       *providers.StaticFeed
			fetchErr   error
			fetchMs    int64
		}

		results := make([]fetchResult, len(allProviders))
		var wg sync.WaitGroup

		for i, p := range allProviders {
			wg.Add(1)
			go func(idx int, prov providers.Provider) {
				defer wg.Done()
				start := time.Now()
				feed, err := prov.FetchStatic(r.Context())
				results[idx] = fetchResult{
					providerID: prov.ID(),
					feed:       feed,
					fetchErr:   err,
					fetchMs:    time.Since(start).Milliseconds(),
				}
			}(i, p)
		}
		wg.Wait()

		type providerSummary struct {
			ProviderID string         `json:"providerId"`
			FetchMs    int64          `json:"fetchMs"`
			SaveMs     int64          `json:"saveMs"`
			Counts     *db.SyncCounts `json:"counts,omitempty"`
			Error      string         `json:"error,omitempty"`
		}

		totalStart := time.Now()
		summaries := make([]providerSummary, len(results))

		for i, res := range results {
			s := providerSummary{
				ProviderID: res.providerID,
				FetchMs:    res.fetchMs,
			}

			if res.fetchErr != nil {
				s.Error = res.fetchErr.Error()
				summaries[i] = s
				continue
			}

			saveStart := time.Now()
			counts, err := database.SaveStaticFeed(r.Context(), res.providerID, res.feed)
			s.SaveMs = time.Since(saveStart).Milliseconds()

			if err != nil {
				s.Error = err.Error()
			} else {
				s.Counts = &counts
			}

			summaries[i] = s
		}

		writeJSON(w, http.StatusOK, map[string]any{
			"totalMs":   time.Since(totalStart).Milliseconds(),
			"providers": summaries,
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
