package gtfs

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"time"

	gtfsrt "github.com/MobilityData/gtfs-realtime-bindings/golang/gtfs"
	"google.golang.org/protobuf/proto"

	"github.com/RailForLess/tracky/api/spec"
)

// FetchAndParsePositions downloads a GTFS-RT vehicle positions feed and returns
// parsed TrainPositions stamped with providerID.
func FetchAndParsePositions(
	ctx context.Context,
	url string,
	providerID string,
	apiKey string,
) ([]spec.TrainPosition, error) {
	feed, err := fetchFeed(ctx, url, apiKey)
	if err != nil {
		return nil, fmt.Errorf("gtfs-rt positions: %w", err)
	}

	now := time.Now()
	var positions []spec.TrainPosition

	for _, entity := range feed.Entity {
		vp := entity.Vehicle
		if vp == nil || vp.Trip == nil {
			continue
		}

		pos := spec.TrainPosition{
			Provider:    providerID,
			LastUpdated: now,
		}

		if trip := vp.Trip; trip != nil {
			runDate, err := parseStartDate(trip.GetStartDate())
			if err != nil {
				// Skip entities without a valid start_date rather than
				// emitting a position with a zero RunDate.
				continue
			}
			pos.TripID = providerID + ":" + trip.GetTripId()
			pos.RouteID = providerID + ":" + trip.GetRouteId()
			pos.RunDate = runDate
		}

		if vehicle := vp.Vehicle; vehicle != nil {
			pos.TrainNumber = vehicle.GetLabel()
			pos.VehicleID = vehicle.GetId()
		}

		if p := vp.Position; p != nil {
			lat := float64(p.GetLatitude())
			lon := float64(p.GetLongitude())
			pos.Lat = &lat
			pos.Lon = &lon

			if p.Bearing != nil {
				deg := float64(p.GetBearing())
				pos.Heading = &deg
			}

			if p.Speed != nil {
				// GTFS-RT speed is m/s — convert to mph
				mph := float64(p.GetSpeed()) * 2.23694
				pos.SpeedMPH = &mph
			}
		}

		if vp.StopId != nil {
			stopID := providerID + ":" + vp.GetStopId()
			pos.CurrentStopCode = &stopID
		}

		if vp.CurrentStatus != nil {
			if idx := int(vp.GetCurrentStatus()); idx >= 0 && idx < len(spec.VehicleStopStatusByGTFSIndex) {
				status := spec.VehicleStopStatusByGTFSIndex[idx]
				pos.CurrentStatus = &status
			}
		}

		if vp.Timestamp != nil {
			pos.LastUpdated = time.Unix(int64(vp.GetTimestamp()), 0)
		}

		positions = append(positions, pos)
	}

	return positions, nil
}

// FetchAndParseTripUpdates downloads a GTFS-RT trip updates feed and returns
// parsed TrainStopTimes stamped with providerID.
func FetchAndParseTripUpdates(
	ctx context.Context,
	url string,
	providerID string,
	apiKey string,
) ([]spec.TrainStopTime, error) {
	feed, err := fetchFeed(ctx, url, apiKey)
	if err != nil {
		return nil, fmt.Errorf("gtfs-rt trip updates: %w", err)
	}

	now := time.Now()
	var stopTimes []spec.TrainStopTime

	for _, entity := range feed.Entity {
		tu := entity.TripUpdate
		if tu == nil {
			continue
		}

		trip := tu.Trip
		if trip == nil {
			continue
		}
		runDate, err := parseStartDate(trip.GetStartDate())
		if err != nil {
			// Skip entities without a valid start_date rather than
			// emitting stop times with a zero RunDate.
			continue
		}
		tripID := providerID + ":" + trip.GetTripId()

		for _, stu := range tu.StopTimeUpdate {
			st := spec.TrainStopTime{
				Provider:    providerID,
				TripID:      tripID,
				RunDate:     runDate,
				StopCode:    providerID + ":" + stu.GetStopId(),
				LastUpdated: now,
			}
			// Only set StopSequence when explicitly provided by the feed;
			// otherwise leave it zero so callers key by StopCode rather than
			// collapsing all stop-id-only updates into stop_sequence=0.
			if stu.StopSequence != nil {
				st.StopSequence = int(stu.GetStopSequence())
			}

			if arr := stu.Arrival; arr != nil && arr.Time != nil {
				t := time.Unix(arr.GetTime(), 0)
				st.EstimatedArr = &t
			}

			if dep := stu.Departure; dep != nil && dep.Time != nil {
				t := time.Unix(dep.GetTime(), 0)
				st.EstimatedDep = &t
			}

			stopTimes = append(stopTimes, st)
		}
	}

	return stopTimes, nil
}

// fetchFeed downloads and unmarshals a GTFS-RT protobuf feed.
func fetchFeed(ctx context.Context, url string, apiKey string) (*gtfsrt.FeedMessage, error) {
	data, err := fetchBytes(ctx, url, apiKey)
	if err != nil {
		return nil, fmt.Errorf("fetch %s: %w", url, err)
	}
	var feed gtfsrt.FeedMessage
	if err := proto.Unmarshal(data, &feed); err != nil {
		return nil, fmt.Errorf("fetch %s: unmarshal: %w", url, err)
	}
	return &feed, nil
}

// fetchBytes performs a GET request and returns the response body.
// If apiKey is non-empty, it's sent as a Bearer token in the Authorization header.
func fetchBytes(ctx context.Context, url string, apiKey string) ([]byte, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	if apiKey != "" {
		req.Header.Set("Authorization", "Bearer "+apiKey)
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

// parseStartDate parses a GTFS-RT start_date string (YYYYMMDD) into a time.Time.
func parseStartDate(s string) (time.Time, error) {
	return time.Parse("20060102", s)
}
