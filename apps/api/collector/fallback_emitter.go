package collector

import (
	"context"
	"errors"
	"fmt"
	"log"
)

// FallbackEmitter tries Primary; on error, falls back to Fallback. Both
// failures are returned together so the caller can decide whether the
// snapshot is truly lost (e.g. for metrics).
type FallbackEmitter struct {
	Primary  Emitter
	Fallback Emitter
}

func (e *FallbackEmitter) Emit(ctx context.Context, snap *Snapshot) error {
	if err := e.Primary.Emit(ctx, snap); err != nil {
		log.Printf("collector[%s]: primary emit failed, falling back: %v", snap.ProviderID, err)
		if fbErr := e.Fallback.Emit(ctx, snap); fbErr != nil {
			return fmt.Errorf("primary failed (%v) and fallback failed: %w", err, fbErr)
		}
		return nil
	}
	return nil
}

// ErrNoEmitter is returned by emit chains constructed with no destinations.
var ErrNoEmitter = errors.New("collector: no emitter configured")
