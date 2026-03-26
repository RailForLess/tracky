package brightline

import (
	"github.com/Tracky-Trains/tracky/api/providers/base"
)

const (
	staticURL      = "http://feed.gobrightline.com/bl_gtfs.zip"
	positionsURL   = "http://feed.gobrightline.com/position_updates.pb"
	tripUpdatesURL = "http://feed.gobrightline.com/trip_updates.pb"
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
