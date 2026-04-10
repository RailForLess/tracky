package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/RailForLess/tracky/api/config"
	"github.com/RailForLess/tracky/api/db"
	"github.com/RailForLess/tracky/api/providers"
	"github.com/RailForLess/tracky/api/providers/amtrak"
	"github.com/RailForLess/tracky/api/providers/brightline"
	"github.com/RailForLess/tracky/api/providers/cta"
	"github.com/RailForLess/tracky/api/providers/metra"
	"github.com/RailForLess/tracky/api/providers/metrotransit"
	"github.com/RailForLess/tracky/api/providers/trirail"
	"github.com/RailForLess/tracky/api/routes"
	"github.com/RailForLess/tracky/api/ws"
)

func main() {
	config.LoadEnv("cmd/server/.env")

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

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

	hub := ws.NewHub()
	go hub.Run(ctx)

	for _, p := range registry.All() {
		go ws.StartPoller(ctx, p, hub, 30*time.Second)
	}

	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("ok"))
	})

	routes.Setup(mux, registry, database, hub)

	mux.HandleFunc("GET /ws/realtime", ws.Handler(hub))

	srv := &http.Server{Addr: ":" + port, Handler: mux}
	go func() {
		<-ctx.Done()
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		srv.Shutdown(shutdownCtx)
	}()

	log.Printf("starting server on :%s", port)
	if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Fatal(err)
	}
}
