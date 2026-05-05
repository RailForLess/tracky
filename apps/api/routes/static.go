package routes

import (
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/RailForLess/tracky/api/db"
)

// registerStatic wires every read endpoint exposed under /v1/.
func registerStatic(mux *http.ServeMux, d *db.DB) {
	mux.HandleFunc("GET /v1/providers/{provider}", handleGetProvider(d))

	mux.HandleFunc("GET /v1/stops/{provider}/{stopCode}", handleGetStop(d))
	mux.HandleFunc("GET /v1/stops", handleListStops(d))

	mux.HandleFunc("GET /v1/routes/{provider}/{routeCode}", handleGetRoute(d))
	mux.HandleFunc("GET /v1/routes", handleListRoutes(d))
	mux.HandleFunc("GET /v1/routes/{provider}/{routeCode}/trains", handleTrainsForRoute(d))

	mux.HandleFunc("GET /v1/trips/lookup", handleLookupTrips(d))
	mux.HandleFunc("GET /v1/trips/{tripId}/stops", handleTripStops(d))
	mux.HandleFunc("GET /v1/trips/{tripId}", handleGetTrip(d))

	mux.HandleFunc("GET /v1/departures", handleDepartures(d))
	mux.HandleFunc("GET /v1/connections", handleConnections(d))

	mux.HandleFunc("GET /v1/trains/{trainNumber}/service", handleTrainService(d))

	mux.HandleFunc("GET /v1/search", handleSearch(d))
}

// ── Helpers ─────────────────────────────────────────────────────────────

const cacheableSeconds = 3600

func setCacheable(w http.ResponseWriter) {
	w.Header().Set("Cache-Control", "public, max-age="+strconv.Itoa(cacheableSeconds))
}

func writeError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}

func notFound(w http.ResponseWriter, msg string) {
	writeError(w, http.StatusNotFound, msg)
}

func serverError(w http.ResponseWriter, err error) {
	writeError(w, http.StatusInternalServerError, err.Error())
}

func parseDate(s string) (string, bool) {
	if s == "" {
		return "", false
	}
	if _, err := time.Parse("2006-01-02", s); err != nil {
		return "", false
	}
	return s, true
}

// parseBBox accepts "minLon,minLat,maxLon,maxLat".
func parseBBox(s string) (db.BBox, bool) {
	if s == "" {
		return db.BBox{}, true
	}
	parts := strings.Split(s, ",")
	if len(parts) != 4 {
		return db.BBox{}, false
	}
	floats := make([]float64, 4)
	for i, p := range parts {
		v, err := strconv.ParseFloat(strings.TrimSpace(p), 64)
		if err != nil {
			return db.BBox{}, false
		}
		floats[i] = v
	}
	return db.BBox{
		MinLon: floats[0], MinLat: floats[1],
		MaxLon: floats[2], MaxLat: floats[3],
		Set: true,
	}, true
}

// ── Handlers ────────────────────────────────────────────────────────────

func handleGetProvider(d *db.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		provider := r.PathValue("provider")
		a, err := d.GetProvider(r.Context(), provider)
		if errors.Is(err, db.ErrNotFound) {
			notFound(w, "provider not found")
			return
		}
		if err != nil {
			serverError(w, err)
			return
		}
		setCacheable(w)
		writeJSON(w, http.StatusOK, a)
	}
}

func handleGetStop(d *db.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		provider := r.PathValue("provider")
		code := r.PathValue("stopCode")
		s, err := d.GetStopByCode(r.Context(), provider, code)
		if errors.Is(err, db.ErrNotFound) {
			notFound(w, "stop not found")
			return
		}
		if err != nil {
			serverError(w, err)
			return
		}
		setCacheable(w)
		writeJSON(w, http.StatusOK, s)
	}
}

func handleListStops(d *db.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		provider := r.URL.Query().Get("provider")
		if provider == "" {
			writeError(w, http.StatusBadRequest, "provider query param required")
			return
		}
		bbox, ok := parseBBox(r.URL.Query().Get("bbox"))
		if !ok {
			writeError(w, http.StatusBadRequest, "bbox must be minLon,minLat,maxLon,maxLat")
			return
		}
		stops, err := d.ListStops(r.Context(), provider, bbox)
		if err != nil {
			serverError(w, err)
			return
		}
		setCacheable(w)
		writeJSON(w, http.StatusOK, stops)
	}
}

func handleGetRoute(d *db.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		provider := r.PathValue("provider")
		code := r.PathValue("routeCode")
		route, err := d.GetRoute(r.Context(), provider+":"+code)
		if errors.Is(err, db.ErrNotFound) {
			notFound(w, "route not found")
			return
		}
		if err != nil {
			serverError(w, err)
			return
		}
		setCacheable(w)
		writeJSON(w, http.StatusOK, route)
	}
}

func handleListRoutes(d *db.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		provider := r.URL.Query().Get("provider")
		if provider == "" {
			writeError(w, http.StatusBadRequest, "provider query param required")
			return
		}
		routes, err := d.ListRoutes(r.Context(), provider)
		if err != nil {
			serverError(w, err)
			return
		}
		setCacheable(w)
		writeJSON(w, http.StatusOK, routes)
	}
}

func handleTrainsForRoute(d *db.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		provider := r.PathValue("provider")
		code := r.PathValue("routeCode")
		trains, err := d.GetTrainsForRoute(r.Context(), provider+":"+code)
		if err != nil {
			serverError(w, err)
			return
		}
		setCacheable(w)
		writeJSON(w, http.StatusOK, trains)
	}
}

func handleGetTrip(d *db.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tripID := r.PathValue("tripId")
		trip, err := d.GetTrip(r.Context(), tripID)
		if errors.Is(err, db.ErrNotFound) {
			notFound(w, "trip not found")
			return
		}
		if err != nil {
			serverError(w, err)
			return
		}
		setCacheable(w)
		writeJSON(w, http.StatusOK, trip)
	}
}

func handleTripStops(d *db.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tripID := r.PathValue("tripId")
		stops, err := d.GetTripStops(r.Context(), tripID)
		if err != nil {
			serverError(w, err)
			return
		}
		setCacheable(w)
		writeJSON(w, http.StatusOK, stops)
	}
}

func handleLookupTrips(d *db.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		q := r.URL.Query()
		provider := q.Get("provider")
		train := q.Get("train_number")
		date, ok := parseDate(q.Get("date"))
		if provider == "" || train == "" || !ok {
			writeError(w, http.StatusBadRequest, "provider, train_number, and date (YYYY-MM-DD) required")
			return
		}
		trips, err := d.LookupTripsByTrainNumber(r.Context(), provider, train, date)
		if err != nil {
			serverError(w, err)
			return
		}
		setCacheable(w)
		writeJSON(w, http.StatusOK, trips)
	}
}

func handleDepartures(d *db.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		q := r.URL.Query()
		stopID := q.Get("stop_id")
		date, ok := parseDate(q.Get("date"))
		if stopID == "" || !ok {
			writeError(w, http.StatusBadRequest, "stop_id and date (YYYY-MM-DD) required")
			return
		}
		departures, err := d.GetDepartures(r.Context(), stopID, date)
		if err != nil {
			serverError(w, err)
			return
		}
		setCacheable(w)
		writeJSON(w, http.StatusOK, departures)
	}
}

func handleConnections(d *db.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		q := r.URL.Query()
		from := q.Get("from_stop")
		to := q.Get("to_stop")
		date, ok := parseDate(q.Get("date"))
		if from == "" || to == "" || !ok {
			writeError(w, http.StatusBadRequest, "from_stop, to_stop, and date (YYYY-MM-DD) required")
			return
		}
		conns, err := d.GetConnections(r.Context(), from, to, date)
		if err != nil {
			serverError(w, err)
			return
		}
		setCacheable(w)
		writeJSON(w, http.StatusOK, conns)
	}
}

func handleTrainService(d *db.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		train := r.PathValue("trainNumber")
		q := r.URL.Query()
		provider := q.Get("provider")
		from := q.Get("from")
		to := q.Get("to")
		if provider == "" || train == "" {
			writeError(w, http.StatusBadRequest, "provider query param and trainNumber required")
			return
		}
		if from != "" {
			if _, ok := parseDate(from); !ok {
				writeError(w, http.StatusBadRequest, "from must be YYYY-MM-DD")
				return
			}
		}
		if to != "" {
			if _, ok := parseDate(to); !ok {
				writeError(w, http.StatusBadRequest, "to must be YYYY-MM-DD")
				return
			}
		}
		info, err := d.GetTrainService(r.Context(), provider, train, from, to)
		if errors.Is(err, db.ErrNotFound) {
			notFound(w, "train not found")
			return
		}
		if err != nil {
			serverError(w, err)
			return
		}
		setCacheable(w)
		writeJSON(w, http.StatusOK, info)
	}
}

func handleSearch(d *db.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		q := r.URL.Query()
		query := strings.TrimSpace(q.Get("q"))
		if query == "" {
			writeError(w, http.StatusBadRequest, "q is required")
			return
		}
		provider := q.Get("provider")
		types := q.Get("types")
		incStations, incTrains, incRoutes := true, true, true
		if types != "" {
			incStations, incTrains, incRoutes = false, false, false
			for _, t := range strings.Split(types, ",") {
				switch strings.TrimSpace(t) {
				case "station", "stations":
					incStations = true
				case "train", "trains":
					incTrains = true
				case "route", "routes":
					incRoutes = true
				}
			}
		}
		out, err := d.Search(r.Context(), provider, query, incStations, incTrains, incRoutes)
		if err != nil {
			serverError(w, err)
			return
		}
		setCacheable(w)
		writeJSON(w, http.StatusOK, out)
	}
}
