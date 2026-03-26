package gtfs

import (
	"archive/zip"
	"bytes"
	"context"
	"encoding/csv"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"time"

	"github.com/Tracky-Trains/tracky/api/spec"
)

// FetchAndParseStatic downloads a GTFS zip from url, parses it, and returns
// slices of spec types stamped with agencyID.
func FetchAndParseStatic(
	ctx context.Context,
	url string,
	agencyID string,
) (
	agencies []spec.Agency,
	routes []spec.Route,
	stops []spec.Stop,
	trips []spec.Trip,
	stopTimes []spec.ScheduledStopTime,
	calendars []spec.ServiceCalendar,
	exceptions []spec.ServiceException,
	err error,
) {
	data, err := fetchStaticBytes(ctx, url)
	if err != nil {
		return nil, nil, nil, nil, nil, nil, nil, fmt.Errorf("gtfs: fetch %s: %w", url, err)
	}

	zr, err := zip.NewReader(bytes.NewReader(data), int64(len(data)))
	if err != nil {
		return nil, nil, nil, nil, nil, nil, nil, fmt.Errorf("gtfs: open zip: %w", err)
	}

	files := indexZip(zr)

	if f, ok := files["agency.txt"]; ok {
		agencies, err = parseAgency(f, agencyID)
		if err != nil {
			return nil, nil, nil, nil, nil, nil, nil, err
		}
	}

	if f, ok := files["routes.txt"]; ok {
		routes, err = parseRoutes(f, agencyID)
		if err != nil {
			return nil, nil, nil, nil, nil, nil, nil, err
		}
	}

	if f, ok := files["stops.txt"]; ok {
		stops, err = parseStops(f, agencyID)
		if err != nil {
			return nil, nil, nil, nil, nil, nil, nil, err
		}
	}

	if f, ok := files["trips.txt"]; ok {
		trips, err = parseTrips(f, agencyID)
		if err != nil {
			return nil, nil, nil, nil, nil, nil, nil, err
		}
	}

	if f, ok := files["stop_times.txt"]; ok {
		stopTimes, err = parseStopTimes(f, agencyID)
		if err != nil {
			return nil, nil, nil, nil, nil, nil, nil, err
		}
	}

	// calendar.txt is optional — some feeds use only calendar_dates.txt
	if f, ok := files["calendar.txt"]; ok {
		calendars, err = parseCalendar(f, agencyID)
		if err != nil {
			return nil, nil, nil, nil, nil, nil, nil, err
		}
	}

	if f, ok := files["calendar_dates.txt"]; ok {
		exceptions, err = parseCalendarDates(f, agencyID)
		if err != nil {
			return nil, nil, nil, nil, nil, nil, nil, err
		}
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

func parseAgency(f *zip.File, agencyID string) ([]spec.Agency, error) {
	rows, err := readCSV(f)
	if err != nil {
		return nil, err
	}
	out := make([]spec.Agency, 0, len(rows))
	for _, r := range rows {
		out = append(out, spec.Agency{
			AgencyID: agencyID,
			Name:     r["agency_name"],
			URL:      r["agency_url"],
			Timezone: r["agency_timezone"],
			Lang:     optStr(r, "agency_lang"),
			Phone:    optStr(r, "agency_phone"),
		})
	}
	return out, nil
}

func parseRoutes(f *zip.File, agencyID string) ([]spec.Route, error) {
	rows, err := readCSV(f)
	if err != nil {
		return nil, err
	}
	out := make([]spec.Route, 0, len(rows))
	for _, r := range rows {
		out = append(out, spec.Route{
			AgencyID:  agencyID,
			RouteID:   agencyID + ":" + r["route_id"],
			ShortName: r["route_short_name"],
			LongName:  r["route_long_name"],
			Color:     r["route_color"],
			TextColor: r["route_text_color"],
			ShapeID:   optStr(r, "shape_id"),
		})
	}
	return out, nil
}

func parseStops(f *zip.File, agencyID string) ([]spec.Stop, error) {
	rows, err := readCSV(f)
	if err != nil {
		return nil, err
	}
	out := make([]spec.Stop, 0, len(rows))
	for _, r := range rows {
		lat, _ := strconv.ParseFloat(r["stop_lat"], 64)
		lon, _ := strconv.ParseFloat(r["stop_lon"], 64)
		out = append(out, spec.Stop{
			AgencyID:           agencyID,
			StopID:             agencyID + ":" + r["stop_id"],
			Code:               r["stop_code"],
			Name:               r["stop_name"],
			Lat:                lat,
			Lon:                lon,
			Timezone:           optStr(r, "stop_timezone"),
			WheelchairBoarding: optBool(r, "wheelchair_boarding"),
		})
	}
	return out, nil
}

func parseTrips(f *zip.File, agencyID string) ([]spec.Trip, error) {
	rows, err := readCSV(f)
	if err != nil {
		return nil, err
	}
	out := make([]spec.Trip, 0, len(rows))
	for _, r := range rows {
		out = append(out, spec.Trip{
			AgencyID:    agencyID,
			TripID:      agencyID + ":" + r["trip_id"],
			RouteID:     agencyID + ":" + r["route_id"],
			ServiceID:   r["service_id"],
			Headsign:    r["trip_headsign"],
			ShapeID:     optStr(r, "shape_id"),
			DirectionID: optInt(r, "direction_id"),
		})
	}
	return out, nil
}

func parseStopTimes(f *zip.File, agencyID string) ([]spec.ScheduledStopTime, error) {
	rows, err := readCSV(f)
	if err != nil {
		return nil, err
	}
	out := make([]spec.ScheduledStopTime, 0, len(rows))
	for _, r := range rows {
		seq, _ := strconv.Atoi(r["stop_sequence"])
		out = append(out, spec.ScheduledStopTime{
			AgencyID:      agencyID,
			TripID:        agencyID + ":" + r["trip_id"],
			StopID:        agencyID + ":" + r["stop_id"],
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

func parseCalendar(f *zip.File, agencyID string) ([]spec.ServiceCalendar, error) {
	rows, err := readCSV(f)
	if err != nil {
		return nil, err
	}
	out := make([]spec.ServiceCalendar, 0, len(rows))
	for _, r := range rows {
		start, _ := time.Parse("20060102", r["start_date"])
		end, _ := time.Parse("20060102", r["end_date"])
		out = append(out, spec.ServiceCalendar{
			AgencyID:  agencyID,
			ServiceID: r["service_id"],
			Monday:    r["monday"] == "1",
			Tuesday:   r["tuesday"] == "1",
			Wednesday: r["wednesday"] == "1",
			Thursday:  r["thursday"] == "1",
			Friday:    r["friday"] == "1",
			Saturday:  r["saturday"] == "1",
			Sunday:    r["sunday"] == "1",
			StartDate: start,
			EndDate:   end,
		})
	}
	return out, nil
}

func parseCalendarDates(f *zip.File, agencyID string) ([]spec.ServiceException, error) {
	rows, err := readCSV(f)
	if err != nil {
		return nil, err
	}
	out := make([]spec.ServiceException, 0, len(rows))
	for _, r := range rows {
		date, _ := time.Parse("20060102", r["date"])
		exType, _ := strconv.Atoi(r["exception_type"])
		out = append(out, spec.ServiceException{
			AgencyID:      agencyID,
			ServiceID:     r["service_id"],
			Date:          date,
			ExceptionType: exType,
		})
	}
	return out, nil
}
