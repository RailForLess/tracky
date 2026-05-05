// Package db provides Postgres-backed storage for static GTFS data.
//
// All static feeds (agencies, routes, stops, trips, scheduled_stop_times,
// service_calendars, service_exceptions) are persisted here, written by
// cmd/sync-static and read by the HTTP handlers in routes/static.go.
//
// The TimescaleDB extension is installed (see migrations/0001_init.sql) so
// future realtime tables can become hypertables; static tables are plain
// Postgres tables.
package db

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"
)

// DB wraps a pgxpool to a Postgres database.
type DB struct {
	pool *pgxpool.Pool
}

// Open dials Postgres at dsn (e.g. DATABASE_URL), runs any pending migrations,
// and returns a *DB.
//
// Caller is responsible for Close().
func Open(ctx context.Context, dsn string) (*DB, error) {
	cfg, err := pgxpool.ParseConfig(dsn)
	if err != nil {
		return nil, fmt.Errorf("db: parse dsn: %w", err)
	}
	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		return nil, fmt.Errorf("db: connect: %w", err)
	}
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("db: ping: %w", err)
	}
	if err := applySchema(ctx, pool); err != nil {
		pool.Close()
		return nil, err
	}
	return &DB{pool: pool}, nil
}

// Close releases the connection pool.
func (d *DB) Close() {
	d.pool.Close()
}

// Pool exposes the underlying pgxpool for advanced callers (read queries).
func (d *DB) Pool() *pgxpool.Pool { return d.pool }
