package db

import (
	_ "embed"

	"context"

	"github.com/jackc/pgx/v5/pgxpool"
)

//go:embed schema.sql
var schemaSQL string

// applySchema runs the embedded schema.sql. It is idempotent
// (CREATE ... IF NOT EXISTS, CREATE OR REPLACE).
func applySchema(ctx context.Context, pool *pgxpool.Pool) error {
	_, err := pool.Exec(ctx, schemaSQL)
	return err
}
