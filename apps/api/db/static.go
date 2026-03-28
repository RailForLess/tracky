package db

import (
	"context"
	"fmt"

	"github.com/Tracky-Trains/tracky/api/providers"
)

// SyncCounts holds the number of rows inserted per entity type.
type SyncCounts struct {
	Agencies   int `json:"agencies"`
	Routes     int `json:"routes"`
	Stops      int `json:"stops"`
	Trips      int `json:"trips"`
	StopTimes  int `json:"stopTimes"`
	Calendars  int `json:"calendars"`
	Exceptions int `json:"exceptions"`
}

// SaveStaticFeed replaces all static GTFS data for the given agency within
// a single transaction. It deletes existing rows then inserts new data.
func (d *DB) SaveStaticFeed(ctx context.Context, providerID string, feed *providers.StaticFeed) (SyncCounts, error) {
	tx, err := d.conn.BeginTx(ctx, nil)
	if err != nil {
		return SyncCounts{}, fmt.Errorf("db: begin tx: %w", err)
	}
	defer tx.Rollback()

	// Delete in reverse-dependency order.
	for _, table := range []string{
		"service_exceptions",
		"service_calendars",
		"scheduled_stop_times",
		"trips",
		"stops",
		"routes",
		"agencies",
	} {
		if _, err := tx.ExecContext(ctx, "DELETE FROM "+table+" WHERE provider_id = ?", providerID); err != nil {
			return SyncCounts{}, fmt.Errorf("db: delete %s: %w", table, err)
		}
	}

	var counts SyncCounts

	// --- Agencies ---
	if len(feed.Agencies) > 0 {
		stmt, err := tx.PrepareContext(ctx, `INSERT INTO agencies (provider_id, gtfs_agency_id, name, url, timezone, lang, phone, country) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
		if err != nil {
			return SyncCounts{}, fmt.Errorf("db: prepare agencies: %w", err)
		}
		defer stmt.Close()
		for _, a := range feed.Agencies {
			if _, err := stmt.ExecContext(ctx, a.ProviderID, a.GtfsAgencyID, a.Name, a.URL, a.Timezone, a.Lang, a.Phone, a.Country); err != nil {
				return SyncCounts{}, fmt.Errorf("db: insert agency %s/%s: %w", a.ProviderID, a.GtfsAgencyID, err)
			}
			counts.Agencies++
		}
	}

	// --- Routes ---
	if len(feed.Routes) > 0 {
		stmt, err := tx.PrepareContext(ctx, `INSERT INTO routes (route_id, provider_id, short_name, long_name, color, text_color, shape_id) VALUES (?, ?, ?, ?, ?, ?, ?)`)
		if err != nil {
			return SyncCounts{}, fmt.Errorf("db: prepare routes: %w", err)
		}
		defer stmt.Close()
		for _, r := range feed.Routes {
			if _, err := stmt.ExecContext(ctx, r.RouteID, r.ProviderID, r.ShortName, r.LongName, r.Color, r.TextColor, r.ShapeID); err != nil {
				return SyncCounts{}, fmt.Errorf("db: insert route %s: %w", r.RouteID, err)
			}
			counts.Routes++
		}
	}

	// --- Stops ---
	if len(feed.Stops) > 0 {
		stmt, err := tx.PrepareContext(ctx, `INSERT INTO stops (stop_id, provider_id, code, name, lat, lon, timezone, wheelchair_boarding) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
		if err != nil {
			return SyncCounts{}, fmt.Errorf("db: prepare stops: %w", err)
		}
		defer stmt.Close()
		for _, s := range feed.Stops {
			if _, err := stmt.ExecContext(ctx, s.StopID, s.ProviderID, s.Code, s.Name, s.Lat, s.Lon, s.Timezone, optBoolToNullInt(s.WheelchairBoarding)); err != nil {
				return SyncCounts{}, fmt.Errorf("db: insert stop %s: %w", s.StopID, err)
			}
			counts.Stops++
		}
	}

	// --- Trips ---
	if len(feed.Trips) > 0 {
		stmt, err := tx.PrepareContext(ctx, `INSERT INTO trips (trip_id, provider_id, route_id, service_id, headsign, shape_id, direction_id) VALUES (?, ?, ?, ?, ?, ?, ?)`)
		if err != nil {
			return SyncCounts{}, fmt.Errorf("db: prepare trips: %w", err)
		}
		defer stmt.Close()
		for _, t := range feed.Trips {
			if _, err := stmt.ExecContext(ctx, t.TripID, t.ProviderID, t.RouteID, t.ServiceID, t.Headsign, t.ShapeID, t.DirectionID); err != nil {
				return SyncCounts{}, fmt.Errorf("db: insert trip %s: %w", t.TripID, err)
			}
			counts.Trips++
		}
	}

	// --- Scheduled Stop Times ---
	if len(feed.StopTimes) > 0 {
		stmt, err := tx.PrepareContext(ctx, `INSERT INTO scheduled_stop_times (trip_id, stop_sequence, provider_id, stop_id, arrival_time, departure_time, timepoint, drop_off_type, pickup_type) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
		if err != nil {
			return SyncCounts{}, fmt.Errorf("db: prepare stop_times: %w", err)
		}
		defer stmt.Close()
		for _, st := range feed.StopTimes {
			if _, err := stmt.ExecContext(ctx, st.TripID, st.StopSequence, st.ProviderID, st.StopID, st.ArrivalTime, st.DepartureTime, optBoolToNullInt(st.Timepoint), st.DropOffType, st.PickupType); err != nil {
				return SyncCounts{}, fmt.Errorf("db: insert stop_time %s/%d: %w", st.TripID, st.StopSequence, err)
			}
			counts.StopTimes++
		}
	}

	// --- Service Calendars ---
	if len(feed.Calendars) > 0 {
		stmt, err := tx.PrepareContext(ctx, `INSERT INTO service_calendars (provider_id, service_id, monday, tuesday, wednesday, thursday, friday, saturday, sunday, start_date, end_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
		if err != nil {
			return SyncCounts{}, fmt.Errorf("db: prepare calendars: %w", err)
		}
		defer stmt.Close()
		for _, c := range feed.Calendars {
			if _, err := stmt.ExecContext(ctx,
				c.ProviderID, c.ServiceID,
				boolToInt(c.Monday), boolToInt(c.Tuesday), boolToInt(c.Wednesday),
				boolToInt(c.Thursday), boolToInt(c.Friday), boolToInt(c.Saturday), boolToInt(c.Sunday),
				c.StartDate.Format("2006-01-02"), c.EndDate.Format("2006-01-02"),
			); err != nil {
				return SyncCounts{}, fmt.Errorf("db: insert calendar %s/%s: %w", c.ProviderID, c.ServiceID, err)
			}
			counts.Calendars++
		}
	}

	// --- Service Exceptions ---
	if len(feed.Exceptions) > 0 {
		stmt, err := tx.PrepareContext(ctx, `INSERT INTO service_exceptions (provider_id, service_id, date, exception_type) VALUES (?, ?, ?, ?)`)
		if err != nil {
			return SyncCounts{}, fmt.Errorf("db: prepare exceptions: %w", err)
		}
		defer stmt.Close()
		for _, e := range feed.Exceptions {
			if _, err := stmt.ExecContext(ctx, e.ProviderID, e.ServiceID, e.Date.Format("2006-01-02"), e.ExceptionType); err != nil {
				return SyncCounts{}, fmt.Errorf("db: insert exception %s/%s: %w", e.ProviderID, e.ServiceID, err)
			}
			counts.Exceptions++
		}
	}

	if err := tx.Commit(); err != nil {
		return SyncCounts{}, fmt.Errorf("db: commit: %w", err)
	}

	return counts, nil
}

func boolToInt(b bool) int {
	if b {
		return 1
	}
	return 0
}

func optBoolToNullInt(b *bool) *int {
	if b == nil {
		return nil
	}
	v := boolToInt(*b)
	return &v
}
