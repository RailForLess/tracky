// Package middleware contains HTTP middleware shared across the API.
package middleware

import (
	"net"
	"net/http"
	"sync"
	"time"
)

// RateLimit returns middleware that limits each remote IP to `rate` requests
// per second with a burst of `burst`. Returns 429 when exceeded. Buckets are
// kept in-memory and pruned lazily; this is per-process (no shared state),
// which is fine for a single-instance API and degrades gracefully behind a
// load balancer (each instance enforces independently).
func RateLimit(rate float64, burst int) func(http.Handler) http.Handler {
	rl := &limiter{
		rate:   rate,
		burst:  float64(burst),
		bucket: make(map[string]*tokenBucket),
	}
	go rl.gc(10 * time.Minute)
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			ip := clientIP(r)
			if !rl.allow(ip) {
				w.Header().Set("Retry-After", "1")
				http.Error(w, "rate limit exceeded", http.StatusTooManyRequests)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

type tokenBucket struct {
	tokens float64
	last   time.Time
}

type limiter struct {
	mu     sync.Mutex
	rate   float64
	burst  float64
	bucket map[string]*tokenBucket
}

func (rl *limiter) allow(ip string) bool {
	rl.mu.Lock()
	defer rl.mu.Unlock()

	now := time.Now()
	b, ok := rl.bucket[ip]
	if !ok {
		rl.bucket[ip] = &tokenBucket{tokens: rl.burst - 1, last: now}
		return true
	}
	elapsed := now.Sub(b.last).Seconds()
	b.tokens += elapsed * rl.rate
	if b.tokens > rl.burst {
		b.tokens = rl.burst
	}
	b.last = now
	if b.tokens < 1 {
		return false
	}
	b.tokens--
	return true
}

func (rl *limiter) gc(interval time.Duration) {
	t := time.NewTicker(interval)
	defer t.Stop()
	for range t.C {
		cutoff := time.Now().Add(-interval)
		rl.mu.Lock()
		for ip, b := range rl.bucket {
			if b.last.Before(cutoff) {
				delete(rl.bucket, ip)
			}
		}
		rl.mu.Unlock()
	}
}

// clientIP extracts the request's client IP, honouring X-Forwarded-For when
// present. The first hop in XFF is the original client.
func clientIP(r *http.Request) string {
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		for i := 0; i < len(xff); i++ {
			if xff[i] == ',' {
				return trimSpace(xff[:i])
			}
		}
		return trimSpace(xff)
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}

func trimSpace(s string) string {
	i, j := 0, len(s)
	for i < j && (s[i] == ' ' || s[i] == '\t') {
		i++
	}
	for j > i && (s[j-1] == ' ' || s[j-1] == '\t') {
		j--
	}
	return s[i:j]
}
