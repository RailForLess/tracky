package db

import (
	"database/sql"
	"fmt"

	_ "modernc.org/sqlite"
)

// DB wraps a *sql.DB connection to a SQLite database.
type DB struct {
	conn *sql.DB
}

// Open creates or opens a SQLite database at the given path
// and initializes the schema.
func Open(path string) (*DB, error) {
	conn, err := sql.Open("sqlite", path)
	if err != nil {
		return nil, fmt.Errorf("db: open %s: %w", path, err)
	}

	// SQLite performs best with a single connection for writes.
	conn.SetMaxOpenConns(1)

	if err := initSchema(conn); err != nil {
		conn.Close()
		return nil, fmt.Errorf("db: init schema: %w", err)
	}

	return &DB{conn: conn}, nil
}

// Close closes the underlying database connection.
func (d *DB) Close() error {
	return d.conn.Close()
}

func initSchema(conn *sql.DB) error {
	_, err := conn.Exec(schemaSQL)
	return err
}

const schemaSQL = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS agencies (
	provider_id      TEXT NOT NULL,
	gtfs_agency_id TEXT NOT NULL DEFAULT '',
	name           TEXT NOT NULL DEFAULT '',
	url            TEXT NOT NULL DEFAULT '',
	timezone       TEXT NOT NULL DEFAULT '',
	lang           TEXT,
	phone          TEXT,
	country        TEXT NOT NULL DEFAULT '',
	PRIMARY KEY (provider_id, gtfs_agency_id)
);

CREATE TABLE IF NOT EXISTS routes (
	route_id   TEXT PRIMARY KEY,
	provider_id  TEXT NOT NULL,
	short_name TEXT NOT NULL DEFAULT '',
	long_name  TEXT NOT NULL DEFAULT '',
	color      TEXT NOT NULL DEFAULT '',
	text_color TEXT NOT NULL DEFAULT '',
	shape_id   TEXT
);
CREATE INDEX IF NOT EXISTS idx_routes_provider ON routes(provider_id);

CREATE TABLE IF NOT EXISTS stops (
	stop_id             TEXT PRIMARY KEY,
	provider_id           TEXT NOT NULL,
	code                TEXT NOT NULL DEFAULT '',
	name                TEXT NOT NULL DEFAULT '',
	lat                 REAL NOT NULL DEFAULT 0,
	lon                 REAL NOT NULL DEFAULT 0,
	timezone            TEXT,
	wheelchair_boarding INTEGER
);
CREATE INDEX IF NOT EXISTS idx_stops_provider ON stops(provider_id);

CREATE TABLE IF NOT EXISTS trips (
	trip_id      TEXT PRIMARY KEY,
	provider_id    TEXT NOT NULL,
	route_id     TEXT NOT NULL,
	service_id   TEXT NOT NULL DEFAULT '',
	headsign     TEXT NOT NULL DEFAULT '',
	shape_id     TEXT,
	direction_id INTEGER
);
CREATE INDEX IF NOT EXISTS idx_trips_provider ON trips(provider_id);
CREATE INDEX IF NOT EXISTS idx_trips_route  ON trips(route_id);

CREATE TABLE IF NOT EXISTS scheduled_stop_times (
	trip_id        TEXT    NOT NULL,
	stop_sequence  INTEGER NOT NULL,
	provider_id      TEXT    NOT NULL,
	stop_id        TEXT    NOT NULL,
	arrival_time   TEXT,
	departure_time TEXT,
	timepoint      INTEGER,
	drop_off_type  INTEGER,
	pickup_type    INTEGER,
	PRIMARY KEY (trip_id, stop_sequence)
);
CREATE INDEX IF NOT EXISTS idx_sst_provider ON scheduled_stop_times(provider_id);

CREATE TABLE IF NOT EXISTS service_calendars (
	provider_id  TEXT    NOT NULL,
	service_id TEXT    NOT NULL,
	monday     INTEGER NOT NULL DEFAULT 0,
	tuesday    INTEGER NOT NULL DEFAULT 0,
	wednesday  INTEGER NOT NULL DEFAULT 0,
	thursday   INTEGER NOT NULL DEFAULT 0,
	friday     INTEGER NOT NULL DEFAULT 0,
	saturday   INTEGER NOT NULL DEFAULT 0,
	sunday     INTEGER NOT NULL DEFAULT 0,
	start_date TEXT    NOT NULL,
	end_date   TEXT    NOT NULL,
	PRIMARY KEY (provider_id, service_id)
);

CREATE TABLE IF NOT EXISTS service_exceptions (
	provider_id      TEXT    NOT NULL,
	service_id     TEXT    NOT NULL,
	date           TEXT    NOT NULL,
	exception_type INTEGER NOT NULL,
	PRIMARY KEY (provider_id, service_id, date)
);
`
