package tiles

import (
	"bytes"
	"context"
	"fmt"
	"os/exec"
)

// GenerateTiles shells out to tippecanoe to convert route and stop GeoJSON
// files into one PMTiles archive with separate source-layers.
func GenerateTiles(ctx context.Context, routesGeoJSONPath, stopsGeoJSONPath, outputPath string) error {
	if _, err := exec.LookPath("tippecanoe"); err != nil {
		return fmt.Errorf("tippecanoe not found on PATH; please install tippecanoe (for example via your package manager, or on macOS with 'brew install tippecanoe') and ensure it is available on PATH")
	}

	args := []string{
		"-o", outputPath,
		"--force",
		"-Z2", "-z12",
		"--drop-densest-as-needed",
		"--extend-zooms-if-still-dropping",
		"-L", "transit_routes:" + routesGeoJSONPath,
		"-L", "transit_stops:" + stopsGeoJSONPath,
	}

	cmd := exec.CommandContext(ctx, "tippecanoe", args...)
	var stderr bytes.Buffer
	cmd.Stderr = &stderr

	if err := cmd.Run(); err != nil {
		return fmt.Errorf("tippecanoe failed: %w\n%s", err, stderr.String())
	}
	return nil
}
