package main

import (
	"context"
	"flag"
	"fmt"
	"log"
	"os"
	"path/filepath"

	_ "github.com/joho/godotenv/autoload"

	"github.com/Tracky-Trains/tracky/api/db"
	"github.com/Tracky-Trains/tracky/api/providers"
	"github.com/Tracky-Trains/tracky/api/providers/amtrak"
	"github.com/Tracky-Trains/tracky/api/providers/brightline"
	"github.com/Tracky-Trains/tracky/api/providers/cta"
	"github.com/Tracky-Trains/tracky/api/providers/metra"
	"github.com/Tracky-Trains/tracky/api/providers/metrotransit"
	"github.com/Tracky-Trains/tracky/api/providers/trirail"
	"github.com/Tracky-Trains/tracky/api/tiles"
)

func main() {
	dbPath := flag.String("db", "tracky.db", "SQLite database path")
	skipDB := flag.Bool("skip-db", false, "skip writing to the database")
	skipTiles := flag.Bool("skip-tiles", false, "skip tile generation")
	tilesDir := flag.String("tiles-dir", ".", "output directory for PMTiles files")
	upload := flag.Bool("upload", false, "upload artifacts to S3 after generation")
	providerFilter := flag.String("provider", "", "restrict to a single provider ID")
	flag.Parse()

	ctx := context.Background()

	// ── Provider registry ───────────────────────────────────────────────

	registry := providers.NewRegistry()
	registry.Register(amtrak.New())
	registry.Register(brightline.New())
	registry.Register(cta.New())
	registry.Register(metra.New())
	registry.Register(metrotransit.New())
	registry.Register(trirail.New())

	var selected []providers.Provider
	if *providerFilter != "" {
		p, ok := registry.Get(*providerFilter)
		if !ok {
			log.Fatalf("unknown provider: %s", *providerFilter)
		}
		selected = []providers.Provider{p}
	} else {
		selected = registry.All()
	}

	// ── Open database ───────────────────────────────────────────────────

	var database *db.DB
	if !*skipDB {
		var err error
		database, err = db.Open(*dbPath)
		if err != nil {
			log.Fatalf("open database: %v", err)
		}
		defer database.Close()
		log.Printf("opened database: %s", *dbPath)
	}

	// ── Process each provider sequentially ──────────────────────────────

	for _, p := range selected {
		log.Printf("processing %s...", p.ID())

		feed, err := p.FetchStatic(ctx)
		if err != nil {
			log.Printf("warning: %s fetch failed: %v", p.ID(), err)
			continue
		}
		log.Printf("fetched %s: %d routes, %d stops, %d trips, %d stop_times, %d shapes",
			p.ID(), len(feed.Routes), len(feed.Stops), len(feed.Trips),
			len(feed.StopTimes), len(feed.Shapes))

		// Write to database.
		if database != nil {
			counts, err := database.SaveStaticFeed(ctx, p.ID(), feed)
			if err != nil {
				log.Printf("warning: %s db write failed: %v", p.ID(), err)
			} else {
				log.Printf("saved %s to db: %+v", p.ID(), counts)
			}
		}

		// Generate tiles.
		if !*skipTiles {
			buildTiles(ctx, p.ID(), feed, *tilesDir, *upload)
		}
	}

	log.Printf("done")
}

// buildTiles generates a PMTiles file for a single provider and optionally uploads it.
func buildTiles(ctx context.Context, providerID string, feed *providers.StaticFeed, dir string, doUpload bool) {
	if len(feed.Shapes) == 0 {
		log.Printf("skipping tiles for %s: no shapes", providerID)
		return
	}

	geojson, err := tiles.BuildGeoJSON(feed.Shapes, feed.Trips, feed.Routes)
	if err != nil {
		log.Fatalf("%s: building GeoJSON: %v", providerID, err)
	}

	debugPath := filepath.Join(dir, providerID+".geojson")
	if err := os.WriteFile(debugPath, geojson, 0644); err != nil {
		log.Printf("warning: failed to write debug GeoJSON: %v", err)
	} else {
		log.Printf("wrote debug GeoJSON: %s (%.1f MB)", debugPath, float64(len(geojson))/(1024*1024))
	}

	tmpFile, err := os.CreateTemp("", fmt.Sprintf("tracky-%s-*.geojson", providerID))
	if err != nil {
		log.Fatalf("%s: creating temp file: %v", providerID, err)
	}
	tmpPath := tmpFile.Name()
	defer os.Remove(tmpPath)

	if _, err := tmpFile.Write(geojson); err != nil {
		tmpFile.Close()
		log.Fatalf("%s: writing GeoJSON: %v", providerID, err)
	}
	tmpFile.Close()

	output := filepath.Join(dir, providerID+".pmtiles")
	log.Printf("running tippecanoe → %s", output)
	if err := tiles.GenerateTiles(ctx, tmpPath, output); err != nil {
		log.Fatalf("%s: tippecanoe: %v", providerID, err)
	}

	stat, _ := os.Stat(output)
	log.Printf("generated %s (%.1f MB)", output, float64(stat.Size())/(1024*1024))

	if doUpload {
		objectKey := fmt.Sprintf("%s.pmtiles", providerID)
		log.Printf("uploading %s to S3...", objectKey)
		if err := tiles.Upload(ctx, output, objectKey); err != nil {
			log.Fatalf("%s: upload: %v", providerID, err)
		}
	}
}
