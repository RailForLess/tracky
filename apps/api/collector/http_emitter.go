package collector

import (
	"bytes"
	"compress/gzip"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

const ingestSecretHeader = "X-Tracky-Ingest-Secret"

// HTTPEmitter POSTs the per-tick snapshot as JSON to URL on the on-prem
// server. Public-internet hop, so it carries a shared-secret header.
type HTTPEmitter struct {
	URL    string
	Secret string
	Client *http.Client
}

func NewHTTPEmitter(url, secret string) *HTTPEmitter {
	return &HTTPEmitter{
		URL:    url,
		Secret: secret,
		Client: &http.Client{Timeout: 10 * time.Second},
	}
}

func (e *HTTPEmitter) Emit(ctx context.Context, snap *Snapshot) error {
	body, err := json.Marshal(snap)
	if err != nil {
		return fmt.Errorf("http emitter: marshal: %w", err)
	}

	var buf bytes.Buffer
	gz := gzip.NewWriter(&buf)
	if _, err := gz.Write(body); err != nil {
		return fmt.Errorf("http emitter: gzip write: %w", err)
	}
	if err := gz.Close(); err != nil {
		return fmt.Errorf("http emitter: gzip close: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, e.URL, &buf)
	if err != nil {
		return fmt.Errorf("http emitter: build request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Content-Encoding", "gzip")
	if e.Secret != "" {
		req.Header.Set(ingestSecretHeader, e.Secret)
	}
	resp, err := e.Client.Do(req)
	if err != nil {
		return fmt.Errorf("http emitter: post: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		msg, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
		return fmt.Errorf("http emitter: status %d: %s", resp.StatusCode, msg)
	}
	return nil
}
