package config

import (
	"os"
	"path/filepath"

	"github.com/joho/godotenv"
)

// LoadEnv loads a .env file at the given path relative to the Go module root.
// Walks up from CWD until it finds a directory containing go.mod, then loads
// from there. Silent on failure — externally-set env vars still take precedence.
func LoadEnv(relPath string) {
	dir, err := os.Getwd()
	if err != nil {
		return
	}
	for {
		if _, err := os.Stat(filepath.Join(dir, "go.mod")); err == nil {
			_ = godotenv.Load(filepath.Join(dir, relPath))
			return
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			return
		}
		dir = parent
	}
}
