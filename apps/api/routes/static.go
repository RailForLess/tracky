package routes

import (
	"errors"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/RailForLess/tracky/api/db"
	"github.com/RailForLess/tracky/api/ids"
)

// registerStatic wires every read endpoint exposed under /v1/.
//
// Resources are addressed by typed global ids — see apps/api/ids/. The provider
// segment is no longer in the URL path; it lives inside the id.
func registerStatic(mux *http.ServeMux, d *db.DB) {
	mux.HandleFunc("GET /v1/providers/{providerID}", handleGetProvider(d))

	// Polymorphic: 's-' returns a Stop, 'h-' (when implemented) returns a Hub.
	mux.HandleFunc("GET /v1/stops/{stopID}", handleGetStop(d))
	// Spatial / list. Accepts either ?bbox=... or ?lat=&lon=&radius_m=.
	mux.HandleFunc("GET /v1/stops", handleListStops(d))
	mux.HandleFunc("GET /v1/stops/{stopID}/departures", handleDepartures(d))

	mux.HandleFunc("GET /v1/routes/{routeID}", handleGetRoute(d))
	mux.HandleFunc("GET /v1/routes", handleListRoutes(d))
	mux.HandleFunc("GET /v1/routes/{routeID}/trips", handleTripsForRoute(d))

	// Scheduled-trip lookup by train number on a service date. Realtime "what
	// is currently running" lives at /v1/realtime (wired in routes.go).
	mux.HandleFunc("GET /v1/trips", handleListTripsByLookup(d))
	mux.HandleFunc("GET /v1/trips/service", handleTrainService(d))
	mux.HandleFunc("GET /v1/trips/{tripID}/stops", handleTripStops(d))
	mux.HandleFunc("GET /v1/trips/{tripID}", handleGetTrip(d))

	mux.HandleFunc("GET /v1/trips/{tripID}/runs/{runDate}/stops", handleRunStops(d))

	mux.HandleFunc("GET /v1/connections", handleConnections(d))

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
	log.Printf("server error: %v", err)
	writeError(w, http.StatusInternalServerError, "internal server error")
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

func parseFloat(s string) (float64, bool) {
	if s == "" {
		return 0, false
	}
	v, err := strconv.ParseFloat(strings.TrimSpace(s), 64)
	if err != nil {
		return 0, false
	}
	return v, true
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

// decodePath parses a path-segment global id and writes a 400 if malformed
// or 400 if the kind doesn't match `want`. Returns (parsed, false) on error.
func decodePath(w http.ResponseWriter, raw string, want ids.Kind, label string) (ids.ID, bool) {
	id, err := ids.Decode(raw)
	if err != nil {
		writeError(w, http.StatusBadRequest, label+": invalid id format")
		return ids.ID{}, false
	}
	if id.Kind != want {
		writeError(w, http.StatusBadRequest, label+": expected "+string(want)+"- prefix, got "+string(id.Kind)+"-")
		return ids.ID{}, false
	}
	return id, true
}

// providerFromQuery returns the bare provider id from a query param holding a
// typed operator id ('o-amtrak'). Empty input yields ("", true) — callers
// that require the filter must reject it themselves. Any non-empty value that
// isn't a well-formed operator id is rejected.
func providerFromQuery(raw string) (string, bool) {
	if raw == "" {
		return "", true
	}
	id, err := ids.Decode(raw)
	if err != nil || id.Kind != ids.KindOperator {
		return "", false
	}
	return id.Provider, true
}

// ── Handlers ────────────────────────────────────────────────────────────

func handleGetProvider(d *db.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw := r.PathValue("providerID")
		id, ok := decodePath(w, raw, ids.KindOperator, "provider id")
		if !ok {
			return
		}
		a, err := d.GetProvider(r.Context(), id.Provider)
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

// handleGetStop is polymorphic: returns a Stop for 's-' ids and a Hub for 'h-'.
// The JSON response carries a `type` discriminator so clients can use a
// discriminated union.
func handleGetStop(d *db.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw := r.PathValue("stopID")
		id, err := ids.Decode(raw)
		if err != nil {
			writeError(w, http.StatusBadRequest, "stop id: invalid id format")
			return
		}
		switch id.Kind {
		case ids.KindStop:
			s, err := d.GetStop(r.Context(), raw)
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
		case ids.KindHub:
			h, err := d.GetHub(r.Context(), raw)
			if errors.Is(err, db.ErrNotFound) {
				// Until hubs are ingested this is the steady-state response.
				writeError(w, http.StatusNotImplemented, "hubs are not yet supported")
				return
			}
			if err != nil {
				serverError(w, err)
				return
			}
			setCacheable(w)
			writeJSON(w, http.StatusOK, h)
		default:
			writeError(w, http.StatusBadRequest, "stop id: expected s- or h- prefix, got "+string(id.Kind)+"-")
		}
	}
}

// handleListStops serves both the bbox query (?bbox=) and the nearby query
// (?lat=&lon=&radius_m=). At least one shape is required.
func handleListStops(d *db.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		q := r.URL.Query()
		provider, ok := providerFromQuery(q.Get("provider_id"))
		if !ok {
			writeError(w, http.StatusBadRequest, "provider_id must be an o- prefixed operator id")
			return
		}

		// Nearby: lat/lon required, radius optional.
		latRaw := q.Get("lat")
		lonRaw := q.Get("lon")
		if latRaw != "" || lonRaw != "" {
			lat, latOK := parseFloat(latRaw)
			lon, lonOK := parseFloat(lonRaw)
			if !latOK || !lonOK || lat < -90 || lat > 90 || lon < -180 || lon > 180 {
				writeError(w, http.StatusBadRequest, "lat and lon are required (lat in [-90,90], lon in [-180,180])")
				return
			}
			radius := 5000.0
			if raw := q.Get("radius_m"); raw != "" {
				v, ok := parseFloat(raw)
				if !ok || v <= 0 {
					writeError(w, http.StatusBadRequest, "radius_m must be a positive number")
					return
				}
				radius = v
			}
			if radius > 50000 {
				radius = 50000
			}
			stops, err := d.ListStopsNearby(r.Context(), lat, lon, radius, provider)
			if err != nil {
				serverError(w, err)
				return
			}
			setCacheable(w)
			writeJSON(w, http.StatusOK, stops)
			return
		}

		// Bbox / list mode: provider required.
		if provider == "" {
			writeError(w, http.StatusBadRequest, "provider_id required when not using lat/lon")
			return
		}
		bbox, bboxOK := parseBBox(q.Get("bbox"))
		if !bboxOK {
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
		raw := r.PathValue("routeID")
		if _, ok := decodePath(w, raw, ids.KindRoute, "route id"); !ok {
			return
		}
		route, err := d.GetRoute(r.Context(), raw)
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
		provider, ok := providerFromQuery(r.URL.Query().Get("provider_id"))
		if !ok {
			writeError(w, http.StatusBadRequest, "provider_id must be an o- prefixed operator id")
			return
		}
		if provider == "" {
			writeError(w, http.StatusBadRequest, "provider_id query param required")
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

func handleTripsForRoute(d *db.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw := r.PathValue("routeID")
		if _, ok := decodePath(w, raw, ids.KindRoute, "route id"); !ok {
			return
		}
		trips, err := d.GetTripsForRoute(r.Context(), raw)
		if err != nil {
			serverError(w, err)
			return
		}
		setCacheable(w)
		writeJSON(w, http.StatusOK, trips)
	}
}

func handleGetTrip(d *db.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw := r.PathValue("tripID")
		if _, ok := decodePath(w, raw, ids.KindTrip, "trip id"); !ok {
			return
		}
		trip, err := d.GetTrip(r.Context(), raw)
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
		raw := r.PathValue("tripID")
		if _, ok := decodePath(w, raw, ids.KindTrip, "trip id"); !ok {
			return
		}
		stops, err := d.GetTripStops(r.Context(), raw)
		if err != nil {
			serverError(w, err)
			return
		}
		setCacheable(w)
		writeJSON(w, http.StatusOK, stops)
	}
}

// handleListTripsByLookup serves GET /v1/trips?train_number=&date= — scheduled
// trips for a service date. Currently-running trips are at /v1/realtime.
func handleListTripsByLookup(d *db.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		q := r.URL.Query()
		provider, providerOK := providerFromQuery(q.Get("provider_id"))
		train := q.Get("train_number")
		date, ok := parseDate(q.Get("date"))
		if !providerOK || provider == "" || train == "" || !ok {
			writeError(w, http.StatusBadRequest, "provider_id, train_number, and date (YYYY-MM-DD) required")
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
		raw := r.PathValue("stopID")
		id, err := ids.Decode(raw)
		if err != nil {
			writeError(w, http.StatusBadRequest, "stop id: invalid id format")
			return
		}
		if id.Kind != ids.KindStop && id.Kind != ids.KindHub {
			writeError(w, http.StatusBadRequest, "stop id: expected s- or h- prefix")
			return
		}
		if id.Kind == ids.KindHub {
			writeError(w, http.StatusNotImplemented, "hub departures are not yet supported")
			return
		}
		date, ok := parseDate(r.URL.Query().Get("date"))
		if !ok {
			writeError(w, http.StatusBadRequest, "date (YYYY-MM-DD) required")
			return
		}
		departures, err := d.GetDepartures(r.Context(), raw, date)
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
		if fid, err := ids.Decode(from); err != nil || fid.Kind != ids.KindStop {
			writeError(w, http.StatusBadRequest, "from_stop must be an s- prefixed stop id")
			return
		}
		if tid, err := ids.Decode(to); err != nil || tid.Kind != ids.KindStop {
			writeError(w, http.StatusBadRequest, "to_stop must be an s- prefixed stop id")
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
		q := r.URL.Query()
		provider, providerOK := providerFromQuery(q.Get("provider_id"))
		train := q.Get("train_number")
		from := q.Get("from")
		to := q.Get("to")
		if !providerOK || provider == "" || train == "" {
			writeError(w, http.StatusBadRequest, "provider_id and train_number required")
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

func handleRunStops(d *db.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw := r.PathValue("tripID")
		id, ok := decodePath(w, raw, ids.KindTrip, "trip id")
		if !ok {
			return
		}
		runDate, ok := parseDate(r.PathValue("runDate"))
		if !ok {
			writeError(w, http.StatusBadRequest, "runDate must be YYYY-MM-DD")
			return
		}
		stops, err := d.GetRunStops(r.Context(), id.Provider, raw, runDate)
		if errors.Is(err, db.ErrNotFound) {
			notFound(w, "run not found")
			return
		}
		if err != nil {
			serverError(w, err)
			return
		}
		// No setCacheable: this view changes with every realtime poll.
		writeJSON(w, http.StatusOK, stops)
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
		provider, ok := providerFromQuery(q.Get("provider_id"))
		if !ok {
			writeError(w, http.StatusBadRequest, "provider_id must be an o- prefixed operator id")
			return
		}
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
