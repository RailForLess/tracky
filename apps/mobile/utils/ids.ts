/**
 * Encodes and decodes Tracky's typed global identifiers.
 *
 * Format: `[kind]-[provider]-[native]`
 *   - s-amtrak-CHI                  stop
 *   - r-amtrak-40751                route
 *   - t-amtrak-251208               trip
 *   - h-amtrak-NYC                  hub (meta-station)
 *   - o-amtrak                      operator / provider  (no native segment)
 *   - s-metra~electric-FOO          multi-word provider
 *   - t-brightline-service~A~v2     tildes inside the native id
 *
 * The `-` is the structural separator. Within a single segment (provider or
 * native), the `~` character is permitted as a word-break — useful for
 * multi-word provider names that don't fit a single token.
 *
 * Mirrors apps/api/ids/ids.go — keep the two in sync.
 */

export type IdKind = 's' | 'r' | 't' | 'h' | 'o';

export interface ParsedId {
  kind: IdKind;
  provider: string;
  /** Empty when kind === 'o'. */
  native: string;
}

const KNOWN_KINDS: ReadonlySet<string> = new Set(['s', 'r', 't', 'h', 'o']);

export class IdFormatError extends Error {
  constructor(message: string, public readonly input: string) {
    super(message);
    this.name = 'IdFormatError';
  }
}

export function encodeId(kind: IdKind, provider: string, native: string): string {
  if (!KNOWN_KINDS.has(kind)) {
    throw new IdFormatError(`unknown kind ${JSON.stringify(kind)}`, kind);
  }
  if (!provider) throw new IdFormatError('empty provider', '');
  if (provider.includes('-')) {
    throw new IdFormatError(
      `provider ${JSON.stringify(provider)} must not contain '-' (use '~' for multi-word providers)`,
      provider,
    );
  }
  if (kind === 'o') {
    if (native) throw new IdFormatError('operator id must not have a native segment', native);
    return `o-${provider}`;
  }
  if (!native) throw new IdFormatError('empty native id', '');
  return `${kind}-${provider}-${native}`;
}

/**
 * Parse a global ID. Throws IdFormatError on malformed input.
 * Use tryParseId() when you want a nullable return instead.
 */
export function parseId(s: string): ParsedId {
  if (!s) throw new IdFormatError('empty input', s);
  const dash = s.indexOf('-');
  if (dash <= 0) throw new IdFormatError("missing '-' separator", s);
  const kindStr = s.slice(0, dash);
  if (!KNOWN_KINDS.has(kindStr)) {
    throw new IdFormatError(`unknown kind ${JSON.stringify(kindStr)}`, s);
  }
  const kind = kindStr as IdKind;
  const rest = s.slice(dash + 1);
  if (kind === 'o') {
    if (rest.includes('-')) throw new IdFormatError('operator id must not have a native segment', s);
    if (!rest) throw new IdFormatError('empty provider', s);
    return { kind, provider: rest, native: '' };
  }
  // Native may itself contain '-' — we cut on the first one only, so e.g.
  // native='NY-PENN' resolves correctly.
  const second = rest.indexOf('-');
  if (second < 0) throw new IdFormatError("missing '-' separator before native id", s);
  const provider = rest.slice(0, second);
  const native = rest.slice(second + 1);
  if (!provider) throw new IdFormatError('empty provider', s);
  if (!native) throw new IdFormatError('empty native id', s);
  return { kind, provider, native };
}

export function tryParseId(s: string): ParsedId | null {
  try {
    return parseId(s);
  } catch {
    return null;
  }
}

/** Parse s and assert its kind matches want. Returns null on any failure. */
export function tryParseKindedId(s: string, want: IdKind): ParsedId | null {
  const parsed = tryParseId(s);
  if (!parsed || parsed.kind !== want) return null;
  return parsed;
}

/** Convenience: extract the provider segment without allocating a ParsedId. */
export function providerOf(globalId: string): string | null {
  return tryParseId(globalId)?.provider ?? null;
}

/**
 * Composite identity for a single run (trip × run date). Use as a React key
 * or dedup key in any list that may contain multiple runs of the same trip
 * (e.g. yesterday's Amtrak 21 still en route while today's just departed).
 *
 * Format: `<tripId>@<day-of-month>`. Day-of-month is sufficient to
 * disambiguate concurrent runs — no real-world trip lasts long enough to
 * collide with itself a month later (longest Amtrak end-to-end is ~65h).
 * `@` is deliberately distinct from `-` (typed-id structural separator) and
 * `~` (typed-id word-break) so a run key can never be misparsed as a global
 * id. This is a purely client-side convention — see apps/api/spec/realtime.go
 * for the server-side helper.
 *
 * `runDate` may be a YYYY-MM-DD string or a Date / epoch-millis.
 */
export function runKey(run: {
  tripId: string;
  runDate?: string | number | Date | null;
}): string {
  const day = dayOfMonth(run.runDate);
  return day == null ? run.tripId : `${run.tripId}@${day}`;
}

function dayOfMonth(d: string | number | Date | null | undefined): number | null {
  if (d == null) return null;
  // Strings come in two flavors from the wire / saved data:
  //   - YYYY-MM-DD              (Go's Format("2006-01-02"))
  //   - RFC3339 / ISO 8601      (default time.Time JSON encoding)
  // Date parsing handles both. UTC-day extraction is correct because the
  // backend stamps run_date as UTC midnight of the service date.
  const date = d instanceof Date ? d : new Date(d);
  return Number.isFinite(date.getTime()) ? date.getUTCDate() : null;
}
