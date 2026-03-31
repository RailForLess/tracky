package main

import (
	"log"
	"net/http"
	"os"

	_ "github.com/joho/godotenv/autoload"

	"github.com/Tracky-Trains/tracky/api/db"
	"github.com/Tracky-Trains/tracky/api/providers"
	"github.com/Tracky-Trains/tracky/api/providers/amtrak"
	"github.com/Tracky-Trains/tracky/api/providers/brightline"
	"github.com/Tracky-Trains/tracky/api/providers/cta"
	"github.com/Tracky-Trains/tracky/api/providers/metra"
	"github.com/Tracky-Trains/tracky/api/providers/metrotransit"
	"github.com/Tracky-Trains/tracky/api/providers/trirail"
	"github.com/Tracky-Trains/tracky/api/routes"
)

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	dbPath := os.Getenv("DATABASE_PATH")
	if dbPath == "" {
		dbPath = "tracky.db"
	}

	database, err := db.Open(dbPath)
	if err != nil {
		log.Fatal(err)
	}
	defer database.Close()

	registry := providers.NewRegistry()
	registry.Register(amtrak.New())
	registry.Register(brightline.New())
	registry.Register(cta.New())
	registry.Register(metra.New())
	registry.Register(metrotransit.New())
	registry.Register(trirail.New())

	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("ok"))
	})

	routes.Setup(mux, registry, database)

	log.Printf("starting server on :%s", port)
	if err := http.ListenAndServe(":"+port, mux); err != nil {
		log.Fatal(err)
	}
}
