package spec

import "time"

// Agency represents a transit operator.
// Maps to GTFS agency.txt. Root of the namespace for all entities.
// Replaces the custom Provider concept — agency_id is the canonical identifier.
type Agency struct {
	ProviderID   string  `db:"provider_id"      json:"providerId"` // provider namespace: 'amtrak', 'brightline'
	GtfsAgencyID string  `db:"gtfs_agency_id" json:"gtfsAgencyId"` // native GTFS agency_id from feed
	Name         string  `db:"name"           json:"name"`         // 'National Railroad Passenger Corporation'
	URL          string  `db:"url"            json:"url"`          // 'https://www.amtrak.com'
	Timezone     string  `db:"timezone"       json:"timezone"`     // 'America/New_York'
	Lang         *string `db:"lang"           json:"lang"`         // 'en'
	Phone        *string `db:"phone"          json:"phone"`
	Country      string  `db:"country"        json:"country"` // 'US', 'CA' — extension, not in GTFS spec
}

// Route represents a named service operated by an agency.
// Maps to GTFS routes.txt.
type Route struct {
	ProviderID string  `db:"provider_id"  json:"providerId"` // 'amtrak'
	RouteID    string  `db:"route_id"   json:"routeId"`      // typed global id: 'r-amtrak-coast-starlight'
	ShortName  string  `db:"short_name" json:"shortName"`    // '14'
	LongName   string  `db:"long_name"  json:"longName"`     // 'Coast Starlight'
	Color      string  `db:"color"      json:"color"`        // hex without #, e.g. '1D2E6E'
	TextColor  string  `db:"text_color" json:"textColor"`    // hex without #, e.g. 'FFFFFF'
	ShapeID    *string `db:"shape_id"   json:"shapeId"`      // reference into tile layer, not a DB table
}

// StopType is the JSON discriminator emitted on /v1/stops/{id} responses so
// TypeScript clients can use a discriminated union over Stop | Hub.
type StopType string

const (
	StopTypeStop StopType = "stop"
	StopTypeHub  StopType = "hub"
)

// Stop represents a physical station or stop.
// Maps to GTFS stops.txt.
//
// Type is the polymorphic discriminator for /v1/stops/{id} responses; it is
// always StopTypeStop on this struct. The Hub variant of the union lives in
// spec.Hub and emits StopTypeHub.
type Stop struct {
	Type               StopType `db:"-"                   json:"type"`                  // always "stop"
	ProviderID         string   `db:"provider_id"           json:"providerId"`          // 'amtrak'
	StopID             string   `db:"stop_id"             json:"stopId"`                // typed global id: 's-amtrak-LAX'
	Code               string   `db:"code"                json:"code"`                  // native code: 'LAX'
	Name               string   `db:"name"                json:"name"`                  // 'Los Angeles'
	Lat                float64  `db:"lat"                 json:"lat"`
	Lon                float64  `db:"lon"                 json:"lon"`
	Timezone           *string  `db:"timezone"            json:"timezone"` // stop-local tz if different from agency
	WheelchairBoarding *bool    `db:"wheelchair_boarding" json:"wheelchairBoarding"`
}

// Trip represents a scheduled service pattern.
// Maps to GTFS trips.txt — one row per trip_id in the feed.
// Note: a Trip is the template; a run is Trip + RunDate.
type Trip struct {
	ProviderID  string  `db:"provider_id"  json:"providerId"`  // 'amtrak'
	TripID      string  `db:"trip_id"      json:"tripId"`      // typed global id: 't-amtrak-5'
	RouteID     string  `db:"route_id"     json:"routeId"`     // 'r-amtrak-coast-starlight'
	ServiceID   string  `db:"service_id"   json:"serviceId"`   // links to ServiceCalendar
	ShortName   string  `db:"short_name"   json:"shortName"`   // GTFS trip_short_name — train number, e.g. '5'
	Headsign    string  `db:"headsign"     json:"headsign"`    // 'Chicago'
	ShapeID     *string `db:"shape_id"     json:"shapeId"`     // for geometry lookup, matches Route.ShapeID
	DirectionID *int    `db:"direction_id" json:"directionId"` // 0=outbound, 1=inbound
}

// Hub is the future "meta-station" type — a deduplicated grouping of stops
// across providers at a single physical location (e.g. CHI Union Station
// served by both Amtrak and Metra). Polymorphic /v1/stops/{id} returns this
// for ids with the 'h-' prefix.
//
// Stubbed: hubs are not yet ingested, so handlers return 501 for hub ids.
// The struct lives here so the JSON contract is stable when the table lands.
type Hub struct {
	Type     StopType `db:"-"       json:"type"`     // always "hub"
	HubID    string   `db:"hub_id"  json:"hubId"`    // typed global id: 'h-amtrak-CHI~UNION'
	Name     string   `db:"name"    json:"name"`     // 'Chicago Union Station'
	Lat      float64  `db:"lat"     json:"lat"`
	Lon      float64  `db:"lon"     json:"lon"`
	Timezone *string  `db:"timezone" json:"timezone"`
	// Members are the stop ids that belong to this hub. Populated by the
	// hub-resolution layer at read time.
	Members []string `db:"-" json:"members"`
}

// ScheduledStopTime represents a trip's scheduled arrival/departure at a stop.
// Maps to GTFS stop_times.txt. Static timetable only — never updated.
// Actual and estimated times live in TrainStopTime (realtime model).
type ScheduledStopTime struct {
	ProviderID    string  `db:"provider_id"      json:"providerId"`
	TripID        string  `db:"trip_id"        json:"tripId"`
	StopID        string  `db:"stop_id"        json:"stopId"`
	StopSequence  int     `db:"stop_sequence"  json:"stopSequence"`
	ArrivalTime   *string `db:"arrival_time"   json:"arrivalTime"`   // string: GTFS allows >24:00:00
	DepartureTime *string `db:"departure_time" json:"departureTime"` // string: same reason
	Timepoint     *bool   `db:"timepoint"      json:"timepoint"`     // true=exact, false=approximate
	DropOffType   *int    `db:"drop_off_type"  json:"dropOffType"`   // 0=regular, 1=none, 2=phone, 3=arrange
	PickupType    *int    `db:"pickup_type"    json:"pickupType"`    // same codes
}

// ServiceCalendar represents which days of the week a service_id runs.
// Maps to GTFS calendar.txt.
type ServiceCalendar struct {
	ProviderID string    `db:"provider_id"  json:"providerId"`
	ServiceID  string    `db:"service_id" json:"serviceId"`
	Monday     bool      `db:"monday"     json:"monday"`
	Tuesday    bool      `db:"tuesday"    json:"tuesday"`
	Wednesday  bool      `db:"wednesday"  json:"wednesday"`
	Thursday   bool      `db:"thursday"   json:"thursday"`
	Friday     bool      `db:"friday"     json:"friday"`
	Saturday   bool      `db:"saturday"   json:"saturday"`
	Sunday     bool      `db:"sunday"     json:"sunday"`
	StartDate  time.Time `db:"start_date" json:"startDate"`
	EndDate    time.Time `db:"end_date"   json:"endDate"`
}

// ServiceException represents a one-off addition or removal of service.
// Maps to GTFS calendar_dates.txt.
// Note: calendar.txt is optional if calendar_dates.txt covers all service dates.
type ServiceException struct {
	ProviderID    string    `db:"provider_id"      json:"providerId"`
	ServiceID     string    `db:"service_id"     json:"serviceId"`
	Date          time.Time `db:"date"           json:"date"`
	ExceptionType int       `db:"exception_type" json:"exceptionType"` // 1=service added, 2=service removed
}

// ShapePoint represents a single point in a shape's geometry.
// Maps to a single row in GTFS shapes.txt.
// Not stored in SQLite — consumed exclusively by the tile generation pipeline.
type ShapePoint struct {
	ProviderID   string   `json:"providerId"`
	ShapeID      string   `json:"shapeId"`
	Lat          float64  `json:"lat"`
	Lon          float64  `json:"lon"`
	Sequence     int      `json:"sequence"`
	DistTraveled *float64 `json:"distTraveled,omitempty"`
}
