package db

import (
	"context"
	"errors"
	"fmt"
	"math"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/RailForLess/tracky/api/spec"
)

// ErrNotFound is returned by single-row read methods when no row matches.
var ErrNotFound = errors.New("not found")

// EnrichedStopTime joins a scheduled_stop_times row with the stop's name/code.
// Used by /v1/trips/:tripId/stops and the connection/departure responses.
type EnrichedStopTime struct {
	spec.ScheduledStopTime
	StopName string `json:"stopName"`
	StopCode string `json:"stopCode"`
}

// DepartureItem is a row for /v1/departures: a trip visiting the requested
// stop on the requested date, with arrival/departure at that stop.
type DepartureItem struct {
	spec.Trip
	ArrivalTime   *string `json:"arrivalTime"`
	DepartureTime *string `json:"departureTime"`
	StopSequence  int     `json:"stopSequence"`
}

// ConnectionItem is a single trip in /v1/connections: trip metadata plus the
// from/to stop times and the ordered intermediate stops between them.
type ConnectionItem struct {
	spec.Trip
	From          EnrichedStopTime   `json:"from"`
	To            EnrichedStopTime   `json:"to"`
	Intermediate  []EnrichedStopTime `json:"intermediate"`
}

// TrainItem is a unique train number on a route, with sample display info.
type TrainItem struct {
	ProviderID    string `json:"providerId"`
	TrainNumber   string `json:"trainNumber"`
	SampleHeadsign string `json:"sampleHeadsign"`
	TripCount     int    `json:"tripCount"`
}

// ServiceInfo is the date range during which a train (short_name) operates.
type ServiceInfo struct {
	ProviderID  string `json:"providerId"`
	TrainNumber string `json:"trainNumber"`
	MinDate     string `json:"minDate"` // YYYY-MM-DD
	MaxDate     string `json:"maxDate"`
}

// SearchHit is a single result in /v1/search.
type SearchHit struct {
	Type     string `json:"type"`     // "station" | "train" | "route"
	ID       string `json:"id"`       // namespaced where applicable
	Name     string `json:"name"`
	Subtitle string `json:"subtitle"`
	Provider string `json:"provider"`
}

// SearchResult groups search hits by category, matching the legacy frontend
// searchUnified() output.
type SearchResult struct {
	Stations []SearchHit `json:"stations"`
	Trains   []SearchHit `json:"trains"`
	Routes   []SearchHit `json:"routes"`
}

// ── Single-row reads ───────────────────────────────────────────────────────

// GetProvider returns the agency row for providerID. When the provider's
// GTFS feed contains multiple agencies (e.g. Amtrak ships rail + 19 thruway
// bus operators), we prefer the one whose name matches the provider id
// after stripping spaces and dashes.
func (d *DB) GetProvider(ctx context.Context, providerID string) (*spec.Agency, error) {
	row := d.pool.QueryRow(ctx, `
		SELECT provider_id, gtfs_agency_id, name, url, timezone, lang, phone, country
		FROM agencies
		WHERE provider_id = $1
		ORDER BY
		    CASE
		        WHEN replace(replace(lower(name), '-', ''), ' ', '') = $1 THEN 0
		        WHEN lower(name) LIKE lower($1) || '%' THEN 1
		        ELSE 2
		    END,
		    gtfs_agency_id
		LIMIT 1`, providerID)
	var a spec.Agency
	if err := row.Scan(&a.ProviderID, &a.GtfsAgencyID, &a.Name, &a.URL, &a.Timezone, &a.Lang, &a.Phone, &a.Country); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return &a, nil
}

// GetStop returns a stop by its typed global id (e.g. 's-amtrak-CHI').
func (d *DB) GetStop(ctx context.Context, stopID string) (*spec.Stop, error) {
	row := d.pool.QueryRow(ctx, `
		SELECT stop_id, provider_id, code, name, lat, lon, timezone, wheelchair_boarding
		FROM stops WHERE stop_id = $1`, stopID)
	s := spec.Stop{Type: spec.StopTypeStop}
	if err := row.Scan(&s.StopID, &s.ProviderID, &s.Code, &s.Name, &s.Lat, &s.Lon, &s.Timezone, &s.WheelchairBoarding); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return &s, nil
}

// GetHub returns a meta-station (hub) by its typed global id (e.g. 'h-amtrak-CHI').
//
// Stubbed: the hubs table doesn't exist yet, so this always returns ErrNotFound.
// The signature is in place so the polymorphic /v1/stops/{id} handler can wire
// to it once dedup is implemented.
func (d *DB) GetHub(_ context.Context, _ string) (*spec.Hub, error) {
	return nil, ErrNotFound
}

// GetRoute returns a route by its full namespaced route_id.
func (d *DB) GetRoute(ctx context.Context, routeID string) (*spec.Route, error) {
	row := d.pool.QueryRow(ctx, `
		SELECT route_id, provider_id, short_name, long_name, color, text_color, shape_id
		FROM routes WHERE route_id = $1`, routeID)
	var r spec.Route
	if err := row.Scan(&r.RouteID, &r.ProviderID, &r.ShortName, &r.LongName, &r.Color, &r.TextColor, &r.ShapeID); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return &r, nil
}

// GetTrip returns a single trip by namespaced trip_id.
func (d *DB) GetTrip(ctx context.Context, tripID string) (*spec.Trip, error) {
	row := d.pool.QueryRow(ctx, `
		SELECT trip_id, provider_id, route_id, service_id, short_name, headsign, shape_id, direction_id
		FROM trips WHERE trip_id = $1`, tripID)
	var t spec.Trip
	if err := row.Scan(&t.TripID, &t.ProviderID, &t.RouteID, &t.ServiceID, &t.ShortName, &t.Headsign, &t.ShapeID, &t.DirectionID); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return &t, nil
}

// ── List reads ─────────────────────────────────────────────────────────────

// BBox is a viewport filter. A zero-value BBox is treated as "no filter".
type BBox struct {
	MinLon, MinLat, MaxLon, MaxLat float64
	Set                            bool
}

// ListStopsNearby returns up to 100 stops within radiusM metres of (lat, lon),
// ordered by distance ascending. provider is optional ("" = all providers).
//
// A simple lat/lon bounding box prefilters the search before the haversine
// refine, so even without a spatial index we don't full-scan the table.
func (d *DB) ListStopsNearby(ctx context.Context, lat, lon, radiusM float64, provider string) ([]spec.Stop, error) {
	latDelta := radiusM / 111_000.0
	cosLat := math.Cos(lat * math.Pi / 180.0)
	if cosLat < 1e-6 {
		cosLat = 1e-6 // avoid divide-by-zero at the poles
	}
	lonDelta := radiusM / (111_000.0 * cosLat)

	args := []any{
		lat - latDelta, lat + latDelta, // $1, $2
		lon - lonDelta, lon + lonDelta, // $3, $4
		lat, lon, // $5, $6
		radiusM, // $7
	}
	where := "lat BETWEEN $1 AND $2 AND lon BETWEEN $3 AND $4"
	if provider != "" {
		args = append(args, provider) // $8
		where += " AND provider_id = $8"
	}

	q := `
		SELECT stop_id, provider_id, code, name, lat, lon, timezone, wheelchair_boarding
		FROM stops
		WHERE ` + where + `
		  AND 111000.0 * 2 * asin(sqrt(
		          power(sin(radians(lat - $5)/2), 2) +
		          cos(radians($5)) * cos(radians(lat)) *
		          power(sin(radians(lon - $6)/2), 2)
		      )) <= $7
		ORDER BY power(sin(radians(lat - $5)/2), 2) +
		         cos(radians($5)) * cos(radians(lat)) *
		         power(sin(radians(lon - $6)/2), 2)
		LIMIT 100`

	rows, err := d.pool.Query(ctx, q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []spec.Stop
	for rows.Next() {
		s := spec.Stop{Type: spec.StopTypeStop}
		if err := rows.Scan(&s.StopID, &s.ProviderID, &s.Code, &s.Name, &s.Lat, &s.Lon, &s.Timezone, &s.WheelchairBoarding); err != nil {
			return nil, err
		}
		out = append(out, s)
	}
	return out, rows.Err()
}

// GetRunStops returns the per-stop schedule + live state for one specific run
// of a trip (provider, trip_id, run_date). The static scheduled_arr/dep are
// resolved against the agency timezone via resolve_gtfs_time(); the live
// estimated_*/actual_* fields come from train_stop_times via LEFT JOIN, so
// stops that haven't been touched by realtime yet still appear with nil
// estimates. Returns ErrNotFound if the trip has no scheduled stops at all.
func (d *DB) GetRunStops(ctx context.Context, provider, tripID, runDate string) ([]spec.TrainStopTime, error) {
	rows, err := d.pool.Query(ctx, `
		WITH provider_tz AS (
		    SELECT timezone
		    FROM agencies
		    WHERE provider_id = $1
		    ORDER BY
		        CASE
		            WHEN replace(replace(lower(name), '-', ''), ' ', '') = $1 THEN 0
		            WHEN lower(name) LIKE lower($1) || '%' THEN 1
		            ELSE 2
		        END,
		        gtfs_agency_id
		    LIMIT 1
		)
		SELECT
		    sst.provider_id, sst.trip_id, $3::date,
		    s.code, sst.stop_sequence,
		    resolve_gtfs_time(sst.arrival_time,   $3::date, tz.timezone),
		    resolve_gtfs_time(sst.departure_time, $3::date, tz.timezone),
		    tst.estimated_arr, tst.estimated_dep,
		    tst.actual_arr,    tst.actual_dep,
		    tst.last_updated
		FROM scheduled_stop_times sst
		JOIN stops s ON s.stop_id = sst.stop_id
		LEFT JOIN provider_tz tz ON TRUE
		LEFT JOIN train_stop_times tst
		    ON tst.provider      = sst.provider_id
		   AND tst.trip_id       = sst.trip_id
		   AND tst.run_date      = $3::date
		   AND tst.stop_sequence = sst.stop_sequence
		WHERE sst.provider_id = $1 AND sst.trip_id = $2
		ORDER BY sst.stop_sequence`, provider, tripID, runDate)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []spec.TrainStopTime
	for rows.Next() {
		var t spec.TrainStopTime
		var lastUpdated *time.Time
		if err := rows.Scan(
			&t.Provider, &t.TripID, &t.RunDate,
			&t.StopCode, &t.StopSequence,
			&t.ScheduledArr, &t.ScheduledDep,
			&t.EstimatedArr, &t.EstimatedDep,
			&t.ActualArr, &t.ActualDep,
			&lastUpdated,
		); err != nil {
			return nil, err
		}
		if lastUpdated != nil {
			t.LastUpdated = *lastUpdated
		}
		out = append(out, t)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	if len(out) == 0 {
		return nil, ErrNotFound
	}
	return out, nil
}

// ListStops returns all stops for a provider, optionally bbox-filtered.
func (d *DB) ListStops(ctx context.Context, providerID string, bbox BBox) ([]spec.Stop, error) {
	q := `SELECT stop_id, provider_id, code, name, lat, lon, timezone, wheelchair_boarding
	      FROM stops WHERE provider_id = $1`
	args := []any{providerID}
	if bbox.Set {
		q += ` AND lon BETWEEN $2 AND $3 AND lat BETWEEN $4 AND $5`
		args = append(args, bbox.MinLon, bbox.MaxLon, bbox.MinLat, bbox.MaxLat)
	}
	q += ` ORDER BY name`

	rows, err := d.pool.Query(ctx, q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []spec.Stop
	for rows.Next() {
		s := spec.Stop{Type: spec.StopTypeStop}
		if err := rows.Scan(&s.StopID, &s.ProviderID, &s.Code, &s.Name, &s.Lat, &s.Lon, &s.Timezone, &s.WheelchairBoarding); err != nil {
			return nil, err
		}
		out = append(out, s)
	}
	return out, rows.Err()
}

// ListRoutes returns all routes for a provider.
func (d *DB) ListRoutes(ctx context.Context, providerID string) ([]spec.Route, error) {
	rows, err := d.pool.Query(ctx, `
		SELECT route_id, provider_id, short_name, long_name, color, text_color, shape_id
		FROM routes
		WHERE provider_id = $1
		ORDER BY short_name, long_name`, providerID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []spec.Route
	for rows.Next() {
		var r spec.Route
		if err := rows.Scan(&r.RouteID, &r.ProviderID, &r.ShortName, &r.LongName, &r.Color, &r.TextColor, &r.ShapeID); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

// GetTripStops returns the ordered scheduled stop-times for a trip, joined
// with stop name/code for client convenience.
func (d *DB) GetTripStops(ctx context.Context, tripID string) ([]EnrichedStopTime, error) {
	rows, err := d.pool.Query(ctx, `
		SELECT sst.trip_id, sst.stop_sequence, sst.provider_id, sst.stop_id,
		       sst.arrival_time, sst.departure_time, sst.timepoint,
		       sst.drop_off_type, sst.pickup_type,
		       s.name, s.code
		FROM scheduled_stop_times sst
		JOIN stops s ON s.stop_id = sst.stop_id
		WHERE sst.trip_id = $1
		ORDER BY sst.stop_sequence`, tripID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []EnrichedStopTime
	for rows.Next() {
		var e EnrichedStopTime
		if err := rows.Scan(
			&e.TripID, &e.StopSequence, &e.ProviderID, &e.StopID,
			&e.ArrivalTime, &e.DepartureTime, &e.Timepoint,
			&e.DropOffType, &e.PickupType,
			&e.StopName, &e.StopCode,
		); err != nil {
			return nil, err
		}
		out = append(out, e)
	}
	return out, rows.Err()
}

// LookupTripsByTrainNumber returns trips for (provider_id, short_name) that
// are active on the given date (YYYY-MM-DD).
func (d *DB) LookupTripsByTrainNumber(ctx context.Context, providerID, trainNumber, date string) ([]spec.Trip, error) {
	rows, err := d.pool.Query(ctx, `
		SELECT t.trip_id, t.provider_id, t.route_id, t.service_id, t.short_name,
		       t.headsign, t.shape_id, t.direction_id
		FROM trips t
		WHERE t.provider_id = $1
		  AND t.short_name = $2
		  AND service_active(t.provider_id, t.service_id, $3::date)
		ORDER BY t.trip_id`, providerID, trainNumber, date)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []spec.Trip
	for rows.Next() {
		var t spec.Trip
		if err := rows.Scan(&t.TripID, &t.ProviderID, &t.RouteID, &t.ServiceID, &t.ShortName, &t.Headsign, &t.ShapeID, &t.DirectionID); err != nil {
			return nil, err
		}
		out = append(out, t)
	}
	return out, rows.Err()
}

// GetDepartures returns trips visiting stopID on date, ordered by departure.
func (d *DB) GetDepartures(ctx context.Context, stopID, date string) ([]DepartureItem, error) {
	rows, err := d.pool.Query(ctx, `
		SELECT t.trip_id, t.provider_id, t.route_id, t.service_id, t.short_name,
		       t.headsign, t.shape_id, t.direction_id,
		       sst.arrival_time, sst.departure_time, sst.stop_sequence
		FROM scheduled_stop_times sst
		JOIN trips t ON t.trip_id = sst.trip_id
		WHERE sst.stop_id = $1
		  AND service_active(t.provider_id, t.service_id, $2::date)
		ORDER BY sst.departure_time NULLS LAST, sst.arrival_time NULLS LAST`,
		stopID, date)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []DepartureItem
	for rows.Next() {
		var d DepartureItem
		if err := rows.Scan(
			&d.TripID, &d.ProviderID, &d.RouteID, &d.ServiceID, &d.ShortName,
			&d.Headsign, &d.ShapeID, &d.DirectionID,
			&d.ArrivalTime, &d.DepartureTime, &d.StopSequence,
		); err != nil {
			return nil, err
		}
		out = append(out, d)
	}
	return out, rows.Err()
}

// GetConnections returns trips that visit fromStopID and toStopID in order on
// date, deduped by (short_name, departure_time). Includes intermediate stops.
func (d *DB) GetConnections(ctx context.Context, fromStopID, toStopID, date string) ([]ConnectionItem, error) {
	rows, err := d.pool.Query(ctx, `
		WITH pairs AS (
		    SELECT a.trip_id,
		           a.stop_sequence  AS from_seq,
		           b.stop_sequence  AS to_seq,
		           a.arrival_time   AS from_arr,
		           a.departure_time AS from_dep,
		           b.arrival_time   AS to_arr,
		           b.departure_time AS to_dep
		    FROM scheduled_stop_times a
		    JOIN scheduled_stop_times b ON b.trip_id = a.trip_id
		    WHERE a.stop_id = $1 AND b.stop_id = $2 AND a.stop_sequence < b.stop_sequence
		)
		SELECT DISTINCT ON (t.short_name, p.from_dep)
		       t.trip_id, t.provider_id, t.route_id, t.service_id, t.short_name,
		       t.headsign, t.shape_id, t.direction_id,
		       p.from_seq, p.from_arr, p.from_dep,
		       p.to_seq,   p.to_arr,   p.to_dep
		FROM pairs p
		JOIN trips t ON t.trip_id = p.trip_id
		WHERE service_active(t.provider_id, t.service_id, $3::date)
		ORDER BY t.short_name, p.from_dep, p.from_seq`,
		fromStopID, toStopID, date)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	type pairRow struct {
		ConnectionItem
		fromSeq, toSeq int
	}
	var pairs []pairRow
	for rows.Next() {
		var p pairRow
		if err := rows.Scan(
			&p.TripID, &p.ProviderID, &p.RouteID, &p.ServiceID, &p.ShortName,
			&p.Headsign, &p.ShapeID, &p.DirectionID,
			&p.fromSeq, &p.From.ArrivalTime, &p.From.DepartureTime,
			&p.toSeq, &p.To.ArrivalTime, &p.To.DepartureTime,
		); err != nil {
			return nil, err
		}
		p.From.TripID = p.TripID
		p.From.ProviderID = p.ProviderID
		p.From.StopID = fromStopID
		p.From.StopSequence = p.fromSeq
		p.To.TripID = p.TripID
		p.To.ProviderID = p.ProviderID
		p.To.StopID = toStopID
		p.To.StopSequence = p.toSeq
		pairs = append(pairs, p)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	if len(pairs) == 0 {
		return nil, nil
	}

	// Hydrate stop names for from/to and load intermediate stops per trip.
	out := make([]ConnectionItem, 0, len(pairs))
	for _, p := range pairs {
		fromStop, err := d.GetStop(ctx, fromStopID)
		if err != nil && !errors.Is(err, ErrNotFound) {
			return nil, err
		}
		toStop, err := d.GetStop(ctx, toStopID)
		if err != nil && !errors.Is(err, ErrNotFound) {
			return nil, err
		}
		if fromStop != nil {
			p.From.StopName, p.From.StopCode = fromStop.Name, fromStop.Code
		}
		if toStop != nil {
			p.To.StopName, p.To.StopCode = toStop.Name, toStop.Code
		}

		intermediates, err := d.intermediateStops(ctx, p.TripID, p.fromSeq, p.toSeq)
		if err != nil {
			return nil, err
		}
		p.ConnectionItem.Intermediate = intermediates
		out = append(out, p.ConnectionItem)
	}
	return out, nil
}

func (d *DB) intermediateStops(ctx context.Context, tripID string, fromSeq, toSeq int) ([]EnrichedStopTime, error) {
	rows, err := d.pool.Query(ctx, `
		SELECT sst.trip_id, sst.stop_sequence, sst.provider_id, sst.stop_id,
		       sst.arrival_time, sst.departure_time, sst.timepoint,
		       sst.drop_off_type, sst.pickup_type,
		       s.name, s.code
		FROM scheduled_stop_times sst
		JOIN stops s ON s.stop_id = sst.stop_id
		WHERE sst.trip_id = $1 AND sst.stop_sequence > $2 AND sst.stop_sequence < $3
		ORDER BY sst.stop_sequence`, tripID, fromSeq, toSeq)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []EnrichedStopTime
	for rows.Next() {
		var e EnrichedStopTime
		if err := rows.Scan(
			&e.TripID, &e.StopSequence, &e.ProviderID, &e.StopID,
			&e.ArrivalTime, &e.DepartureTime, &e.Timepoint,
			&e.DropOffType, &e.PickupType,
			&e.StopName, &e.StopCode,
		); err != nil {
			return nil, err
		}
		out = append(out, e)
	}
	return out, rows.Err()
}

// GetTripsForRoute returns unique train numbers operating on a route. The name
// reflects the new endpoint (/v1/routes/{r}/trips) — the return shape is still
// the aggregated train-number view that powers the mobile route detail screen.
func (d *DB) GetTripsForRoute(ctx context.Context, routeID string) ([]TrainItem, error) {
	rows, err := d.pool.Query(ctx, `
		SELECT provider_id, short_name, MIN(headsign) AS sample_headsign, COUNT(*) AS trip_count
		FROM trips
		WHERE route_id = $1 AND short_name <> ''
		GROUP BY provider_id, short_name
		ORDER BY short_name`, routeID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []TrainItem
	for rows.Next() {
		var t TrainItem
		if err := rows.Scan(&t.ProviderID, &t.TrainNumber, &t.SampleHeadsign, &t.TripCount); err != nil {
			return nil, err
		}
		out = append(out, t)
	}
	return out, rows.Err()
}

// GetTrainService returns the date range during which a train operates,
// optionally clipped to [from, to].
func (d *DB) GetTrainService(ctx context.Context, providerID, trainNumber, from, to string) (*ServiceInfo, error) {
	row := d.pool.QueryRow(ctx, `
		WITH matching AS (
		    SELECT DISTINCT service_id FROM trips
		    WHERE provider_id = $1 AND short_name = $2
		),
		dates AS (
		    SELECT c.start_date AS d FROM service_calendars c
		    JOIN matching m ON m.service_id = c.service_id
		    WHERE c.provider_id = $1
		    UNION ALL
		    SELECT c.end_date AS d FROM service_calendars c
		    JOIN matching m ON m.service_id = c.service_id
		    WHERE c.provider_id = $1
		    UNION ALL
		    SELECT e.date AS d FROM service_exceptions e
		    JOIN matching m ON m.service_id = e.service_id
		    WHERE e.provider_id = $1
		)
		SELECT to_char(GREATEST(MIN(d), COALESCE($3::date, MIN(d))), 'YYYY-MM-DD'),
		       to_char(LEAST(MAX(d),   COALESCE($4::date, MAX(d))),   'YYYY-MM-DD')
		FROM dates`, providerID, trainNumber, nullIfEmpty(from), nullIfEmpty(to))
	var minD, maxD *string
	if err := row.Scan(&minD, &maxD); err != nil {
		return nil, err
	}
	if minD == nil || maxD == nil {
		return nil, ErrNotFound
	}
	return &ServiceInfo{
		ProviderID:  providerID,
		TrainNumber: trainNumber,
		MinDate:     *minD,
		MaxDate:     *maxD,
	}, nil
}

// Search runs unified trigram search across stops, routes, and trips.
// providerID is optional ("" = all providers).
func (d *DB) Search(ctx context.Context, providerID, query string, includeStations, includeTrains, includeRoutes bool) (*SearchResult, error) {
	out := &SearchResult{
		Stations: []SearchHit{},
		Trains:   []SearchHit{},
		Routes:   []SearchHit{},
	}
	q := "%" + query + "%"

	// Preserve the empty-slice init on no-match — searchX returns nil from a
	// zero-row scan, which would marshal as JSON null and break clients that
	// expect always-array fields.
	if includeStations {
		hits, err := d.searchStations(ctx, providerID, q)
		if err != nil {
			return nil, fmt.Errorf("search stations: %w", err)
		}
		if hits != nil {
			out.Stations = hits
		}
	}
	if includeRoutes {
		hits, err := d.searchRoutes(ctx, providerID, q)
		if err != nil {
			return nil, fmt.Errorf("search routes: %w", err)
		}
		if hits != nil {
			out.Routes = hits
		}
	}
	if includeTrains {
		hits, err := d.searchTrains(ctx, providerID, q)
		if err != nil {
			return nil, fmt.Errorf("search trains: %w", err)
		}
		if hits != nil {
			out.Trains = hits
		}
	}
	return out, nil
}

func (d *DB) searchStations(ctx context.Context, providerID, q string) ([]SearchHit, error) {
	args := []any{q}
	where := "(lower(name) ILIKE lower($1) OR lower(code) ILIKE lower($1))"
	if providerID != "" {
		where = "provider_id = $2 AND " + where
		args = append(args, providerID)
	}
	rows, err := d.pool.Query(ctx, `
		SELECT stop_id, name, code, provider_id
		FROM stops
		WHERE `+where+`
		ORDER BY similarity(lower(name), lower($1)) DESC, name
		LIMIT 8`, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var hits []SearchHit
	for rows.Next() {
		var stopID, name, code, prov string
		if err := rows.Scan(&stopID, &name, &code, &prov); err != nil {
			return nil, err
		}
		hits = append(hits, SearchHit{Type: "station", ID: stopID, Name: name, Subtitle: code, Provider: prov})
	}
	return hits, rows.Err()
}

func (d *DB) searchRoutes(ctx context.Context, providerID, q string) ([]SearchHit, error) {
	args := []any{q}
	where := "(lower(short_name) ILIKE lower($1) OR lower(long_name) ILIKE lower($1))"
	if providerID != "" {
		where = "provider_id = $2 AND " + where
		args = append(args, providerID)
	}
	rows, err := d.pool.Query(ctx, `
		SELECT route_id, long_name, short_name, provider_id
		FROM routes
		WHERE `+where+`
		ORDER BY similarity(lower(long_name), lower($1)) DESC, long_name
		LIMIT 5`, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var hits []SearchHit
	for rows.Next() {
		var routeID, longName, shortName, prov string
		if err := rows.Scan(&routeID, &longName, &shortName, &prov); err != nil {
			return nil, err
		}
		name := longName
		if name == "" {
			name = shortName
		}
		hits = append(hits, SearchHit{Type: "route", ID: routeID, Name: name, Subtitle: shortName, Provider: prov})
	}
	return hits, rows.Err()
}

func (d *DB) searchTrains(ctx context.Context, providerID, q string) ([]SearchHit, error) {
	args := []any{q}
	where := "short_name <> '' AND (lower(short_name) ILIKE lower($1) OR lower(headsign) ILIKE lower($1))"
	if providerID != "" {
		where = "provider_id = $2 AND " + where
		args = append(args, providerID)
	}
	rows, err := d.pool.Query(ctx, `
		SELECT DISTINCT ON (provider_id, short_name)
		       provider_id, short_name, headsign
		FROM trips
		WHERE `+where+`
		ORDER BY provider_id, short_name
		LIMIT 5`, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var hits []SearchHit
	for rows.Next() {
		var prov, short, headsign string
		if err := rows.Scan(&prov, &short, &headsign); err != nil {
			return nil, err
		}
		hits = append(hits, SearchHit{Type: "train", ID: short, Name: short, Subtitle: headsign, Provider: prov})
	}
	return hits, rows.Err()
}

func nullIfEmpty(s string) any {
	if s == "" {
		return nil
	}
	return s
}
