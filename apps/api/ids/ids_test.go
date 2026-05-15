package ids

import (
	"errors"
	"testing"
)

func TestEncode(t *testing.T) {
	cases := []struct {
		name     string
		kind     Kind
		provider string
		native   string
		want     string
		wantErr  error
	}{
		{"stop", KindStop, "amtrak", "CHI", "s-amtrak-CHI", nil},
		{"route", KindRoute, "amtrak", "40751", "r-amtrak-40751", nil},
		{"trip", KindTrip, "amtrak", "251208", "t-amtrak-251208", nil},
		{"hub", KindHub, "amtrak", "NYC", "h-amtrak-NYC", nil},
		{"operator", KindOperator, "amtrak", "", "o-amtrak", nil},
		{"multi-word provider with tilde", KindStop, "metra~electric", "FOO", "s-metra~electric-FOO", nil},
		{"native with dash", KindStop, "amtrak", "NY-PENN", "s-amtrak-NY-PENN", nil},
		{"native with tilde", KindTrip, "brightline", "service~A~v2", "t-brightline-service~A~v2", nil},

		{"unknown kind", Kind("x"), "amtrak", "CHI", "", ErrUnknownKind},
		{"empty provider", KindStop, "", "CHI", "", ErrEmptyProvider},
		{"provider has dash", KindStop, "metra-electric", "FOO", "", ErrProviderDash},
		{"empty native, non-operator", KindStop, "amtrak", "", "", ErrEmptyNative},
		{"operator with native", KindOperator, "amtrak", "X", "", ErrOperatorNative},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got, err := Encode(tc.kind, tc.provider, tc.native)
			if tc.wantErr != nil {
				if !errors.Is(err, tc.wantErr) {
					t.Fatalf("err = %v, want %v", err, tc.wantErr)
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if got != tc.want {
				t.Fatalf("got %q, want %q", got, tc.want)
			}
		})
	}
}

func TestDecode(t *testing.T) {
	cases := []struct {
		in       string
		kind     Kind
		provider string
		native   string
		wantErr  error
	}{
		{"s-amtrak-CHI", KindStop, "amtrak", "CHI", nil},
		{"r-amtrak-40751", KindRoute, "amtrak", "40751", nil},
		{"t-amtrak-251208", KindTrip, "amtrak", "251208", nil},
		{"h-amtrak-NYC", KindHub, "amtrak", "NYC", nil},
		{"o-amtrak", KindOperator, "amtrak", "", nil},
		{"s-metra~electric-FOO", KindStop, "metra~electric", "FOO", nil},
		// Native containing '-' lands entirely after the second '-'.
		{"s-amtrak-NY-PENN", KindStop, "amtrak", "NY-PENN", nil},
		{"t-brightline-service~A~v2", KindTrip, "brightline", "service~A~v2", nil},

		{"", "", "", "", ErrEmpty},
		{"amtrak", "", "", "", ErrMissingDash},
		{"-amtrak-CHI", "", "", "", ErrMissingDash},
		{"x-amtrak-CHI", "", "", "", ErrUnknownKind},
		{"s--CHI", "", "", "", ErrEmptyProvider},
		{"s-amtrak-", "", "", "", ErrEmptyNative},
		{"s-amtrak", "", "", "", ErrMissingDash},
		{"o-amtrak-X", "", "", "", ErrOperatorNative},
		{"o-", "", "", "", ErrEmptyProvider},
	}
	for _, tc := range cases {
		t.Run(tc.in, func(t *testing.T) {
			got, err := Decode(tc.in)
			if tc.wantErr != nil {
				if !errors.Is(err, tc.wantErr) {
					t.Fatalf("err = %v, want %v", err, tc.wantErr)
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if got.Kind != tc.kind || got.Provider != tc.provider || got.Native != tc.native {
				t.Fatalf("got %+v, want {%s %s %s}", got, tc.kind, tc.provider, tc.native)
			}
		})
	}
}

func TestRoundTrip(t *testing.T) {
	cases := []string{
		"s-amtrak-CHI",
		"r-amtrak-40751",
		"t-amtrak-251208",
		"h-amtrak-NYC",
		"o-amtrak",
		"s-metra~electric-123",
		"t-brightline-service~A~v2",
		"s-amtrak-NY-PENN",
	}
	for _, in := range cases {
		t.Run(in, func(t *testing.T) {
			id, err := Decode(in)
			if err != nil {
				t.Fatalf("decode: %v", err)
			}
			if id.String() != in {
				t.Fatalf("round-trip: got %q, want %q", id.String(), in)
			}
		})
	}
}

func TestDecodeKind(t *testing.T) {
	if _, err := DecodeKind("s-amtrak-CHI", KindStop); err != nil {
		t.Fatalf("expected match: %v", err)
	}
	if _, err := DecodeKind("s-amtrak-CHI", KindRoute); err == nil {
		t.Fatal("expected kind mismatch error")
	}
	if _, err := DecodeKind("garbage", KindStop); err == nil {
		t.Fatal("expected decode error")
	}
}
