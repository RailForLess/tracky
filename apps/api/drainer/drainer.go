// Package drainer pulls backlogged Snapshots from R2 and replays them
// through realtime.Processor. Runs in-process inside cmd/server: tick on
// startup, then every Interval. The pure decision logic lives in Replay
// (replay.go) so the storage glue here doesn't need a fake.
package drainer

import (
	"bytes"
	"context"
	"errors"
	"io"
	"log"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/aws/aws-sdk-go-v2/service/s3/types"

	"github.com/RailForLess/tracky/api/collector"
)

const backlogPrefix = "backlog/"

// Processor is the subset of realtime.Processor the drainer needs.
type Processor interface {
	Process(ctx context.Context, snap *collector.Snapshot) error
}

type Drainer struct {
	Client    *s3.Client
	Bucket    string
	Processor Processor
	Interval  time.Duration
}

// Run blocks until ctx is cancelled. Drains once at startup, then on every
// Interval tick.
func (d *Drainer) Run(ctx context.Context) {
	d.Drain(ctx)

	t := time.NewTicker(d.Interval)
	defer t.Stop()
	for {
		select {
		case <-t.C:
			d.Drain(ctx)
		case <-ctx.Done():
			return
		}
	}
}

// Drain processes one full pass over the backlog, returning the count of
// snapshots successfully replayed (excludes corrupt-but-deleted items).
func (d *Drainer) Drain(ctx context.Context) int {
	items, err := d.fetchAll(ctx)
	if err != nil {
		log.Printf("drainer: fetch: %v", err)
		return 0
	}
	if len(items) == 0 {
		return 0
	}
	log.Printf("drainer: replaying %d backlogged snapshots", len(items))

	// Group by provider prefix (backlog/{provider}/...) so a failing provider
	// doesn't block replay for the others. Replay stops at the first
	// processor error, but only within its own provider's queue.
	byProvider := make(map[string][]Item)
	order := make([]string, 0)
	for _, it := range items {
		prov := providerFromKey(it.Key)
		if _, ok := byProvider[prov]; !ok {
			order = append(order, prov)
		}
		byProvider[prov] = append(byProvider[prov], it)
	}

	processed := 0
	for _, prov := range order {
		provItems := byProvider[prov]
		log.Printf("drainer: provider=%s replaying %d snapshots", prov, len(provItems))
		outcomes := Replay(ctx, provItems, d.Processor)
		for _, o := range outcomes {
			switch {
			case o.ParseErr != nil:
				log.Printf("drainer: %s: corrupt JSON, discarding: %v", o.Key, o.ParseErr)
				d.tryDelete(ctx, o.Key)
			case o.ProcessErr != nil:
				log.Printf("drainer: %s: %v (stopping provider %s; will retry next cycle)", o.Key, o.ProcessErr, prov)
				// don't delete
			default:
				d.tryDelete(ctx, o.Key)
				processed++
			}
		}
	}
	if processed > 0 {
		log.Printf("drainer: drained %d snapshots", processed)
	}
	return processed
}

// providerFromKey extracts {provider} from a key shaped like
// backlog/{provider}/{rest}. Returns "" when the key doesn't fit.
func providerFromKey(key string) string {
	rest := strings.TrimPrefix(key, backlogPrefix)
	if i := strings.IndexByte(rest, '/'); i >= 0 {
		return rest[:i]
	}
	return ""
}

// fetchAll lists every backlog object and pulls its body into memory. The
// backlog is bounded by outage duration (minutes × providers × per-30s
// snapshot ≈ tens of items, ~50 KB each), so eager fetch is fine.
func (d *Drainer) fetchAll(ctx context.Context) ([]Item, error) {
	var items []Item
	paginator := s3.NewListObjectsV2Paginator(d.Client, &s3.ListObjectsV2Input{
		Bucket: aws.String(d.Bucket),
		Prefix: aws.String(backlogPrefix),
	})
	for paginator.HasMorePages() {
		page, err := paginator.NextPage(ctx)
		if err != nil {
			return nil, err
		}
		// S3 lists in lex order — keys are backlog/{operator}/{iso_ts}.bin,
		// so this gives chronological-within-operator replay order.
		for _, obj := range page.Contents {
			key := aws.ToString(obj.Key)
			body, err := d.getObject(ctx, key)
			if err != nil {
				if errors.Is(err, errNoSuchKey) {
					// concurrent drain or deletion race — skip
					continue
				}
				return nil, err
			}
			items = append(items, Item{Key: key, Body: body})
		}
	}
	return items, nil
}

func (d *Drainer) getObject(ctx context.Context, key string) ([]byte, error) {
	out, err := d.Client.GetObject(ctx, &s3.GetObjectInput{
		Bucket: aws.String(d.Bucket),
		Key:    aws.String(key),
	})
	if err != nil {
		if _, ok := errors.AsType[*types.NoSuchKey](err); ok {
			return nil, errNoSuchKey
		}
		return nil, err
	}
	defer out.Body.Close()
	var buf bytes.Buffer
	if _, err := io.Copy(&buf, out.Body); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

func (d *Drainer) tryDelete(ctx context.Context, key string) {
	_, err := d.Client.DeleteObject(ctx, &s3.DeleteObjectInput{
		Bucket: aws.String(d.Bucket),
		Key:    aws.String(key),
	})
	if err != nil {
		// Object is processed; if delete fails we'll re-process on next
		// tick. Idempotent for hub publish, double-write for TimescaleDB
		// once that lands — flag loudly.
		log.Printf("drainer: %s: PROCESSED BUT DELETE FAILED: %v", key, err)
	}
}

var errNoSuchKey = errors.New("drainer: no such key")
