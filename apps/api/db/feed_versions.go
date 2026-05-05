package db

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
)

// FeedVersion is the most recently applied feed for a provider.
// Used to short-circuit sync-static when the source hasn't changed.
type FeedVersion struct {
	ID           int64
	ProviderID   string
	SourceURL    string
	SHA256       string
	ETag         string
	LastModified string
	SizeBytes    int64
}

// LatestApplied returns the most recently applied feed_versions row for the
// provider, or nil if none has been applied yet. Unapplied (pending) rows
// are ignored.
func (d *DB) LatestApplied(ctx context.Context, providerID string) (*FeedVersion, error) {
	row := d.pool.QueryRow(ctx, `
		SELECT id, provider_id, source_url, sha256,
		       COALESCE(etag, ''), COALESCE(last_modified, ''), size_bytes
		FROM feed_versions
		WHERE provider_id = $1 AND applied_at IS NOT NULL
		ORDER BY applied_at DESC
		LIMIT 1`, providerID)
	var v FeedVersion
	if err := row.Scan(&v.ID, &v.ProviderID, &v.SourceURL, &v.SHA256, &v.ETag, &v.LastModified, &v.SizeBytes); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, fmt.Errorf("db: latest applied: %w", err)
	}
	return &v, nil
}

// HasAppliedHash reports whether a feed with the given (provider_id, sha256)
// has ever been successfully applied.
func (d *DB) HasAppliedHash(ctx context.Context, providerID, sha string) (bool, error) {
	var exists bool
	err := d.pool.QueryRow(ctx, `
		SELECT EXISTS (
			SELECT 1 FROM feed_versions
			WHERE provider_id = $1 AND sha256 = $2 AND applied_at IS NOT NULL
		)`, providerID, sha).Scan(&exists)
	if err != nil {
		return false, fmt.Errorf("db: has applied hash: %w", err)
	}
	return exists, nil
}

// RecordFetch inserts a pending feed_versions row (applied_at NULL).
// Returns the new id. If the same (provider_id, sha256) already exists
// (unique constraint), the existing id is returned instead.
func (d *DB) RecordFetch(ctx context.Context, providerID, sourceURL, sha, etag, lastMod string, size int64) (int64, error) {
	var id int64
	err := d.pool.QueryRow(ctx, `
		INSERT INTO feed_versions (provider_id, source_url, sha256, etag, last_modified, size_bytes)
		VALUES ($1, $2, $3, NULLIF($4, ''), NULLIF($5, ''), $6)
		ON CONFLICT (provider_id, sha256) DO UPDATE
		    SET etag          = COALESCE(EXCLUDED.etag, feed_versions.etag),
		        last_modified = COALESCE(EXCLUDED.last_modified, feed_versions.last_modified),
		        fetched_at    = now()
		RETURNING id`, providerID, sourceURL, sha, etag, lastMod, size).Scan(&id)
	if err != nil {
		return 0, fmt.Errorf("db: record fetch: %w", err)
	}
	return id, nil
}

// MarkApplied flips applied_at to now() and stores per-entity counts.
func (d *DB) MarkApplied(ctx context.Context, id int64, counts SyncCounts) error {
	js, err := json.Marshal(counts)
	if err != nil {
		return fmt.Errorf("db: marshal counts: %w", err)
	}
	if _, err := d.pool.Exec(ctx, `
		UPDATE feed_versions
		SET applied_at = now(), counts = $2::jsonb
		WHERE id = $1`, id, string(js)); err != nil {
		return fmt.Errorf("db: mark applied: %w", err)
	}
	return nil
}
