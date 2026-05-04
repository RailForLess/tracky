package collector

import (
	"context"
	"log"
	"time"

	"github.com/RailForLess/tracky/api/providers"
)

// StartPoller polls one provider's realtime feed on the given interval and
// emits a single Snapshot per tick. Blocks until ctx is cancelled. The
// emitter's chain (HTTP primary → R2 fallback) decides what happens when the
// on-prem server is unreachable.
func StartPoller(ctx context.Context, provider providers.Provider, emitter Emitter, interval time.Duration) {
	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	tick := func() {
		feed, err := provider.FetchRealtime(ctx)
		if err != nil {
			log.Printf("collector[%s]: fetch: %v", provider.ID(), err)
			return
		}
		snap := &Snapshot{
			ProviderID: provider.ID(),
			Timestamp:  time.Now().UTC(),
			Feed:       feed,
		}
		if err := emitter.Emit(ctx, snap); err != nil {
			log.Printf("collector[%s]: emit: %v", provider.ID(), err)
		}
	}

	tick()
	for {
		select {
		case <-ticker.C:
			tick()
		case <-ctx.Done():
			return
		}
	}
}
