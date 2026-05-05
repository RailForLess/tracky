-- Static GTFS schema for Tracky.
--
-- This file is the single source of truth for the database schema. It is
-- idempotent (CREATE ... IF NOT EXISTS, CREATE OR REPLACE) and runs on every
-- server / sync-static startup. When schema evolves in a way that isn't
-- covered by these idempotent forms (e.g. adding a column), drop in a real
-- migration runner; until then this stays simple.
--
-- Identifiers (route_id, stop_id, trip_id) are namespaced upstream as
-- "<provider_id>:<native_id>" so they're globally unique. service_id is
-- NOT namespaced; queries must always pair it with provider_id.

CREATE EXTENSION IF NOT EXISTS timescaledb;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ── agencies ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS agencies (
    provider_id    TEXT NOT NULL,
    gtfs_agency_id TEXT NOT NULL DEFAULT '',
    name           TEXT NOT NULL DEFAULT '',
    url            TEXT NOT NULL DEFAULT '',
    timezone       TEXT NOT NULL DEFAULT '',
    lang           TEXT,
    phone          TEXT,
    country        TEXT NOT NULL DEFAULT '',
    PRIMARY KEY (provider_id, gtfs_agency_id)
);

-- ── routes ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS routes (
    route_id    TEXT PRIMARY KEY,
    provider_id TEXT NOT NULL,
    short_name  TEXT NOT NULL DEFAULT '',
    long_name   TEXT NOT NULL DEFAULT '',
    color       TEXT NOT NULL DEFAULT '',
    text_color  TEXT NOT NULL DEFAULT '',
    shape_id    TEXT
);
CREATE INDEX IF NOT EXISTS idx_routes_provider   ON routes (provider_id);
CREATE INDEX IF NOT EXISTS idx_routes_short_trgm ON routes USING GIN (lower(short_name) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_routes_long_trgm  ON routes USING GIN (lower(long_name)  gin_trgm_ops);

-- ── stops ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS stops (
    stop_id             TEXT PRIMARY KEY,
    provider_id         TEXT NOT NULL,
    code                TEXT NOT NULL DEFAULT '',
    name                TEXT NOT NULL DEFAULT '',
    lat                 DOUBLE PRECISION NOT NULL DEFAULT 0,
    lon                 DOUBLE PRECISION NOT NULL DEFAULT 0,
    timezone            TEXT,
    wheelchair_boarding BOOLEAN
);
CREATE INDEX IF NOT EXISTS idx_stops_provider ON stops (provider_id);
-- Partial: some feeds (Brightline, Metra) leave stop_code blank for every row.
CREATE UNIQUE INDEX IF NOT EXISTS idx_stops_provider_code
    ON stops (provider_id, code) WHERE code <> '';
CREATE INDEX IF NOT EXISTS idx_stops_name_trgm ON stops USING GIN (lower(name) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_stops_code_trgm ON stops USING GIN (lower(code) gin_trgm_ops);

-- ── trips ──────────────────────────────────────────────────────────
-- short_name is the train number ("5", "171"). Was missing in the SQLite
-- schema and silently dropped by the parser; restored here.
CREATE TABLE IF NOT EXISTS trips (
    trip_id      TEXT PRIMARY KEY,
    provider_id  TEXT NOT NULL,
    route_id     TEXT NOT NULL,
    service_id   TEXT NOT NULL DEFAULT '',
    short_name   TEXT NOT NULL DEFAULT '',
    headsign     TEXT NOT NULL DEFAULT '',
    shape_id     TEXT,
    direction_id INTEGER
);
CREATE INDEX IF NOT EXISTS idx_trips_provider      ON trips (provider_id);
CREATE INDEX IF NOT EXISTS idx_trips_route         ON trips (route_id);
CREATE INDEX IF NOT EXISTS idx_trips_service       ON trips (provider_id, service_id);
CREATE INDEX IF NOT EXISTS idx_trips_short         ON trips (provider_id, short_name) WHERE short_name <> '';
CREATE INDEX IF NOT EXISTS idx_trips_short_trgm    ON trips USING GIN (lower(short_name) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_trips_headsign_trgm ON trips USING GIN (lower(headsign)   gin_trgm_ops);

-- ── scheduled_stop_times ────────────────────────────────────────────
-- arrival_time/departure_time stay TEXT because GTFS allows >24:00:00.
CREATE TABLE IF NOT EXISTS scheduled_stop_times (
    trip_id        TEXT    NOT NULL,
    stop_sequence  INTEGER NOT NULL,
    provider_id    TEXT    NOT NULL,
    stop_id        TEXT    NOT NULL,
    arrival_time   TEXT,
    departure_time TEXT,
    timepoint      BOOLEAN,
    drop_off_type  INTEGER,
    pickup_type    INTEGER,
    PRIMARY KEY (trip_id, stop_sequence)
);
CREATE INDEX IF NOT EXISTS idx_sst_provider       ON scheduled_stop_times (provider_id);
CREATE INDEX IF NOT EXISTS idx_sst_stop_departure ON scheduled_stop_times (stop_id, departure_time);

-- ── service_calendars ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS service_calendars (
    provider_id TEXT    NOT NULL,
    service_id  TEXT    NOT NULL,
    monday      BOOLEAN NOT NULL DEFAULT FALSE,
    tuesday     BOOLEAN NOT NULL DEFAULT FALSE,
    wednesday   BOOLEAN NOT NULL DEFAULT FALSE,
    thursday    BOOLEAN NOT NULL DEFAULT FALSE,
    friday      BOOLEAN NOT NULL DEFAULT FALSE,
    saturday    BOOLEAN NOT NULL DEFAULT FALSE,
    sunday      BOOLEAN NOT NULL DEFAULT FALSE,
    start_date  DATE    NOT NULL,
    end_date    DATE    NOT NULL,
    PRIMARY KEY (provider_id, service_id)
);

-- ── service_exceptions ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS service_exceptions (
    provider_id    TEXT    NOT NULL,
    service_id     TEXT    NOT NULL,
    date           DATE    NOT NULL,
    exception_type INTEGER NOT NULL,
    PRIMARY KEY (provider_id, service_id, date)
);

-- ── feed_versions ──────────────────────────────────────────────────
-- Tracks which GTFS zip we last applied per provider, for change detection.
CREATE TABLE IF NOT EXISTS feed_versions (
    id            BIGSERIAL PRIMARY KEY,
    provider_id   TEXT NOT NULL,
    source_url    TEXT NOT NULL,
    sha256        TEXT NOT NULL,
    etag          TEXT,
    last_modified TEXT,
    size_bytes    BIGINT NOT NULL,
    fetched_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    applied_at    TIMESTAMPTZ,
    counts        JSONB NOT NULL DEFAULT '{}'::jsonb,
    UNIQUE (provider_id, sha256)
);
CREATE INDEX IF NOT EXISTS idx_feed_versions_applied
    ON feed_versions (provider_id, applied_at DESC NULLS LAST);

-- ── service_active(provider_id, service_id, date) ──────────────────
-- Returns TRUE if the service runs on the given date.
-- Checks calendar_dates.txt exception override first, then falls back
-- to calendar.txt day-of-week + start/end window.
CREATE OR REPLACE FUNCTION service_active(p_provider TEXT, p_service TEXT, p_date DATE)
RETURNS BOOLEAN AS $$
DECLARE
    exc INTEGER;
    base service_calendars%ROWTYPE;
    dow INTEGER;
BEGIN
    SELECT exception_type INTO exc
        FROM service_exceptions
        WHERE provider_id = p_provider AND service_id = p_service AND date = p_date
        LIMIT 1;
    IF exc = 1 THEN RETURN TRUE; END IF;
    IF exc = 2 THEN RETURN FALSE; END IF;

    SELECT * INTO base
        FROM service_calendars
        WHERE provider_id = p_provider AND service_id = p_service
        LIMIT 1;
    IF NOT FOUND THEN RETURN FALSE; END IF;
    IF p_date < base.start_date OR p_date > base.end_date THEN RETURN FALSE; END IF;

    dow := EXTRACT(DOW FROM p_date)::INTEGER;
    RETURN CASE dow
        WHEN 0 THEN base.sunday
        WHEN 1 THEN base.monday
        WHEN 2 THEN base.tuesday
        WHEN 3 THEN base.wednesday
        WHEN 4 THEN base.thursday
        WHEN 5 THEN base.friday
        WHEN 6 THEN base.saturday
    END;
END;
$$ LANGUAGE plpgsql STABLE;
