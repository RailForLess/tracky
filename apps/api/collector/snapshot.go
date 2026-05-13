package collector

import (
	"time"

	"github.com/RailForLess/tracky/api/providers"
)

// Snapshot is the unit of work the collector emits per (provider, tick).
// On the wire it's JSON; in R2 the same JSON bytes are stored under Key().
type Snapshot struct {
	ProviderID string                  `json:"providerId"`
	Timestamp  time.Time               `json:"timestamp"`
	Feed       *providers.RealtimeFeed `json:"feed"`
}

// Key is the sortable R2 object name. Operator-first prefix keeps each
// provider's blobs grouped and chronologically ordered under their bucket
// directory, which is what the on-prem Drainer relies on for replay order.
func (s *Snapshot) Key() string {
	return "backlog/" + s.ProviderID + "/" + s.Timestamp.UTC().Format(time.RFC3339Nano) + ".bin"
}
