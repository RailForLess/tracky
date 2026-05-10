package db

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5"

	"github.com/RailForLess/tracky/api/spec"
)

// UpsertTrainStopTimes writes per-stop realtime state for the given runs.
// One row per (provider, trip_id, run_date, stop_sequence). On conflict:
//   - estimated_arr / estimated_dep always overwrite (each poll = freshest)
//   - actual_arr   / actual_dep   are preserved via COALESCE so a once-written
//     actual is never clobbered by a later nil
//   - last_updated bumps to now()
//
// Static scheduled_* fields on TrainStopTime are ignored; they're sourced from
// scheduled_stop_times at read time.
func (d *DB) UpsertTrainStopTimes(ctx context.Context, sts []spec.TrainStopTime) error {
	if len(sts) == 0 {
		return nil
	}
	const q = `
		INSERT INTO train_stop_times (
		    provider, trip_id, run_date, stop_sequence, stop_code,
		    estimated_arr, estimated_dep, actual_arr, actual_dep, last_updated
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
		ON CONFLICT (provider, trip_id, run_date, stop_sequence) DO UPDATE SET
		    stop_code     = EXCLUDED.stop_code,
		    estimated_arr = EXCLUDED.estimated_arr,
		    estimated_dep = EXCLUDED.estimated_dep,
		    actual_arr    = COALESCE(EXCLUDED.actual_arr, train_stop_times.actual_arr),
		    actual_dep    = COALESCE(EXCLUDED.actual_dep, train_stop_times.actual_dep),
		    last_updated  = EXCLUDED.last_updated
		WHERE EXCLUDED.last_updated >= train_stop_times.last_updated`

	batch := &pgx.Batch{}
	for _, s := range sts {
		batch.Queue(q,
			s.Provider, s.TripID, s.RunDate, s.StopSequence, s.StopCode,
			s.EstimatedArr, s.EstimatedDep, s.ActualArr, s.ActualDep, s.LastUpdated,
		)
	}
	br := d.pool.SendBatch(ctx, batch)
	defer br.Close()
	for range sts {
		if _, err := br.Exec(); err != nil {
			return fmt.Errorf("upsert train_stop_times: %w", err)
		}
	}
	return nil
}
