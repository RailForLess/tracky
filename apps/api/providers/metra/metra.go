package metra

import (
	"os"

	"github.com/RailForLess/tracky/api/providers/base"
)

const (
	staticURL      = "https://schedules.metrarail.com/gtfs/schedule.zip"
	positionsURL   = "https://gtfspublic.metrarr.com/gtfs/public/positions"
	tripUpdatesURL = "https://gtfspublic.metrarr.com/gtfs/public/tripupdates"
)

// New returns a standard base provider configured for Metra.
// Metra requires a Bearer token for GTFS-RT; set METRA_API_KEY in the environment.
func New() *base.Provider {
	return base.New(base.Config{
		ProviderID:     "metra",
		Name:           "Metra",
		StaticURL:      staticURL,
		PositionsURL:   positionsURL,
		TripUpdatesURL: tripUpdatesURL,
		RealtimeAPIKey: os.Getenv("METRA_API_KEY"),
	})
}
