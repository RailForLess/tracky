package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/RailForLess/tracky/api/collector"
	"github.com/RailForLess/tracky/api/config"
	"github.com/RailForLess/tracky/api/providers"
	"github.com/RailForLess/tracky/api/providers/amtrak"
	"github.com/RailForLess/tracky/api/providers/brightline"
	"github.com/RailForLess/tracky/api/providers/metra"
	"github.com/RailForLess/tracky/api/providers/metrotransit"
	"github.com/RailForLess/tracky/api/providers/trirail"
)

const pollInterval = 30 * time.Second

func main() {
	config.LoadEnv("cmd/collector/.env")

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	go runHealthServer(ctx)

	emitter := buildEmitter()

	registry := providers.NewRegistry()
	registry.Register(amtrak.New())
	registry.Register(brightline.New())
	//registry.Register(cta.New())
	registry.Register(metra.New())
	registry.Register(metrotransit.New())
	registry.Register(trirail.New())

	all := registry.All()
	stagger := pollInterval / time.Duration(len(all))

	log.Printf("collector: starting %d providers, interval=%s, stagger=%s", len(all), pollInterval, stagger)
	for i, p := range all {
		offset := time.Duration(i) * stagger
		go func(p providers.Provider, offset time.Duration) {
			select {
			case <-time.After(offset):
			case <-ctx.Done():
				return
			}
			log.Printf("collector[%s]: starting (offset %s)", p.ID(), offset)
			collector.StartPoller(ctx, p, emitter, pollInterval)
		}(p, offset)
	}

	<-ctx.Done()
	log.Printf("collector: shutting down")
}

func runHealthServer(ctx context.Context) {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok from collector container"))
	})

	srv := &http.Server{Addr: ":" + port, Handler: mux}

	go func() {
		<-ctx.Done()
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if err := srv.Shutdown(shutdownCtx); err != nil {
			log.Printf("collector: health server shutdown: %v", err)
		}
	}()

	log.Printf("collector: health server listening on :%s", port)
	if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Printf("collector: health server error: %v", err)
	}
}

// buildEmitter wires the chain based on env vars:
//   - INGEST_URL set                    → HTTPEmitter (primary)
//   - BACKLOG_URL set                   → StorageEmitter (fallback)
//   - both                              → FallbackEmitter chaining them
//   - neither                           → MockEmitter (default for local dev)
func buildEmitter() collector.Emitter {
	ingestURL := os.Getenv("INGEST_URL")
	backlogURL := os.Getenv("BACKLOG_URL")
	secret := os.Getenv("INGEST_SECRET")

	var primary, fallback collector.Emitter
	if ingestURL != "" {
		primary = collector.NewHTTPEmitter(ingestURL, secret)
	}
	if backlogURL != "" {
		fallback = collector.NewStorageEmitter(backlogURL)
	}

	switch {
	case primary != nil && fallback != nil:
		log.Printf("emitter: http(%s) -> r2(%s)", ingestURL, backlogURL)
		return &collector.FallbackEmitter{Primary: primary, Fallback: fallback}
	case primary != nil:
		log.Printf("emitter: http(%s) only (no R2 fallback)", ingestURL)
		return primary
	case fallback != nil:
		log.Printf("emitter: r2(%s) only — every snapshot goes to backlog", backlogURL)
		return fallback
	default:
		log.Printf("emitter: mock (set INGEST_URL and/or BACKLOG_URL to send)")
		return collector.MockEmitter{}
	}
}
