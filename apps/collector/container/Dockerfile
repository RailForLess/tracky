# syntax=docker/dockerfile:1.7
#
# Multi-stage build for the Tracky GTFS-RT collector. Build context must be
# the repo root (or apps/api/) so the COPY can pull in the Go module.
#
# Local smoke test from repo root:
#   docker build -f apps/collector/container/Dockerfile -t tracky-collector apps/api
#   docker run --rm -e EMITTER=mock tracky-collector

# ── Build stage ──────────────────────────────────────────────────────────────
FROM golang:1.26-bookworm AS build
WORKDIR /src

COPY go.mod go.sum ./
RUN --mount=type=cache,target=/go/pkg/mod \
    go mod download

COPY . .

# CGO disabled because modernc.org/sqlite is the only CGO-dependent dep and the
# collector doesn't import it.
RUN --mount=type=cache,target=/go/pkg/mod \
    --mount=type=cache,target=/root/.cache/go-build \
    CGO_ENABLED=0 GOOS=linux \
    go build -trimpath -ldflags="-s -w" -o /out/collector ./cmd/collector

# ── Runtime stage ────────────────────────────────────────────────────────────
FROM gcr.io/distroless/static-debian12:nonroot

WORKDIR /app
COPY --from=build /out/collector /app/collector

# Cloudflare Containers local dev requires at least one exposed port.
EXPOSE 8080

ENTRYPOINT ["/app/collector"]
