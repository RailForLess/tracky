package amtrak

import (
	"context"
	"crypto/aes"
	"crypto/cipher"
	"crypto/sha1"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"

	"golang.org/x/crypto/pbkdf2"

	"github.com/RailForLess/tracky/api/ids"
	"github.com/RailForLess/tracky/api/providers"
	"github.com/RailForLess/tracky/api/providers/base"
	"github.com/RailForLess/tracky/api/spec"
)

const (
	staticURL   = "https://content.amtrak.com/content/gtfs/GTFS.zip"
	realtimeURL = "https://maps.amtrak.com/services/MapDataService/trains/getTrainsData"

	saltHex       = "9a3686ac"
	ivHex         = "c6eb2f7f5c4740c1a2f708fefd947d39"
	publicKey     = "69af143c-e8cf-47f8-bf09-fc1f61e5cc33"
	masterSegment = 88 // chars at the end of the payload holding the encrypted private key
)

// amtrakTZ maps single-letter Amtrak timezone codes to IANA names.
var amtrakTZ = map[string]string{
	"P": "America/Los_Angeles",
	"M": "America/Denver",
	"C": "America/Chicago",
	"E": "America/New_York",
}

// amtrakBearing maps cardinal heading strings emitted by Amtrak's API to degrees.
var amtrakBearing = map[string]float64{
	"N": 0, "NE": 45, "E": 90, "SE": 135,
	"S": 180, "SW": 225, "W": 270, "NW": 315,
}

// Provider wraps the base provider and overrides realtime fetching.
// Amtrak does not publish a standard GTFS-RT feed; realtime data comes
// from their encrypted map API.
type Provider struct {
	base *base.Provider
}

// New returns an Amtrak provider.
func New() *Provider {
	return &Provider{
		base: base.New(base.Config{
			ProviderID: "amtrak",
			Name:       "Amtrak",
			StaticURL:  staticURL,
			// PositionsURL / TripUpdatesURL intentionally empty — FetchRealtime is overridden below
		}),
	}
}

// ID returns "amtrak".
func (p *Provider) ID() string {
	return p.base.ID()
}

// StaticURL returns Amtrak's GTFS static feed URL.
func (p *Provider) StaticURL() string {
	return p.base.StaticURL()
}

// FetchStatic delegates to the base provider — Amtrak's GTFS zip is standard.
func (p *Provider) FetchStatic(ctx context.Context) (*providers.StaticFeed, error) {
	return p.base.FetchStatic(ctx)
}

// amtrakClient bounds Amtrak realtime requests so a stuck connection can't
// hang an entire poll cycle when ctx has no deadline.
var amtrakClient = &http.Client{Timeout: 30 * time.Second}

// FetchRealtime fetches and decrypts the Amtrak train status API, mapping
// the response to TrainPositions and TrainStopTimes.
func (p *Provider) FetchRealtime(ctx context.Context) (*providers.RealtimeFeed, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, realtimeURL, nil)
	if err != nil {
		return nil, fmt.Errorf("amtrak: build request: %w", err)
	}
	req.Header.Set("User-Agent", "tracky")

	resp, err := amtrakClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("amtrak: fetch: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("amtrak: unexpected status %d", resp.StatusCode)
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("amtrak: read body: %w", err)
	}

	raw := string(body)
	if len(raw) <= masterSegment {
		return nil, fmt.Errorf("amtrak: payload too short (%d bytes)", len(raw))
	}

	plaintext, err := getDecryptedData(raw)
	if err != nil {
		return nil, fmt.Errorf("amtrak: decrypt: %w", err)
	}

	var data trainData
	if err := json.Unmarshal(plaintext, &data); err != nil {
		return nil, fmt.Errorf("amtrak: parse json: %w", err)
	}

	var positions []spec.TrainPosition
	var stopTimes []spec.TrainStopTime
	now := time.Now()

	for _, f := range data.Features {
		if len(f.Geometry.Coordinates) < 2 {
			continue
		}
		props := f.Properties
		tripID, err := ids.Encode(ids.KindTrip, "amtrak", props.TrainNum)
		if err != nil {
			// No train number (or other malformed input) → row is unidentifiable; skip.
			continue
		}
		// Parse OrigSchDep — the train's original scheduled departure from
		// its origin station — to derive the service date. Two simultaneous
		// runs of the same train number on different service days (e.g.
		// yesterday's Texas Eagle still en route + today's just departed)
		// are only distinguishable here. Skip if the feed omits/malforms
		// this field rather than collapsing every row to today.
		runDate, ok := parseAmtrakOrigDate(props.OrigSchDep)
		if !ok {
			log.Printf("amtrak: train %q missing/unparseable OrigSchDep %q; skipping", props.TrainNum, props.OrigSchDep)
			continue
		}

		// --- TrainPosition ---
		lon := f.Geometry.Coordinates[0]
		lat := f.Geometry.Coordinates[1]

		// RouteID is informational; if encoding fails (empty/malformed feed
		// data), leave it unset rather than dropping the whole position.
		routeID, _ := ids.Encode(ids.KindRoute, "amtrak", props.RouteName)
		pos := spec.TrainPosition{
			Provider:    "amtrak",
			TripID:      tripID,
			RunDate:     runDate,
			TrainNumber: props.TrainNum,
			RouteID:     routeID,
			Lat:         &lat,
			Lon:         &lon,
			LastUpdated: now,
		}

		if deg, ok := amtrakBearing[strings.ToUpper(strings.TrimSpace(props.Heading))]; ok {
			pos.Heading = &deg
		}

		if mph, err := strconv.ParseFloat(props.Velocity, 64); err == nil {
			pos.SpeedMPH = &mph
		}

		if props.EventCode != "" {
			stopCode, status := deriveStopAndStatus(props.EventCode, props.Stations)
			if code, err := ids.Encode(ids.KindStop, "amtrak", stopCode); err == nil {
				pos.CurrentStopCode = &code
			}
			if status != "" {
				pos.CurrentStatus = &status
			}
		}

		if t := parseAmtrakTime(props.UpdatedAt, ""); t != nil {
			pos.LastUpdated = *t
		}

		positions = append(positions, pos)

		// --- TrainStopTimes from StationN entries ---
		for _, station := range props.Stations {
			stopID, err := ids.Encode(ids.KindStop, "amtrak", station.Code)
			if err != nil {
				continue
			}
			st := spec.TrainStopTime{
				Provider:     "amtrak",
				TripID:       tripID,
				RunDate:      runDate,
				StopCode:     stopID,
				StopSequence: station.Sequence,
				LastUpdated:  now,
			}

			st.ScheduledArr = parseAmtrakTime(station.SchArr, station.Tz)
			st.ScheduledDep = parseAmtrakTime(station.SchDep, station.Tz)

			if station.PostArr != "" || station.PostDep != "" {
				// Train has passed this stop — post times are actuals.
				st.ActualArr = parseAmtrakTime(station.PostArr, station.Tz)
				st.ActualDep = parseAmtrakTime(station.PostDep, station.Tz)
			} else {
				// Upcoming stop — est times are live estimates.
				st.EstimatedArr = parseAmtrakTime(station.EstArr, station.Tz)
				st.EstimatedDep = parseAmtrakTime(station.EstDep, station.Tz)
			}

			stopTimes = append(stopTimes, st)
		}
	}

	return &providers.RealtimeFeed{
		Positions: positions,
		StopTimes: stopTimes,
	}, nil
}

// deriveStopAndStatus returns the stop code and VehicleStopStatus for the train,
// using EventCode (the Amtrak-reported reference station) and the parsed station list.
//
// Mapping:
//   - eventCode station has postarr but no postdep → STOPPED_AT eventCode
//   - eventCode station has both postarr and postdep → IN_TRANSIT_TO (next station in sequence)
//   - eventCode station has neither → INCOMING_AT eventCode
//
// If eventCode isn't found in the station list, the raw eventCode is returned
// with no status (caller will skip the status field).
func deriveStopAndStatus(eventCode string, stations []stationEntry) (string, spec.VehicleStopStatus) {
	idx := -1
	for i, s := range stations {
		if s.Code == eventCode {
			idx = i
			break
		}
	}
	if idx < 0 {
		return eventCode, ""
	}
	cur := stations[idx]
	switch {
	case cur.PostArr != "" && cur.PostDep == "":
		return eventCode, spec.VehicleStatusStoppedAt
	case cur.PostArr != "" && cur.PostDep != "":
		// Departed — point at the next station if there is one.
		if idx+1 < len(stations) {
			return stations[idx+1].Code, spec.VehicleStatusInTransitTo
		}
		// No next station: the train has finished its run; report STOPPED_AT.
		return eventCode, spec.VehicleStatusStoppedAt
	default:
		return eventCode, spec.VehicleStatusIncomingAt
	}
}

// parseAmtrakTime parses an Amtrak datetime string in the format "01/02/2006 15:04:05".
// tz is a single-letter Amtrak timezone code; if empty or unknown, UTC is used.
// Returns nil on empty input or parse failure.
func parseAmtrakTime(s, tz string) *time.Time {
	if s == "" {
		return nil
	}
	loc := time.UTC
	if ianaName, ok := amtrakTZ[tz]; ok {
		if l, err := time.LoadLocation(ianaName); err == nil {
			loc = l
		}
	}
	t, err := time.ParseInLocation("01/02/2006 15:04:05", s, loc)
	if err != nil {
		return nil
	}
	return &t
}

// parseAmtrakOrigDate extracts the service date from an OrigSchDep string
// like "5/13/2026 4:55:00 PM" (US format, single-digit month/day allowed,
// 12-hour clock). Only the date portion matters — the time-of-day and
// origin timezone don't affect which calendar day the run belongs to — so
// we return UTC midnight of that day to match the shape stamped by the
// GTFS-RT parser elsewhere.
func parseAmtrakOrigDate(s string) (time.Time, bool) {
	if s == "" {
		return time.Time{}, false
	}
	t, err := time.Parse("1/2/2006 3:04:05 PM", s)
	if err != nil {
		return time.Time{}, false
	}
	return time.Date(t.Year(), t.Month(), t.Day(), 0, 0, 0, 0, time.UTC), true
}

// getDecryptedData implements the two-pass decryption scheme:
//  1. The last masterSegment chars are an AES-encrypted private key, decrypted with publicKey.
//  2. The remainder is the encrypted train data, decrypted with the recovered private key.
func getDecryptedData(raw string) ([]byte, error) {
	mainContent := raw[:len(raw)-masterSegment]
	encryptedPrivateKey := raw[len(raw)-masterSegment:]

	privateKeyBytes, err := decrypt(encryptedPrivateKey, publicKey)
	if err != nil {
		return nil, fmt.Errorf("decrypting private key: %w", err)
	}
	privateKey := strings.SplitN(string(privateKeyBytes), "|", 2)[0]

	plaintext, err := decrypt(mainContent, privateKey)
	if err != nil {
		return nil, fmt.Errorf("decrypting train data: %w", err)
	}
	return plaintext, nil
}

// decrypt decrypts a base64-encoded AES-128-CBC ciphertext using a key derived
// via PBKDF2-SHA1 (1000 iterations, 16-byte output) with the fixed salt and IV.
func decrypt(content, key string) ([]byte, error) {
	salt, err := hex.DecodeString(saltHex)
	if err != nil {
		return nil, err
	}
	iv, err := hex.DecodeString(ivHex)
	if err != nil {
		return nil, err
	}

	derivedKey := pbkdf2.Key([]byte(key), salt, 1000, 16, sha1.New)

	ciphertext, err := base64.StdEncoding.DecodeString(content)
	if err != nil {
		return nil, fmt.Errorf("base64 decode: %w", err)
	}

	block, err := aes.NewCipher(derivedKey)
	if err != nil {
		return nil, err
	}

	if len(ciphertext)%aes.BlockSize != 0 {
		return nil, fmt.Errorf("ciphertext length %d not a multiple of block size", len(ciphertext))
	}

	cipher.NewCBCDecrypter(block, iv).CryptBlocks(ciphertext, ciphertext)
	return pkcs7Unpad(ciphertext), nil
}

func pkcs7Unpad(b []byte) []byte {
	if len(b) == 0 {
		return b
	}
	pad := int(b[len(b)-1])
	if pad == 0 || pad > aes.BlockSize || pad > len(b) {
		return b
	}
	return b[:len(b)-pad]
}
