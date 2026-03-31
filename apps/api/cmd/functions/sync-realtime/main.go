package main

import (
	"context"
	"fmt"
	"log"

	_ "github.com/joho/godotenv/autoload"

	"github.com/RailForLess/tracky/api/providers"
	"github.com/RailForLess/tracky/api/providers/amtrak"
	"github.com/RailForLess/tracky/api/providers/brightline"
	"github.com/RailForLess/tracky/api/providers/metra"
	"github.com/RailForLess/tracky/api/providers/metrotransit"
	"github.com/RailForLess/tracky/api/providers/trirail"
)

func buildRegistry() *providers.Registry {
	registry := providers.NewRegistry()
	registry.Register(amtrak.New())
	registry.Register(brightline.New())
	registry.Register(metra.New())
	registry.Register(metrotransit.New())
	registry.Register(trirail.New())
	return registry
}

// main is a stub — the DO Functions runtime provides its own entry point and
// invokes Main directly. This exists only to satisfy the Go compiler.
func main() {}

// Main is the Digital Ocean Functions entry point.
// Optional arg: "provider" (string) — if set, only that provider is synced.
func Main(args map[string]interface{}) map[string]interface{} {
	registry := buildRegistry()
	ctx := context.Background()

	targets := registry.All()
	if id, ok := args["provider"].(string); ok && id != "" {
		p, ok := registry.Get(id)
		if !ok {
			return map[string]interface{}{
				"error": fmt.Sprintf("unknown provider: %s", id),
			}
		}
		targets = []providers.Provider{p}
	}

	results := make(map[string]interface{}, len(targets))
	for _, p := range targets {
		feed, err := p.FetchRealtime(ctx)
		if err != nil {
			log.Printf("sync-realtime: %s: %v", p.ID(), err)
			results[p.ID()] = map[string]interface{}{"error": err.Error()}
			continue
		}
		results[p.ID()] = map[string]interface{}{
			"positions":  len(feed.Positions),
			"stop_times": len(feed.StopTimes),
		}
	}

	return map[string]interface{}{"body": results}
}
