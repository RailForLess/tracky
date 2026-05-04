package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"

	"github.com/RailForLess/tracky/api/config"
	"github.com/RailForLess/tracky/api/drainer"
	"github.com/RailForLess/tracky/api/realtime"
	"github.com/RailForLess/tracky/api/routes"
	"github.com/RailForLess/tracky/api/ws"
)

const drainInterval = 60 * time.Second

func main() {
	config.LoadEnv("cmd/server/.env")

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	hub := ws.NewHub()
	go hub.Run(ctx)

	processor := realtime.NewProcessor(hub)
	ingestSecret := os.Getenv("INGEST_SECRET")
	if ingestSecret == "" {
		log.Printf("WARNING: INGEST_SECRET unset — /ingest is open. Set it for any non-local deploy.")
	}

	if client, bucket := buildR2Client(ctx); client != nil {
		d := &drainer.Drainer{Client: client, Bucket: bucket, Processor: processor, Interval: drainInterval}
		go d.Run(ctx)
		log.Printf("drainer: enabled (bucket=%s, interval=%s)", bucket, drainInterval)
	} else {
		log.Printf("drainer: disabled (set R2_BUCKET to enable)")
	}

	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("ok"))
	})

	routes.Setup(mux, hub, processor, ingestSecret)
	mux.HandleFunc("GET /ws/realtime", ws.Handler(hub))

	srv := &http.Server{Addr: ":" + port, Handler: mux}
	go func() {
		<-ctx.Done()
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		srv.Shutdown(shutdownCtx)
	}()

	log.Printf("starting server on :%s (collector ingest at POST /ingest)", port)
	if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Fatal(err)
	}
}

// buildR2Client returns (nil, "") if R2 isn't configured. Required env:
//
//	R2_BUCKET           - bucket name (e.g. tracky-backlog)
//	R2_ENDPOINT         - https://{account_id}.r2.cloudflarestorage.com
//	R2_ACCESS_KEY_ID    - R2 access key from the dashboard
//	R2_SECRET_ACCESS_KEY
func buildR2Client(ctx context.Context) (*s3.Client, string) {
	bucket := os.Getenv("R2_BUCKET")
	endpoint := os.Getenv("R2_ENDPOINT")
	accessKey := os.Getenv("R2_ACCESS_KEY_ID")
	secretKey := os.Getenv("R2_SECRET_ACCESS_KEY")
	if bucket == "" || endpoint == "" || accessKey == "" || secretKey == "" {
		return nil, ""
	}

	cfg, err := awsconfig.LoadDefaultConfig(ctx,
		awsconfig.WithRegion("auto"),
		awsconfig.WithCredentialsProvider(credentials.NewStaticCredentialsProvider(accessKey, secretKey, "")),
	)
	if err != nil {
		log.Fatalf("r2: load aws config: %v", err)
	}
	client := s3.NewFromConfig(cfg, func(o *s3.Options) {
		o.BaseEndpoint = &endpoint
		o.UsePathStyle = true
	})
	return client, bucket
}
