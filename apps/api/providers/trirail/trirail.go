package trirail

import (
	"github.com/Tracky-Trains/tracky/api/providers/base"
)

// see https://gtfsr.tri-rail.com/
const (
	staticURL      = "https://gtfs.tri-rail.com/gtfs.zip"
	positionsURL   = "https://gtfsr.tri-rail.com/download.aspx?file=position_updates.pb"
	tripUpdatesURL = "https://gtfsr.tri-rail.com/download.aspx?file=trip_updates.pb"
)

// Returns a standard base provider configured for Tri-Rail.
//
// Known issues with Tri-Rail's GTFS-RT feed (trip_updates):
//   - stop_time_update entries omit stop_id — stops are identified only by stop_sequence.
//     Resolving stop codes requires a static GTFS lookup by (trip_id, stop_sequence).
//   - arrival/departure times are delay-only (e.g. {"delay": 0}) with no absolute time field.
//     Estimated times must be derived by adding the delay to the static scheduled time.
//   - trip entries omit route_id and start_date, so RouteID and RunDate are always empty.
//     Both fields must be resolved from static GTFS using trip_id.
func New() *base.Provider {
	return base.New(base.Config{
		ProviderID:     "trirail",
		Name:           "Tri-Rail",
		StaticURL:      staticURL,
		PositionsURL:   positionsURL,
		TripUpdatesURL: tripUpdatesURL,
	})
}
