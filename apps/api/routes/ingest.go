package routes

import (
	"compress/gzip"
	"crypto/subtle"
	"encoding/json"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"

	"github.com/RailForLess/tracky/api/collector"
	"github.com/RailForLess/tracky/api/realtime"
)

const ingestSecretHeader = "X-Tracky-Ingest-Secret"
const maxIngestBody = 32 << 20 // 32 MiB — applied to *decompressed* body so a
//                                gzip bomb can't blow past it.

// HandleIngest accepts a Snapshot from the edge collector. If secret is
// non-empty, callers must present it in the X-Tracky-Ingest-Secret header.
// On success the snapshot is processed (hub publish + TODO timescale) and a
// 204 is returned.
func HandleIngest(processor *realtime.Processor, secret string) http.HandlerFunc {
	dumpDir := os.Getenv("INGEST_DUMP_DIR")
	if dumpDir != "" {
		if err := os.MkdirAll(dumpDir, 0o755); err != nil {
			log.Printf("ingest: dump dir %q: %v (disabling dump)", dumpDir, err)
			dumpDir = ""
		} else {
			log.Printf("ingest: dumping latest snapshot per provider to %s", dumpDir)
		}
	}

	return func(w http.ResponseWriter, r *http.Request) {
		if secret != "" {
			got := r.Header.Get(ingestSecretHeader)
			if subtle.ConstantTimeCompare([]byte(got), []byte(secret)) != 1 {
				http.Error(w, "unauthorized", http.StatusUnauthorized)
				return
			}
		}

		var src io.Reader = r.Body
		if r.Header.Get("Content-Encoding") == "gzip" {
			gz, err := gzip.NewReader(r.Body)
			if err != nil {
				http.Error(w, "gzip: "+err.Error(), http.StatusBadRequest)
				return
			}
			defer gz.Close()
			src = gz
		}

		body, err := io.ReadAll(io.LimitReader(src, maxIngestBody))
		if err != nil {
			http.Error(w, "read body: "+err.Error(), http.StatusBadRequest)
			return
		}

		var snap collector.Snapshot
		if err := json.Unmarshal(body, &snap); err != nil {
			http.Error(w, "decode snapshot: "+err.Error(), http.StatusBadRequest)
			return
		}

		if err := processor.Process(r.Context(), &snap); err != nil {
			log.Printf("ingest[%s]: process: %v", snap.ProviderID, err)
			http.Error(w, "process: "+err.Error(), http.StatusInternalServerError)
			return
		}

		var positions, stopTimes int
		if snap.Feed != nil {
			positions = len(snap.Feed.Positions)
			stopTimes = len(snap.Feed.StopTimes)
		}
		log.Printf("ingest[%s]: ts=%s positions=%d stop_times=%d bytes=%d",
			snap.ProviderID, snap.Timestamp.UTC().Format("15:04:05"), positions, stopTimes, len(body))

		if dumpDir != "" && snap.ProviderID != "" {
			path := filepath.Join(dumpDir, snap.ProviderID+".json")
			if err := os.WriteFile(path, body, 0o644); err != nil {
				log.Printf("ingest[%s]: dump: %v", snap.ProviderID, err)
			}
		}

		w.WriteHeader(http.StatusNoContent)
	}
}
