package amtrak

import (
	"encoding/json"
	"sort"
	"strconv"
	"strings"
)

// trainData is the top-level GeoJSON FeatureCollection returned after decryption.
type trainData struct {
	Features []trainFeature `json:"features"`
}

// trainFeature is a single train as a GeoJSON feature.
type trainFeature struct {
	Properties trainProperties `json:"properties"`
	Geometry   trainGeometry   `json:"geometry"`
}

// trainGeometry is a GeoJSON Point: coordinates are [lon, lat].
type trainGeometry struct {
	Coordinates []float64 `json:"coordinates"`
}

// trainProperties holds the known scalar fields from the Amtrak properties object,
// plus Stations which is populated by the custom unmarshaler from the StationN keys.
type trainProperties struct {
	TrainNum  string `json:"TrainNum"`
	RouteName string `json:"RouteName"`
	Velocity  string `json:"Velocity"`
	Heading   string `json:"Heading"`
	EventCode string `json:"EventCode"`
	UpdatedAt string `json:"updated_at"`

	// OrigSchDep is the train's original scheduled departure from its origin
	// station in agency-local time, formatted as "M/D/YYYY h:mm:ss AM/PM"
	// (e.g. "5/13/2026 4:55:00 PM"). The DATE PORTION identifies the run's
	// service day — distinct from `now` for multi-day runs (Texas Eagle,
	// California Zephyr, etc.) and the only way to disambiguate two
	// simultaneous runs of the same train number.
	OrigSchDep string `json:"OrigSchDep"`

	// Stations is derived from the StationN keys by UnmarshalJSON, sorted by sequence.
	Stations []stationEntry
}

// UnmarshalJSON handles the trainProperties object. Known scalar fields are decoded
// normally via a shadow struct; StationN keys (Station1, Station2, ...) are collected
// into Stations. Each non-null StationN value is a JSON string that itself encodes a
// JSON object, so two levels of unmarshaling are required.
func (p *trainProperties) UnmarshalJSON(data []byte) error {
	// Decode known scalar fields using a shadow alias to avoid recursion.
	type shadow struct {
		TrainNum   string `json:"TrainNum"`
		RouteName  string `json:"RouteName"`
		Velocity   string `json:"Velocity"`
		Heading    string `json:"Heading"`
		EventCode  string `json:"EventCode"`
		UpdatedAt  string `json:"updated_at"`
		OrigSchDep string `json:"OrigSchDep"`
	}
	var s shadow
	if err := json.Unmarshal(data, &s); err != nil {
		return err
	}
	p.TrainNum = s.TrainNum
	p.RouteName = s.RouteName
	p.Velocity = s.Velocity
	p.Heading = s.Heading
	p.EventCode = s.EventCode
	p.UpdatedAt = s.UpdatedAt
	p.OrigSchDep = s.OrigSchDep

	// Scan for StationN keys.
	var raw map[string]json.RawMessage
	if err := json.Unmarshal(data, &raw); err != nil {
		return err
	}

	for key, val := range raw {
		if !strings.HasPrefix(key, "Station") {
			continue
		}
		seq, err := strconv.Atoi(key[len("Station"):])
		if err != nil || seq <= 0 {
			continue
		}
		if string(val) == "null" {
			continue
		}

		// The value is a JSON string whose content is another JSON object.
		var jsonStr string
		if err := json.Unmarshal(val, &jsonStr); err != nil {
			continue
		}
		var entry stationEntry
		if err := json.Unmarshal([]byte(jsonStr), &entry); err != nil {
			continue
		}
		entry.Sequence = seq
		p.Stations = append(p.Stations, entry)
	}

	sort.Slice(p.Stations, func(i, j int) bool {
		return p.Stations[i].Sequence < p.Stations[j].Sequence
	})

	return nil
}

// stationEntry represents a single stop's status as embedded in a StationN value.
//
// Time semantics:
//   - PostArr / PostDep present → train has already passed (actual times)
//   - EstArr  / EstDep  present → upcoming stop with a live estimate
//   - SchArr  / SchDep  always  → the static scheduled time
//
// The Tz field is a single-letter abbreviation: P=Pacific, M=Mountain, C=Central, E=Eastern.
type stationEntry struct {
	Sequence int // populated from the key name, not the JSON

	Code string `json:"code"`
	Tz   string `json:"tz"`

	SchArr string `json:"scharr"`
	SchDep string `json:"schdep"`

	EstArr string `json:"estarr"`
	EstDep string `json:"estdep"`

	PostArr string `json:"postarr"`
	PostDep string `json:"postdep"`
}
