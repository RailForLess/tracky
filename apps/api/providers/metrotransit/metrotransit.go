package metrotransit

import (
	"github.com/RailForLess/tracky/api/providers/base"
)

// see https://svc.metrotransit.org/
const (
	staticURL      = "https://svc.metrotransit.org/mtgtfs/next/gtfs.zip"
	positionsURL   = "https://svc.metrotransit.org/mtgtfs/vehiclepositions.pb"
	tripUpdatesURL = "https://svc.metrotransit.org/mtgtfs/tripupdates.pb"
)

// Returns a standard base provider configured for Metro Transit.

func New() *base.Provider {
	return base.New(base.Config{
		ProviderID:     "metrotransit",
		Name:           "Metro Transit",
		StaticURL:      staticURL,
		PositionsURL:   positionsURL,
		TripUpdatesURL: tripUpdatesURL,
	})
}
