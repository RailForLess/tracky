package spec

import "time"

// TrainPosition represents the current live position of an active train run.
// One row per (provider, trip_id, run_date). Upserted on every poll.
type TrainPosition struct {
	Provider        string    `db:"provider"          json:"provider"`
	TripID          string    `db:"trip_id"           json:"tripId"`
	RunDate         time.Time `db:"run_date"          json:"runDate"`
	TrainNumber     string    `db:"train_number"      json:"trainNumber"`
	RouteID         string    `db:"route_id"          json:"routeId"`
	VehicleID       string    `db:"vehicle_id"        json:"vehicleId"`
	Lat             *float64  `db:"lat"               json:"lat"`
	Lon             *float64  `db:"lon"               json:"lon"`
	Heading         *string   `db:"heading"           json:"heading"`
	SpeedMPH        *float64  `db:"speed_mph"         json:"speedMph"`
	CurrentStopCode *string   `db:"current_stop_code" json:"currentStopCode"`
	LastUpdated     time.Time `db:"last_updated"      json:"lastUpdated"`
}

// TrainStopTime represents a single stop within a single run of a trip.
// Serves dual purpose: live state (estimated times) and historical record (actual times).
// One row per (provider, trip_id, run_date, stop_code).
type TrainStopTime struct {
	Provider     string    `db:"provider"     json:"provider"`
	TripID       string    `db:"trip_id"      json:"tripId"`
	RunDate      time.Time `db:"run_date"     json:"runDate"`
	StopCode     string    `db:"stop_code"    json:"stopCode"`
	StopSequence int       `db:"stop_sequence" json:"stopSequence"`

	// From static GTFS — written once, never updated
	ScheduledArr *time.Time `db:"scheduled_arr" json:"scheduledArr"`
	ScheduledDep *time.Time `db:"scheduled_dep" json:"scheduledDep"`

	// Live estimates — updated each poll until actual is known
	EstimatedArr *time.Time `db:"estimated_arr" json:"estimatedArr"`
	EstimatedDep *time.Time `db:"estimated_dep" json:"estimatedDep"`

	// Actuals — written once when train passes stop, permanent
	ActualArr *time.Time `db:"actual_arr" json:"actualArr"`
	ActualDep *time.Time `db:"actual_dep" json:"actualDep"`

	LastUpdated time.Time `db:"last_updated" json:"lastUpdated"`
}

// IsPassed returns true if the train has already passed this stop.
func (s *TrainStopTime) IsPassed() bool {
	return s.ActualArr != nil
}

// IsLive returns true if this stop still has a pending estimate.
func (s *TrainStopTime) IsLive() bool {
	return s.ActualArr == nil && s.EstimatedArr != nil
}

// RunID returns a canonical string identifier for this specific train run.
// Useful for logging, caching keys, and display.
func (s *TrainStopTime) RunID() string {
	return s.Provider + ":" + s.TripID + ":" + s.RunDate.Format("2006-01-02")
}
