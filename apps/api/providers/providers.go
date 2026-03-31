package providers

import (
	"context"
	"fmt"
	"sort"

	"github.com/RailForLess/tracky/api/spec"
)

// Provider is the interface every transit data provider must implement.
type Provider interface {
	ID() string
	FetchStatic(ctx context.Context) (*StaticFeed, error)
	FetchRealtime(ctx context.Context) (*RealtimeFeed, error)
}

// StaticFeed holds all data parsed from a GTFS static zip.
type StaticFeed struct {
	Agencies   []spec.Agency            `json:"agencies"`
	Routes     []spec.Route             `json:"routes"`
	Stops      []spec.Stop              `json:"stops"`
	Trips      []spec.Trip              `json:"trips"`
	StopTimes  []spec.ScheduledStopTime `json:"stopTimes"`
	Calendars  []spec.ServiceCalendar   `json:"calendars"`
	Exceptions []spec.ServiceException  `json:"exceptions"`
	Shapes     []spec.ShapePoint        `json:"shapes"`
}

// RealtimeFeed holds all data parsed from a GTFS-RT protobuf feed.
type RealtimeFeed struct {
	Positions []spec.TrainPosition `json:"positions"`
	StopTimes []spec.TrainStopTime `json:"stopTimes"`
}

// Registry maps provider IDs to their implementations.
type Registry struct {
	providers map[string]Provider
}

// NewRegistry returns an empty Registry.
func NewRegistry() *Registry {
	return &Registry{providers: make(map[string]Provider)}
}

// Register adds a provider to the registry. Panics on duplicate ID.
func (r *Registry) Register(p Provider) {
	id := p.ID()
	if _, exists := r.providers[id]; exists {
		panic(fmt.Sprintf("providers: duplicate provider ID %q", id))
	}
	r.providers[id] = p
}

// Get returns the provider with the given ID.
func (r *Registry) Get(id string) (Provider, bool) {
	p, ok := r.providers[id]
	return p, ok
}

// All returns all registered providers sorted by ID.
func (r *Registry) All() []Provider {
	out := make([]Provider, 0, len(r.providers))
	for _, p := range r.providers {
		out = append(out, p)
	}
	sort.Slice(out, func(i, j int) bool {
		return out[i].ID() < out[j].ID()
	})
	return out
}
