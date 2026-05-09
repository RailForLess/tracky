package main

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"flag"
	"fmt"
	"log"
	"os"
	"path/filepath"

	_ "github.com/joho/godotenv/autoload"

	"github.com/RailForLess/tracky/api/db"
	"github.com/RailForLess/tracky/api/gtfs"
	"github.com/RailForLess/tracky/api/providers"
	"github.com/RailForLess/tracky/api/providers/amtrak"
	"github.com/RailForLess/tracky/api/providers/brightline"
	"github.com/RailForLess/tracky/api/providers/cta"
	"github.com/RailForLess/tracky/api/providers/metra"
	"github.com/RailForLess/tracky/api/providers/metrotransit"
	"github.com/RailForLess/tracky/api/providers/trirail"
	"github.com/RailForLess/tracky/api/tiles"
)

func main() {
	skipDB := flag.Bool("skip-db", false, "skip writing to the database")
	skipTiles := flag.Bool("skip-tiles", false, "skip tile generation")
	tilesDir := flag.String("tiles-dir", ".", "output directory for PMTiles files")
	upload := flag.Bool("upload", false, "upload artifacts to S3 after generation")
	providerFilter := flag.String("provider", "", "restrict to a single provider ID")
	force := flag.Bool("force", false, "ignore freshness checks and re-sync every provider")
	flag.Parse()

	ctx := context.Background()

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

	var database *db.DB
	if !*skipDB {
		dsn := os.Getenv("DATABASE_URL")
		if dsn == "" {
			log.Fatalf("DATABASE_URL is required (set --skip-db to skip database writes)")
		}
		var err error
		database, err = db.Open(ctx, dsn)
		if err != nil {
			log.Fatalf("open database: %v", err)
		}
		defer database.Close()
		log.Printf("connected to database")
	}

	for _, p := range selected {
		log.Printf("processing %s...", p.ID())

		// ── Freshness check ─────────────────────────────────────────────
		var prevETag, prevLastMod string
		if database != nil && !*force {
			latest, err := database.LatestApplied(ctx, p.ID())
			if err != nil {
				log.Printf("warning: %s lookup latest version: %v", p.ID(), err)
			} else if latest != nil {
				prevETag = latest.ETag
				prevLastMod = latest.LastModified
			}
		}

		// ── Conditional fetch ───────────────────────────────────────────
		url := p.StaticURL()
		log.Printf("gtfs [%s]: GET %s", p.ID(), url)
		res, err := gtfs.FetchStaticConditional(ctx, url, prevETag, prevLastMod)
		if err != nil {
			log.Printf("warning: %s fetch failed: %v", p.ID(), err)
			continue
		}
		if res.NotModified {
			log.Printf("gtfs [%s]: 304 not modified — skipping", p.ID())
			continue
		}

		sha := sha256Hex(res.Body)
		log.Printf("gtfs [%s]: downloaded %.1f MB (sha256=%s)",
			p.ID(), float64(len(res.Body))/(1024*1024), sha[:12])

		// ── Hash check ──────────────────────────────────────────────────
		var versionID int64
		if database != nil && !*force {
			seen, err := database.HasAppliedHash(ctx, p.ID(), sha)
			if err != nil {
				log.Printf("warning: %s hash lookup: %v", p.ID(), err)
			} else if seen {
				log.Printf("gtfs [%s]: identical content already applied — skipping", p.ID())
				continue
			}
		}
		if database != nil {
			id, err := database.RecordFetch(ctx, p.ID(), url, sha, res.ETag, res.LastModified, int64(len(res.Body)))
			if err != nil {
				log.Printf("warning: %s record fetch: %v", p.ID(), err)
			}
			versionID = id
		}

		// ── Parse ───────────────────────────────────────────────────────
		agencies, routes, stops, trips, stopTimes, calendars, exceptions, shapes, err :=
			gtfs.ParseStaticBytes(p.ID(), res.Body)
		if err != nil {
			log.Printf("warning: %s parse failed: %v", p.ID(), err)
			continue
		}
		feed := &providers.StaticFeed{
			Agencies:   agencies,
			Routes:     routes,
			Stops:      stops,
			Trips:      trips,
			StopTimes:  stopTimes,
			Calendars:  calendars,
			Exceptions: exceptions,
			Shapes:     shapes,
		}
		log.Printf("parsed %s: %d routes, %d stops, %d trips, %d stop_times, %d shapes",
			p.ID(), len(routes), len(stops), len(trips), len(stopTimes), len(shapes))

		// ── Save ────────────────────────────────────────────────────────
		if database != nil {
			counts, err := database.SaveStaticFeed(ctx, p.ID(), feed)
			if err != nil {
				log.Printf("warning: %s db write failed: %v", p.ID(), err)
			} else {
				log.Printf("saved %s to db: %+v", p.ID(), counts)
				if versionID > 0 {
					if err := database.MarkApplied(ctx, versionID, counts); err != nil {
						log.Printf("warning: %s mark applied: %v", p.ID(), err)
					}
				}
			}
		}

		// ── Tiles ───────────────────────────────────────────────────────
		if !*skipTiles {
			buildTiles(ctx, p.ID(), feed, *tilesDir, *upload)
		}
	}

	log.Printf("done")
}

func sha256Hex(data []byte) string {
	sum := sha256.Sum256(data)
	return hex.EncodeToString(sum[:])
}

// buildTiles generates a PMTiles file for a single provider and optionally uploads it.
func buildTiles(ctx context.Context, providerID string, feed *providers.StaticFeed, dir string, doUpload bool) {
	if len(feed.Shapes) == 0 {
		log.Printf("skipping tiles for %s: no shapes", providerID)
		return
	}

	routesGeoJSON, err := tiles.BuildRouteGeoJSON(feed.Shapes, feed.Trips, feed.Routes)
	if err != nil {
		log.Fatalf("%s: building route GeoJSON: %v", providerID, err)
	}

	stopsGeoJSON, err := tiles.BuildStopGeoJSON(feed.Stops)
	if err != nil {
		log.Fatalf("%s: building stop GeoJSON: %v", providerID, err)
	}

	routesTmpFile, err := os.CreateTemp("", fmt.Sprintf("tracky-%s-routes-*.geojson", providerID))
	if err != nil {
		log.Fatalf("%s: creating routes temp file: %v", providerID, err)
	}
	routesTmpPath := routesTmpFile.Name()
	defer os.Remove(routesTmpPath)

	if _, err := routesTmpFile.Write(routesGeoJSON); err != nil {
		routesTmpFile.Close()
		log.Fatalf("%s: writing routes GeoJSON: %v", providerID, err)
	}
	routesTmpFile.Close()

	stopsTmpFile, err := os.CreateTemp("", fmt.Sprintf("tracky-%s-stops-*.geojson", providerID))
	if err != nil {
		log.Fatalf("%s: creating stops temp file: %v", providerID, err)
	}
	stopsTmpPath := stopsTmpFile.Name()
	defer os.Remove(stopsTmpPath)

	if _, err := stopsTmpFile.Write(stopsGeoJSON); err != nil {
		stopsTmpFile.Close()
		log.Fatalf("%s: writing stops GeoJSON: %v", providerID, err)
	}
	stopsTmpFile.Close()

	output := filepath.Join(dir, providerID+".pmtiles")
	log.Printf("running tippecanoe → %s", output)
	if err := tiles.GenerateTiles(ctx, routesTmpPath, stopsTmpPath, output); err != nil {
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
