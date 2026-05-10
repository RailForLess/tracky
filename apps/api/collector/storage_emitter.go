package collector

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

// StorageEmitter PUTs the snapshot bytes to {BaseURL}/{snap.Key()}. In prod
// BaseURL is the fake hostname intercepted by CollectorContainer.outbound(),
// which forwards to the BACKLOG_BUCKET R2 binding — so the container itself
// holds no R2 credentials. In tests BaseURL points at httptest.NewServer.
type StorageEmitter struct {
	BaseURL string
	Client  *http.Client
}

func NewStorageEmitter(baseURL string) *StorageEmitter {
	return &StorageEmitter{
		BaseURL: strings.TrimRight(baseURL, "/"),
		Client:  &http.Client{Timeout: 10 * time.Second},
	}
}

func (e *StorageEmitter) Emit(ctx context.Context, snap *Snapshot) error {
	if snap == nil {
		return fmt.Errorf("storage emitter: nil snapshot")
	}
	body, err := json.Marshal(snap)
	if err != nil {
		return fmt.Errorf("storage emitter: marshal: %w", err)
	}
	url := e.BaseURL + "/" + snap.Key()
	req, err := http.NewRequestWithContext(ctx, http.MethodPut, url, bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("storage emitter: build request: %w", err)
	}
	req.Header.Set("Content-Type", "application/octet-stream")
	client := e.Client
	if client == nil {
		client = http.DefaultClient
	}
	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("storage emitter: put: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		msg, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
		return fmt.Errorf("storage emitter: status %d: %s", resp.StatusCode, msg)
	}
	return nil
}
