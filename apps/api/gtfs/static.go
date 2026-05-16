package gtfs

import (
	"archive/zip"
	"bytes"
	"context"
	"encoding/csv"
	"fmt"
	"io"
	"log"
	"net/http"
	"strconv"
	"time"

	"github.com/RailForLess/tracky/api/ids"
	"github.com/RailForLess/tracky/api/spec"
)

// FetchAndParseStatic downloads a GTFS zip from url, parses it, and returns
// slices of spec types stamped with providerID.
func FetchAndParseStatic(
	ctx context.Context,
	url string,
	providerID string,
) (
	agencies []spec.Agency,
	routes []spec.Route,
	stops []spec.Stop,
	trips []spec.Trip,
	stopTimes []spec.ScheduledStopTime,
	calendars []spec.ServiceCalendar,
	exceptions []spec.ServiceException,
	shapes []spec.ShapePoint,
	err error,
) {
	log.Printf("gtfs [%s]: downloading %s", providerID, url)
	data, err := fetchStaticBytes(ctx, url)
	if err != nil {
		return nil, nil, nil, nil, nil, nil, nil, nil, fmt.Errorf("gtfs: fetch %s: %w", url, err)
	}
	log.Printf("gtfs [%s]: downloaded %.1f MB", providerID, float64(len(data))/(1024*1024))

	zr, err := zip.NewReader(bytes.NewReader(data), int64(len(data)))
	if err != nil {
		return nil, nil, nil, nil, nil, nil, nil, nil, fmt.Errorf("gtfs: open zip: %w", err)
	}

	files := indexZip(zr)

	for _, name := range []string{"routes.txt", "stops.txt", "trips.txt", "stop_times.txt"} {
		if _, ok := files[name]; !ok {
			return nil, nil, nil, nil, nil, nil, nil, nil,
				fmt.Errorf("gtfs [%s]: missing required %s", providerID, name)
		}
	}

	if f, ok := files["agency.txt"]; ok {
		agencies, err = parseAgency(f, providerID)
		if err != nil {
			return nil, nil, nil, nil, nil, nil, nil, nil, err
		}
	}

	if f, ok := files["routes.txt"]; ok {
		log.Printf("gtfs [%s]: parsing routes.txt", providerID)
		routes, err = parseRoutes(f, providerID)
		if err != nil {
			return nil, nil, nil, nil, nil, nil, nil, nil, err
		}
	}

	if f, ok := files["stops.txt"]; ok {
		log.Printf("gtfs [%s]: parsing stops.txt", providerID)
		stops, err = parseStops(f, providerID)
		if err != nil {
			return nil, nil, nil, nil, nil, nil, nil, nil, err
		}
		log.Printf("gtfs [%s]: %d stops", providerID, len(stops))
	}

	if f, ok := files["trips.txt"]; ok {
		log.Printf("gtfs [%s]: parsing trips.txt", providerID)
		trips, err = parseTrips(f, providerID)
		if err != nil {
			return nil, nil, nil, nil, nil, nil, nil, nil, err
		}
		log.Printf("gtfs [%s]: %d trips", providerID, len(trips))
	}

	if f, ok := files["stop_times.txt"]; ok {
		log.Printf("gtfs [%s]: parsing stop_times.txt", providerID)
		stopTimes, err = parseStopTimes(f, providerID)
		if err != nil {
			return nil, nil, nil, nil, nil, nil, nil, nil, err
		}
		log.Printf("gtfs [%s]: %d stop_times", providerID, len(stopTimes))
	}

	// calendar.txt is optional — some feeds use only calendar_dates.txt
	if f, ok := files["calendar.txt"]; ok {
		log.Printf("gtfs [%s]: parsing calendar.txt", providerID)
		calendars, err = parseCalendar(f, providerID)
		if err != nil {
			return nil, nil, nil, nil, nil, nil, nil, nil, err
		}
	}

	if f, ok := files["calendar_dates.txt"]; ok {
		log.Printf("gtfs [%s]: parsing calendar_dates.txt", providerID)
		exceptions, err = parseCalendarDates(f, providerID)
		if err != nil {
			return nil, nil, nil, nil, nil, nil, nil, nil, err
		}
	}

	// shapes.txt is optional — not all feeds include shape geometry.
	if f, ok := files["shapes.txt"]; ok {
		log.Printf("gtfs [%s]: parsing shapes.txt", providerID)
		shapes, err = parseShapes(f, providerID)
		if err != nil {
			return nil, nil, nil, nil, nil, nil, nil, nil, err
		}
		log.Printf("gtfs [%s]: %d shapes", providerID, len(shapes))
	}

	return
}

// fetchStaticBytes performs a GET request and returns the response body.
func fetchStaticBytes(ctx context.Context, url string) ([]byte, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("HTTP %d", resp.StatusCode)
	}
	return io.ReadAll(resp.Body)
}

// FetchResult is the outcome of FetchStaticConditional.
// When NotModified is true, Body/ETag/LastModified are zero.
type FetchResult struct {
	NotModified  bool
	Body         []byte
	ETag         string
	LastModified string
}

// FetchStaticConditional GETs url with conditional request headers
// (If-None-Match, If-Modified-Since). On 304 it returns NotModified=true with
// no body. On 200 it returns the full body and the response's ETag /
// Last-Modified for the caller to persist.
func FetchStaticConditional(ctx context.Context, url, prevETag, prevLastMod string) (*FetchResult, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	if prevETag != "" {
		req.Header.Set("If-None-Match", prevETag)
	}
	if prevLastMod != "" {
		req.Header.Set("If-Modified-Since", prevLastMod)
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode == http.StatusNotModified {
		return &FetchResult{NotModified: true}, nil
	}
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("HTTP %d", resp.StatusCode)
	}
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}
	return &FetchResult{
		Body:         body,
		ETag:         resp.Header.Get("ETag"),
		LastModified: resp.Header.Get("Last-Modified"),
	}, nil
}

// ParseStaticBytes parses a GTFS zip from in-memory bytes and returns slices
// of spec types stamped with providerID.
func ParseStaticBytes(
	providerID string,
	data []byte,
) (
	agencies []spec.Agency,
	routes []spec.Route,
	stops []spec.Stop,
	trips []spec.Trip,
	stopTimes []spec.ScheduledStopTime,
	calendars []spec.ServiceCalendar,
	exceptions []spec.ServiceException,
	shapes []spec.ShapePoint,
	err error,
) {
	zr, err := zip.NewReader(bytes.NewReader(data), int64(len(data)))
	if err != nil {
		return nil, nil, nil, nil, nil, nil, nil, nil, fmt.Errorf("gtfs: open zip: %w", err)
	}

	files := indexZip(zr)

	for _, name := range []string{"routes.txt", "stops.txt", "trips.txt", "stop_times.txt"} {
		if _, ok := files[name]; !ok {
			return nil, nil, nil, nil, nil, nil, nil, nil,
				fmt.Errorf("gtfs [%s]: missing required %s", providerID, name)
		}
	}

	if f, ok := files["agency.txt"]; ok {
		agencies, err = parseAgency(f, providerID)
		if err != nil {
			return nil, nil, nil, nil, nil, nil, nil, nil, err
		}
	}
	if f, ok := files["routes.txt"]; ok {
		log.Printf("gtfs [%s]: parsing routes.txt", providerID)
		routes, err = parseRoutes(f, providerID)
		if err != nil {
			return nil, nil, nil, nil, nil, nil, nil, nil, err
		}
	}
	if f, ok := files["stops.txt"]; ok {
		log.Printf("gtfs [%s]: parsing stops.txt", providerID)
		stops, err = parseStops(f, providerID)
		if err != nil {
			return nil, nil, nil, nil, nil, nil, nil, nil, err
		}
		log.Printf("gtfs [%s]: %d stops", providerID, len(stops))
	}
	if f, ok := files["trips.txt"]; ok {
		log.Printf("gtfs [%s]: parsing trips.txt", providerID)
		trips, err = parseTrips(f, providerID)
		if err != nil {
			return nil, nil, nil, nil, nil, nil, nil, nil, err
		}
		log.Printf("gtfs [%s]: %d trips", providerID, len(trips))
	}
	if f, ok := files["stop_times.txt"]; ok {
		log.Printf("gtfs [%s]: parsing stop_times.txt", providerID)
		stopTimes, err = parseStopTimes(f, providerID)
		if err != nil {
			return nil, nil, nil, nil, nil, nil, nil, nil, err
		}
		log.Printf("gtfs [%s]: %d stop_times", providerID, len(stopTimes))
	}
	// calendar.txt is optional — some feeds use only calendar_dates.txt
	if f, ok := files["calendar.txt"]; ok {
		log.Printf("gtfs [%s]: parsing calendar.txt", providerID)
		calendars, err = parseCalendar(f, providerID)
		if err != nil {
			return nil, nil, nil, nil, nil, nil, nil, nil, err
		}
	}
	if f, ok := files["calendar_dates.txt"]; ok {
		log.Printf("gtfs [%s]: parsing calendar_dates.txt", providerID)
		exceptions, err = parseCalendarDates(f, providerID)
		if err != nil {
			return nil, nil, nil, nil, nil, nil, nil, nil, err
		}
	}
	// shapes.txt is optional — not all feeds include shape geometry.
	if f, ok := files["shapes.txt"]; ok {
		log.Printf("gtfs [%s]: parsing shapes.txt", providerID)
		shapes, err = parseShapes(f, providerID)
		if err != nil {
			return nil, nil, nil, nil, nil, nil, nil, nil, err
		}
		log.Printf("gtfs [%s]: %d shapes", providerID, len(shapes))
	}
	return
}

// indexZip returns a map of filename → *zip.File for the archive.
func indexZip(zr *zip.Reader) map[string]*zip.File {
	m := make(map[string]*zip.File, len(zr.File))
	for _, f := range zr.File {
		m[f.Name] = f
	}
	return m
}

// readCSV opens a zip file and returns all rows as a slice of header→value maps.
func readCSV(f *zip.File) ([]map[string]string, error) {
	rc, err := f.Open()
	if err != nil {
		return nil, fmt.Errorf("gtfs: open %s: %w", f.Name, err)
	}
	defer rc.Close()

	r := csv.NewReader(rc)
	r.TrimLeadingSpace = true

	header, err := r.Read()
	if err != nil {
		return nil, fmt.Errorf("gtfs: read header %s: %w", f.Name, err)
	}
	// Trim BOM from first field if present
	if len(header) > 0 {
		header[0] = trimBOM(header[0])
	}

	var rows []map[string]string
	for {
		rec, err := r.Read()
		if err == io.EOF {
			break
		}
		if err != nil {
			return nil, fmt.Errorf("gtfs: read %s: %w", f.Name, err)
		}
		row := make(map[string]string, len(header))
		for i, col := range header {
			if i < len(rec) {
				row[col] = rec[i]
			}
		}
		rows = append(rows, row)
	}
	return rows, nil
}

func trimBOM(s string) string {
	if len(s) >= 3 && s[0] == 0xEF && s[1] == 0xBB && s[2] == 0xBF {
		return s[3:]
	}
	return s
}

func optStr(m map[string]string, key string) *string {
	v, ok := m[key]
	if !ok || v == "" {
		return nil
	}
	return &v
}

func optBool(m map[string]string, key string) *bool {
	v, ok := m[key]
	if !ok || v == "" {
		return nil
	}
	b := v == "1"
	return &b
}

func optInt(m map[string]string, key string) *int {
	v, ok := m[key]
	if !ok || v == "" {
		return nil
	}
	i, err := strconv.Atoi(v)
	if err != nil {
		return nil
	}
	return &i
}

func parseAgency(f *zip.File, providerID string) ([]spec.Agency, error) {
	rows, err := readCSV(f)
	if err != nil {
		return nil, err
	}
	out := make([]spec.Agency, 0, len(rows))
	for _, r := range rows {
		out = append(out, spec.Agency{
			ProviderID:   providerID,
			GtfsAgencyID: r["agency_id"],
			Name:         r["agency_name"],
			URL:          r["agency_url"],
			Timezone:     r["agency_timezone"],
			Lang:         optStr(r, "agency_lang"),
			Phone:        optStr(r, "agency_phone"),
		})
	}
	return out, nil
}

func parseRoutes(f *zip.File, providerID string) ([]spec.Route, error) {
	rows, err := readCSV(f)
	if err != nil {
		return nil, err
	}
	out := make([]spec.Route, 0, len(rows))
	for _, r := range rows {
		routeID, err := ids.Encode(ids.KindRoute, providerID, r["route_id"])
		if err != nil {
			return nil, fmt.Errorf("gtfs [%s]: parseRoutes: invalid route_id %q: %w", providerID, r["route_id"], err)
		}
		out = append(out, spec.Route{
			ProviderID: providerID,
			RouteID:    routeID,
			ShortName:  r["route_short_name"],
			LongName:   r["route_long_name"],
			Color:      r["route_color"],
			TextColor:  r["route_text_color"],
			ShapeID:    optStr(r, "shape_id"),
		})
	}
	return out, nil
}

func parseStops(f *zip.File, providerID string) ([]spec.Stop, error) {
	rows, err := readCSV(f)
	if err != nil {
		return nil, err
	}
	out := make([]spec.Stop, 0, len(rows))
	for _, r := range rows {
		lat, err := strconv.ParseFloat(r["stop_lat"], 64)
		if err != nil {
			return nil, fmt.Errorf("gtfs [%s]: stops.txt: invalid stop_lat %q for stop_id %q: %w", providerID, r["stop_lat"], r["stop_id"], err)
		}
		lon, err := strconv.ParseFloat(r["stop_lon"], 64)
		if err != nil {
			return nil, fmt.Errorf("gtfs [%s]: stops.txt: invalid stop_lon %q for stop_id %q: %w", providerID, r["stop_lon"], r["stop_id"], err)
		}
		// Fall back to stop_id when stop_code is empty: Amtrak (and others)
		// encode the public station code in stop_id and leave stop_code blank.
		code := r["stop_code"]
		if code == "" {
			code = r["stop_id"]
		}
		stopID, err := ids.Encode(ids.KindStop, providerID, r["stop_id"])
		if err != nil {
			return nil, fmt.Errorf("gtfs [%s]: parseStops: invalid stop_id %q: %w", providerID, r["stop_id"], err)
		}
		out = append(out, spec.Stop{
			Type:               spec.StopTypeStop,
			ProviderID:         providerID,
			StopID:             stopID,
			Code:               code,
			Name:               r["stop_name"],
			Lat:                lat,
			Lon:                lon,
			Timezone:           optStr(r, "stop_timezone"),
			WheelchairBoarding: optBool(r, "wheelchair_boarding"),
		})
	}
	return out, nil
}

func parseTrips(f *zip.File, providerID string) ([]spec.Trip, error) {
	rows, err := readCSV(f)
	if err != nil {
		return nil, err
	}
	out := make([]spec.Trip, 0, len(rows))
	for _, r := range rows {
		tripID, err := ids.Encode(ids.KindTrip, providerID, r["trip_id"])
		if err != nil {
			return nil, fmt.Errorf("gtfs [%s]: parseTrips: invalid trip_id %q: %w", providerID, r["trip_id"], err)
		}
		routeID, err := ids.Encode(ids.KindRoute, providerID, r["route_id"])
		if err != nil {
			return nil, fmt.Errorf("gtfs [%s]: parseTrips: invalid route_id %q for trip_id %q: %w", providerID, r["route_id"], r["trip_id"], err)
		}
		out = append(out, spec.Trip{
			ProviderID:  providerID,
			TripID:      tripID,
			RouteID:     routeID,
			ServiceID:   r["service_id"],
			ShortName:   r["trip_short_name"],
			Headsign:    r["trip_headsign"],
			ShapeID:     optStr(r, "shape_id"),
			DirectionID: optInt(r, "direction_id"),
		})
	}
	return out, nil
}

func parseStopTimes(f *zip.File, providerID string) ([]spec.ScheduledStopTime, error) {
	rows, err := readCSV(f)
	if err != nil {
		return nil, err
	}
	out := make([]spec.ScheduledStopTime, 0, len(rows))
	for _, r := range rows {
		seq, err := strconv.Atoi(r["stop_sequence"])
		if err != nil {
			return nil, fmt.Errorf("gtfs [%s]: stop_times.txt: invalid stop_sequence %q for trip_id %q: %w", providerID, r["stop_sequence"], r["trip_id"], err)
		}
		tripID, err := ids.Encode(ids.KindTrip, providerID, r["trip_id"])
		if err != nil {
			return nil, fmt.Errorf("gtfs [%s]: parseStopTimes: invalid trip_id %q: %w", providerID, r["trip_id"], err)
		}
		stopID, err := ids.Encode(ids.KindStop, providerID, r["stop_id"])
		if err != nil {
			return nil, fmt.Errorf("gtfs [%s]: parseStopTimes: invalid stop_id %q for trip_id %q: %w", providerID, r["stop_id"], r["trip_id"], err)
		}
		out = append(out, spec.ScheduledStopTime{
			ProviderID:    providerID,
			TripID:        tripID,
			StopID:        stopID,
			StopSequence:  seq,
			ArrivalTime:   optStr(r, "arrival_time"),
			DepartureTime: optStr(r, "departure_time"),
			Timepoint:     optBool(r, "timepoint"),
			DropOffType:   optInt(r, "drop_off_type"),
			PickupType:    optInt(r, "pickup_type"),
		})
	}
	return out, nil
}

func parseCalendar(f *zip.File, providerID string) ([]spec.ServiceCalendar, error) {
	rows, err := readCSV(f)
	if err != nil {
		return nil, err
	}
	out := make([]spec.ServiceCalendar, 0, len(rows))
	for _, r := range rows {
		start, err := time.Parse("20060102", r["start_date"])
		if err != nil {
			return nil, fmt.Errorf("gtfs [%s]: calendar.txt: invalid start_date %q for service_id %q: %w", providerID, r["start_date"], r["service_id"], err)
		}
		end, err := time.Parse("20060102", r["end_date"])
		if err != nil {
			return nil, fmt.Errorf("gtfs [%s]: calendar.txt: invalid end_date %q for service_id %q: %w", providerID, r["end_date"], r["service_id"], err)
		}
		out = append(out, spec.ServiceCalendar{
			ProviderID: providerID,
			ServiceID:  r["service_id"],
			Monday:     r["monday"] == "1",
			Tuesday:    r["tuesday"] == "1",
			Wednesday:  r["wednesday"] == "1",
			Thursday:   r["thursday"] == "1",
			Friday:     r["friday"] == "1",
			Saturday:   r["saturday"] == "1",
			Sunday:     r["sunday"] == "1",
			StartDate:  start,
			EndDate:    end,
		})
	}
	return out, nil
}

func parseCalendarDates(f *zip.File, providerID string) ([]spec.ServiceException, error) {
	rows, err := readCSV(f)
	if err != nil {
		return nil, err
	}
	out := make([]spec.ServiceException, 0, len(rows))
	for _, r := range rows {
		date, err := time.Parse("20060102", r["date"])
		if err != nil {
			return nil, fmt.Errorf("gtfs [%s]: calendar_dates.txt: invalid date %q for service_id %q: %w", providerID, r["date"], r["service_id"], err)
		}
		exType, err := strconv.Atoi(r["exception_type"])
		if err != nil {
			return nil, fmt.Errorf("gtfs [%s]: calendar_dates.txt: invalid exception_type %q for service_id %q: %w", providerID, r["exception_type"], r["service_id"], err)
		}
		out = append(out, spec.ServiceException{
			ProviderID:    providerID,
			ServiceID:     r["service_id"],
			Date:          date,
			ExceptionType: exType,
		})
	}
	return out, nil
}

func parseShapes(f *zip.File, providerID string) ([]spec.ShapePoint, error) {
	rows, err := readCSV(f)
	if err != nil {
		return nil, err
	}
	out := make([]spec.ShapePoint, 0, len(rows))
	for _, r := range rows {
		lat, err := strconv.ParseFloat(r["shape_pt_lat"], 64)
		if err != nil {
			return nil, fmt.Errorf("gtfs [%s]: shapes.txt: invalid shape_pt_lat %q for shape_id %q: %w", providerID, r["shape_pt_lat"], r["shape_id"], err)
		}
		lon, err := strconv.ParseFloat(r["shape_pt_lon"], 64)
		if err != nil {
			return nil, fmt.Errorf("gtfs [%s]: shapes.txt: invalid shape_pt_lon %q for shape_id %q: %w", providerID, r["shape_pt_lon"], r["shape_id"], err)
		}
		seq, err := strconv.Atoi(r["shape_pt_sequence"])
		if err != nil {
			return nil, fmt.Errorf("gtfs [%s]: shapes.txt: invalid shape_pt_sequence %q for shape_id %q: %w", providerID, r["shape_pt_sequence"], r["shape_id"], err)
		}
		sp := spec.ShapePoint{
			ProviderID: providerID,
			ShapeID:    r["shape_id"],
			Lat:        lat,
			Lon:        lon,
			Sequence:   seq,
		}
		if v, ok := r["shape_dist_traveled"]; ok && v != "" {
			if d, err := strconv.ParseFloat(v, 64); err == nil {
				sp.DistTraveled = &d
			}
		}
		out = append(out, sp)
	}
	return out, nil
}
