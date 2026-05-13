package brightline

import (
	"github.com/RailForLess/tracky/api/providers/base"
)

const (
	staticURL      = "https://feed.gobrightline.com/bl_gtfs.zip"
	positionsURL   = "https://feed.gobrightline.com/position_updates.pb"
	tripUpdatesURL = "https://feed.gobrightline.com/trip_updates.pb"
)

// New returns a standard base provider configured for Brightline.
// Brightline correctly implements both GTFS and GTFS-RT, so no overrides are needed.
func New() *base.Provider {
	return base.New(base.Config{
		ProviderID:     "brightline",
		Name:           "Brightline",
		StaticURL:      staticURL,
		PositionsURL:   positionsURL,
		TripUpdatesURL: tripUpdatesURL,
	})
}
