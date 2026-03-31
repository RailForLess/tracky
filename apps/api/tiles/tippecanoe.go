package tiles

import (
	"bytes"
	"context"
	"fmt"
	"os/exec"
)

// GenerateTiles shells out to tippecanoe to convert a GeoJSON file into PMTiles.
func GenerateTiles(ctx context.Context, geojsonPath, outputPath string) error {
	if _, err := exec.LookPath("tippecanoe"); err != nil {
		return fmt.Errorf("tippecanoe not found on PATH; install via: brew install tippecanoe")
	}

	args := []string{
		"-o", outputPath,
		"--force",
		"-Z2", "-z12",
		"--drop-densest-as-needed",
		"--extend-zooms-if-still-dropping",
		"-l", "transit_routes",
		geojsonPath,
	}

	cmd := exec.CommandContext(ctx, "tippecanoe", args...)
	var stderr bytes.Buffer
	cmd.Stderr = &stderr

	if err := cmd.Run(); err != nil {
		return fmt.Errorf("tippecanoe failed: %w\n%s", err, stderr.String())
	}
	return nil
}
