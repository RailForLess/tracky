package drainer

import (
	"context"
	"encoding/json"

	"github.com/RailForLess/tracky/api/collector"
)

// Action is what Drain should do with a key after Replay has handled it.
type Action int

const (
	// ActionDelete: safe to remove from R2. Either the snapshot was
	// processed successfully, or the JSON was unparseable (looping forever
	// on a corrupt blob would block the rest of the queue).
	ActionDelete Action = iota
	// ActionKeep: processor errored. Preserve so the next tick retries.
	ActionKeep
)

type Item struct {
	Key  string
	Body []byte
}

type Outcome struct {
	Key        string
	Action     Action
	ParseErr   error // set when JSON is corrupt → ActionDelete
	ProcessErr error // set when Processor failed → ActionKeep
}

// Replay walks items in order, calling Processor.Process for each parseable
// snapshot. Stops at the first processor error (returning that item with
// ActionKeep so the caller doesn't delete it). Items past the failure are
// not represented in the result and will be retried on the next tick.
//
// Pure over (items, processor) — no I/O. The S3 plumbing in Drain wraps it.
func Replay(ctx context.Context, items []Item, p Processor) []Outcome {
	out := make([]Outcome, 0, len(items))
	for _, it := range items {
		if ctx.Err() != nil {
			return out
		}
		var snap collector.Snapshot
		if err := json.Unmarshal(it.Body, &snap); err != nil {
			out = append(out, Outcome{Key: it.Key, Action: ActionDelete, ParseErr: err})
			continue
		}
		if err := p.Process(ctx, &snap); err != nil {
			out = append(out, Outcome{Key: it.Key, Action: ActionKeep, ProcessErr: err})
			return out
		}
		out = append(out, Outcome{Key: it.Key, Action: ActionDelete})
	}
	return out
}
