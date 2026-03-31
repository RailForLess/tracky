package cta

import (
	"github.com/RailForLess/tracky/api/providers/base"
)

const (
	staticURL      = "https://www.transitchicago.com/downloads/sch_data/google_transit.zip"
	positionsURL   = "https://gtfspublic.metrarr.com/gtfs/public/positions"
	tripUpdatesURL = "https://gtfspublic.metrarr.com/gtfs/public/tripupdates"
)

// New returns a standard base provider configured for CTA.
// CTA requires a Bearer token for GTFS-RT; set CTA_API_KEY in the environment.
func New() *base.Provider {
	return base.New(base.Config{
		ProviderID:     "cta",
		Name:           "CTA",
		StaticURL:      staticURL,
		PositionsURL:   positionsURL,
		TripUpdatesURL: tripUpdatesURL,
		//RealtimeAPIKey: os.Getenv("CTA_API_KEY"),
	})
}
