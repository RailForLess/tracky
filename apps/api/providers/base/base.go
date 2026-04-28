package base

import (
	"context"
	"fmt"

	"github.com/RailForLess/tracky/api/gtfs"
	"github.com/RailForLess/tracky/api/providers"
)

// Config holds the configuration for a standard GTFS provider.
type Config struct {
	ProviderID     string
	Name           string
	StaticURL      string
	PositionsURL   string // GTFS-RT vehicle positions feed; empty = skip
	TripUpdatesURL string // GTFS-RT trip updates feed; empty = skip
	RealtimeAPIKey string // optional Bearer token for GTFS-RT requests
}

// Provider is a standard GTFS/GTFS-RT provider implementation.
// It satisfies providers.Provider and can be used directly for well-behaved feeds,
// or embedded in a custom provider struct that overrides specific methods.
type Provider struct {
	cfg Config
}

// New creates a Provider from the given config.
func New(cfg Config) *Provider {
	return &Provider{cfg: cfg}
}

// ID returns the provider's canonical identifier.
func (p *Provider) ID() string {
	return p.cfg.ProviderID
}

// FetchStatic downloads and parses the GTFS static zip, returning a StaticFeed.
func (p *Provider) FetchStatic(ctx context.Context) (*providers.StaticFeed, error) {
	agencies, routes, stops, trips, stopTimes, calendars, exceptions, shapes, err :=
		gtfs.FetchAndParseStatic(ctx, p.cfg.StaticURL, p.cfg.ProviderID)
	if err != nil {
		return nil, fmt.Errorf("%s: FetchStatic: %w", p.cfg.ProviderID, err)
	}
	return &providers.StaticFeed{
		Agencies:   agencies,
		Routes:     routes,
		Stops:      stops,
		Trips:      trips,
		StopTimes:  stopTimes,
		Calendars:  calendars,
		Exceptions: exceptions,
		Shapes:     shapes,
	}, nil
}

// FetchRealtime fetches vehicle positions and trip updates, returning a combined RealtimeFeed.
// Either URL may be empty, in which case that portion is skipped.
func (p *Provider) FetchRealtime(ctx context.Context) (*providers.RealtimeFeed, error) {
	feed := &providers.RealtimeFeed{}

	if p.cfg.PositionsURL != "" {
		positions, err := gtfs.FetchAndParsePositions(ctx, p.cfg.PositionsURL, p.cfg.ProviderID, p.cfg.RealtimeAPIKey)
		if err != nil {
			return nil, fmt.Errorf("%s: FetchRealtime positions: %w", p.cfg.ProviderID, err)
		}
		feed.Positions = positions
	}

	if p.cfg.TripUpdatesURL != "" {
		stopTimes, err := gtfs.FetchAndParseTripUpdates(ctx, p.cfg.TripUpdatesURL, p.cfg.ProviderID, p.cfg.RealtimeAPIKey)
		if err != nil {
			return nil, fmt.Errorf("%s: FetchRealtime trip updates: %w", p.cfg.ProviderID, err)
		}
		feed.StopTimes = stopTimes
	}

	return feed, nil
}
