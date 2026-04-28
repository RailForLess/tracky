package gtfs

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
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

	if b, err := json.MarshalIndent(feed.Entity, "", "  "); err == nil {
		filename := fmt.Sprintf("debug_%s_positions.json", providerID)
		if err := os.WriteFile(filename, b, 0644); err != nil {
			log.Printf("[DEBUG] failed to write %s: %v", filename, err)
		} else {
			log.Printf("[DEBUG] %s realtime positions (%d) saved to %s", providerID, len(feed.Entity), filename)
		}
	}

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
			pos.TripID = providerID + ":" + trip.GetTripId()
			pos.RouteID = providerID + ":" + trip.GetRouteId()
			pos.RunDate = parseStartDate(trip.GetStartDate())
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

	if b, err := json.MarshalIndent(feed.Entity, "", "  "); err == nil {
		filename := fmt.Sprintf("debug_%s_stoptimes.json", providerID)
		if err := os.WriteFile(filename, b, 0644); err != nil {
			log.Printf("[DEBUG] failed to write %s: %v", filename, err)
		} else {
			log.Printf("[DEBUG] %s trip updates (%d entities) saved to %s", providerID, len(feed.Entity), filename)
		}
	}

	for _, entity := range feed.Entity {
		tu := entity.TripUpdate
		if tu == nil {
			continue
		}

		tripID := ""
		runDate := time.Time{}

		if trip := tu.Trip; trip != nil {
			tripID = providerID + ":" + trip.GetTripId()
			runDate = parseStartDate(trip.GetStartDate())
		}

		for _, stu := range tu.StopTimeUpdate {
			st := spec.TrainStopTime{
				Provider:     providerID,
				TripID:       tripID,
				RunDate:      runDate,
				StopCode:     providerID + ":" + stu.GetStopId(),
				StopSequence: int(stu.GetStopSequence()),
				LastUpdated:  now,
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
func parseStartDate(s string) time.Time {
	t, _ := time.Parse("20060102", s)
	return t
}
