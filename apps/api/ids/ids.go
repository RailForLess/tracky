// Package ids encodes and decodes Tracky's typed global identifiers.
//
// Every addressable resource is referred to by a self-describing ID of the form
//
//	[kind]-[provider]-[native]
//
// where kind is a single-character entity tag (s, r, t, h) and native is the
// provider's own GTFS identifier. Operators are a degenerate case with no
// native id: o-[provider].
//
// The `-` is the structural separator. Within a single segment (provider or
// native), the `~` character is permitted as a word-break — useful for
// multi-word provider names that don't fit a single token.
//
// Examples:
//   - s-amtrak-CHI                  stop
//   - r-amtrak-40751                route
//   - t-amtrak-251208               trip
//   - h-amtrak-NYC                  hub (meta-station)
//   - o-amtrak                      operator / provider
//   - s-metra~electric-FOO          multi-word provider
//   - t-brightline-service~A~v2     tildes inside the native id
package ids

import (
	"errors"
	"fmt"
	"strings"
)

type Kind string

const (
	KindStop     Kind = "s"
	KindRoute    Kind = "r"
	KindTrip     Kind = "t"
	KindHub      Kind = "h"
	KindOperator Kind = "o"
)

var knownKinds = map[Kind]bool{
	KindStop: true, KindRoute: true, KindTrip: true, KindHub: true, KindOperator: true,
}

// ID is the decoded form of a typed global identifier.
// Native is empty when Kind == KindOperator.
type ID struct {
	Kind     Kind
	Provider string
	Native   string
}

var (
	ErrEmpty          = errors.New("ids: empty input")
	ErrMissingDash    = errors.New("ids: missing '-' separator")
	ErrUnknownKind    = errors.New("ids: unknown kind")
	ErrEmptyProvider  = errors.New("ids: empty provider")
	ErrEmptyNative    = errors.New("ids: empty native id")
	ErrOperatorNative = errors.New("ids: operator id must not have a native segment")
	ErrProviderDash   = errors.New("ids: provider must not contain '-' (use '~' for multi-word providers)")
)

// Encode builds a global ID from its parts. Returns an error if any part
// violates the format (empty provider, '-' in provider, etc.).
func Encode(kind Kind, provider, native string) (string, error) {
	if !knownKinds[kind] {
		return "", fmt.Errorf("%w: %q", ErrUnknownKind, kind)
	}
	if provider == "" {
		return "", ErrEmptyProvider
	}
	if strings.ContainsRune(provider, '-') {
		return "", fmt.Errorf("%w: %q", ErrProviderDash, provider)
	}
	if kind == KindOperator {
		if native != "" {
			return "", ErrOperatorNative
		}
		return string(kind) + "-" + provider, nil
	}
	if native == "" {
		return "", ErrEmptyNative
	}
	return string(kind) + "-" + provider + "-" + native, nil
}

// MustEncode is Encode that panics on error. For tests and constants only.
func MustEncode(kind Kind, provider, native string) string {
	s, err := Encode(kind, provider, native)
	if err != nil {
		panic(err)
	}
	return s
}

// Decode parses a global ID. Operator IDs (o-foo) are accepted with an empty
// Native field; all other kinds require a non-empty native after the second '-'.
func Decode(s string) (ID, error) {
	if s == "" {
		return ID{}, ErrEmpty
	}
	// First dash splits kind from the rest.
	kindStr, rest, ok := strings.Cut(s, "-")
	if !ok || kindStr == "" {
		return ID{}, ErrMissingDash
	}
	kind := Kind(kindStr)
	if !knownKinds[kind] {
		return ID{}, fmt.Errorf("%w: %q", ErrUnknownKind, kind)
	}
	if kind == KindOperator {
		if strings.ContainsRune(rest, '-') {
			return ID{}, ErrOperatorNative
		}
		if rest == "" {
			return ID{}, ErrEmptyProvider
		}
		return ID{Kind: kind, Provider: rest}, nil
	}
	// Second dash splits provider from native. Native may itself contain '-'
	// (we cut on the first one only) so e.g. native='NY-PENN' is fine.
	provider, native, ok := strings.Cut(rest, "-")
	if !ok {
		return ID{}, ErrMissingDash
	}
	if provider == "" {
		return ID{}, ErrEmptyProvider
	}
	if native == "" {
		return ID{}, ErrEmptyNative
	}
	return ID{Kind: kind, Provider: provider, Native: native}, nil
}

// DecodeKind parses s and asserts its kind matches want. Convenience for
// handlers that already know which kind they expect from the route.
func DecodeKind(s string, want Kind) (ID, error) {
	id, err := Decode(s)
	if err != nil {
		return ID{}, err
	}
	if id.Kind != want {
		return ID{}, fmt.Errorf("ids: expected kind %q, got %q", want, id.Kind)
	}
	return id, nil
}

// String returns the encoded form of id, or "" if id is invalid.
func (id ID) String() string {
	s, err := Encode(id.Kind, id.Provider, id.Native)
	if err != nil {
		return ""
	}
	return s
}
