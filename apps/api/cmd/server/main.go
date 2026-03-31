package main

import (
	"log"
	"net/http"
	"os"

	_ "github.com/joho/godotenv/autoload"

	"github.com/RailForLess/tracky/api/db"
	"github.com/RailForLess/tracky/api/providers"
	"github.com/RailForLess/tracky/api/providers/amtrak"
	"github.com/RailForLess/tracky/api/providers/brightline"
	"github.com/RailForLess/tracky/api/providers/cta"
	"github.com/RailForLess/tracky/api/providers/metra"
	"github.com/RailForLess/tracky/api/providers/metrotransit"
	"github.com/RailForLess/tracky/api/providers/trirail"
	"github.com/RailForLess/tracky/api/routes"
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
