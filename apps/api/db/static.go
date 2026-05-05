package db

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5"

	"github.com/RailForLess/tracky/api/providers"
	"github.com/RailForLess/tracky/api/spec"
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

// SaveStaticFeed atomically replaces all static GTFS data for the given
// provider in a single transaction. Old rows are deleted in reverse-
// dependency order, then new rows are bulk-inserted via COPY.
func (d *DB) SaveStaticFeed(ctx context.Context, providerID string, feed *providers.StaticFeed) (SyncCounts, error) {
	var counts SyncCounts
	err := pgx.BeginFunc(ctx, d.pool, func(tx pgx.Tx) error {
		for _, table := range []string{
			"service_exceptions",
			"service_calendars",
			"scheduled_stop_times",
			"trips",
			"stops",
			"routes",
			"agencies",
		} {
			if _, err := tx.Exec(ctx, "DELETE FROM "+table+" WHERE provider_id = $1", providerID); err != nil {
				return fmt.Errorf("delete %s: %w", table, err)
			}
		}

		var err error
		if counts.Agencies, err = copyAgencies(ctx, tx, feed.Agencies); err != nil {
			return err
		}
		if counts.Routes, err = copyRoutes(ctx, tx, feed.Routes); err != nil {
			return err
		}
		if counts.Stops, err = copyStops(ctx, tx, feed.Stops); err != nil {
			return err
		}
		if counts.Trips, err = copyTrips(ctx, tx, feed.Trips); err != nil {
			return err
		}
		if counts.StopTimes, err = copyStopTimes(ctx, tx, feed.StopTimes); err != nil {
			return err
		}
		if counts.Calendars, err = copyCalendars(ctx, tx, feed.Calendars); err != nil {
			return err
		}
		if counts.Exceptions, err = copyExceptions(ctx, tx, feed.Exceptions); err != nil {
			return err
		}
		return nil
	})
	return counts, err
}

func copyAgencies(ctx context.Context, tx pgx.Tx, rows []spec.Agency) (int, error) {
	if len(rows) == 0 {
		return 0, nil
	}
	src := pgx.CopyFromSlice(len(rows), func(i int) ([]any, error) {
		r := rows[i]
		return []any{r.ProviderID, r.GtfsAgencyID, r.Name, r.URL, r.Timezone, r.Lang, r.Phone, r.Country}, nil
	})
	n, err := tx.CopyFrom(ctx, pgx.Identifier{"agencies"},
		[]string{"provider_id", "gtfs_agency_id", "name", "url", "timezone", "lang", "phone", "country"},
		src)
	if err != nil {
		return 0, fmt.Errorf("copy agencies: %w", err)
	}
	return int(n), nil
}

func copyRoutes(ctx context.Context, tx pgx.Tx, rows []spec.Route) (int, error) {
	if len(rows) == 0 {
		return 0, nil
	}
	src := pgx.CopyFromSlice(len(rows), func(i int) ([]any, error) {
		r := rows[i]
		return []any{r.RouteID, r.ProviderID, r.ShortName, r.LongName, r.Color, r.TextColor, r.ShapeID}, nil
	})
	n, err := tx.CopyFrom(ctx, pgx.Identifier{"routes"},
		[]string{"route_id", "provider_id", "short_name", "long_name", "color", "text_color", "shape_id"},
		src)
	if err != nil {
		return 0, fmt.Errorf("copy routes: %w", err)
	}
	return int(n), nil
}

func copyStops(ctx context.Context, tx pgx.Tx, rows []spec.Stop) (int, error) {
	if len(rows) == 0 {
		return 0, nil
	}
	src := pgx.CopyFromSlice(len(rows), func(i int) ([]any, error) {
		r := rows[i]
		return []any{r.StopID, r.ProviderID, r.Code, r.Name, r.Lat, r.Lon, r.Timezone, r.WheelchairBoarding}, nil
	})
	n, err := tx.CopyFrom(ctx, pgx.Identifier{"stops"},
		[]string{"stop_id", "provider_id", "code", "name", "lat", "lon", "timezone", "wheelchair_boarding"},
		src)
	if err != nil {
		return 0, fmt.Errorf("copy stops: %w", err)
	}
	return int(n), nil
}

func copyTrips(ctx context.Context, tx pgx.Tx, rows []spec.Trip) (int, error) {
	if len(rows) == 0 {
		return 0, nil
	}
	src := pgx.CopyFromSlice(len(rows), func(i int) ([]any, error) {
		r := rows[i]
		return []any{r.TripID, r.ProviderID, r.RouteID, r.ServiceID, r.ShortName, r.Headsign, r.ShapeID, r.DirectionID}, nil
	})
	n, err := tx.CopyFrom(ctx, pgx.Identifier{"trips"},
		[]string{"trip_id", "provider_id", "route_id", "service_id", "short_name", "headsign", "shape_id", "direction_id"},
		src)
	if err != nil {
		return 0, fmt.Errorf("copy trips: %w", err)
	}
	return int(n), nil
}

func copyStopTimes(ctx context.Context, tx pgx.Tx, rows []spec.ScheduledStopTime) (int, error) {
	if len(rows) == 0 {
		return 0, nil
	}
	src := pgx.CopyFromSlice(len(rows), func(i int) ([]any, error) {
		r := rows[i]
		return []any{r.TripID, r.StopSequence, r.ProviderID, r.StopID, r.ArrivalTime, r.DepartureTime, r.Timepoint, r.DropOffType, r.PickupType}, nil
	})
	n, err := tx.CopyFrom(ctx, pgx.Identifier{"scheduled_stop_times"},
		[]string{"trip_id", "stop_sequence", "provider_id", "stop_id", "arrival_time", "departure_time", "timepoint", "drop_off_type", "pickup_type"},
		src)
	if err != nil {
		return 0, fmt.Errorf("copy stop_times: %w", err)
	}
	return int(n), nil
}

func copyCalendars(ctx context.Context, tx pgx.Tx, rows []spec.ServiceCalendar) (int, error) {
	if len(rows) == 0 {
		return 0, nil
	}
	src := pgx.CopyFromSlice(len(rows), func(i int) ([]any, error) {
		r := rows[i]
		return []any{r.ProviderID, r.ServiceID, r.Monday, r.Tuesday, r.Wednesday, r.Thursday, r.Friday, r.Saturday, r.Sunday, r.StartDate, r.EndDate}, nil
	})
	n, err := tx.CopyFrom(ctx, pgx.Identifier{"service_calendars"},
		[]string{"provider_id", "service_id", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday", "start_date", "end_date"},
		src)
	if err != nil {
		return 0, fmt.Errorf("copy calendars: %w", err)
	}
	return int(n), nil
}

func copyExceptions(ctx context.Context, tx pgx.Tx, rows []spec.ServiceException) (int, error) {
	if len(rows) == 0 {
		return 0, nil
	}
	src := pgx.CopyFromSlice(len(rows), func(i int) ([]any, error) {
		r := rows[i]
		return []any{r.ProviderID, r.ServiceID, r.Date, r.ExceptionType}, nil
	})
	n, err := tx.CopyFrom(ctx, pgx.Identifier{"service_exceptions"},
		[]string{"provider_id", "service_id", "date", "exception_type"},
		src)
	if err != nil {
		return 0, fmt.Errorf("copy exceptions: %w", err)
	}
	return int(n), nil
}
