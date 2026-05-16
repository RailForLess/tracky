import {
  encodeId,
  parseId,
  tryParseId,
  tryParseKindedId,
  providerOf,
  runKey,
  IdFormatError,
  type ParsedId,
} from '../../utils/ids';

describe('ids', () => {
  describe('encodeId', () => {
    const cases: Array<[string, Parameters<typeof encodeId>, string]> = [
      ['stop', ['s', 'amtrak', 'CHI'], 's-amtrak-CHI'],
      ['route', ['r', 'amtrak', '40751'], 'r-amtrak-40751'],
      ['trip', ['t', 'amtrak', '251208'], 't-amtrak-251208'],
      ['hub', ['h', 'amtrak', 'NYC'], 'h-amtrak-NYC'],
      ['operator', ['o', 'amtrak', ''], 'o-amtrak'],
      ['multi-word provider with tilde', ['s', 'metra~electric', 'FOO'], 's-metra~electric-FOO'],
      ['native with dash', ['s', 'amtrak', 'NY-PENN'], 's-amtrak-NY-PENN'],
      ['native with tilde', ['t', 'brightline', 'service~A~v2'], 't-brightline-service~A~v2'],
    ];
    it.each(cases)('%s', (_name, args, want) => {
      expect(encodeId(...args)).toBe(want);
    });

    it.each([
      ['empty provider', ['s', '', 'CHI']],
      ['empty native (non-operator)', ['s', 'amtrak', '']],
      ['operator with native', ['o', 'amtrak', 'X']],
      ['provider contains dash', ['s', 'metra-electric', 'FOO']],
    ] as const)('rejects: %s', (_name, args) => {
      expect(() => encodeId(...(args as Parameters<typeof encodeId>))).toThrow(IdFormatError);
    });
  });

  describe('parseId', () => {
    const cases: Array<[string, ParsedId]> = [
      ['s-amtrak-CHI', { kind: 's', provider: 'amtrak', native: 'CHI' }],
      ['r-amtrak-40751', { kind: 'r', provider: 'amtrak', native: '40751' }],
      ['t-amtrak-251208', { kind: 't', provider: 'amtrak', native: '251208' }],
      ['h-amtrak-NYC', { kind: 'h', provider: 'amtrak', native: 'NYC' }],
      ['o-amtrak', { kind: 'o', provider: 'amtrak', native: '' }],
      ['s-metra~electric-FOO', { kind: 's', provider: 'metra~electric', native: 'FOO' }],
      // Native containing '-' is taken whole after the second '-'.
      ['s-amtrak-NY-PENN', { kind: 's', provider: 'amtrak', native: 'NY-PENN' }],
      ['t-brightline-service~A~v2', { kind: 't', provider: 'brightline', native: 'service~A~v2' }],
    ];
    it.each(cases)('decodes %s', (input, want) => {
      expect(parseId(input)).toEqual(want);
    });

    it.each([
      'amtrak', // no dash
      '-amtrak-CHI', // empty kind
      'x-amtrak-CHI', // unknown kind
      's--CHI', // empty provider
      's-amtrak-', // empty native
      's-amtrak', // missing second dash
      'o-amtrak-X', // operator with native
      'o-', // operator with empty provider
      '',
    ])('rejects: %s', input => {
      expect(() => parseId(input)).toThrow(IdFormatError);
    });
  });

  it('round-trips', () => {
    for (const s of [
      's-amtrak-CHI',
      'r-amtrak-40751',
      't-amtrak-251208',
      'h-amtrak-NYC',
      'o-amtrak',
      's-metra~electric-123',
      't-brightline-service~A~v2',
      's-amtrak-NY-PENN',
    ]) {
      const p = parseId(s);
      expect(encodeId(p.kind, p.provider, p.native)).toBe(s);
    }
  });

  describe('tryParseId', () => {
    it('returns null on bad input instead of throwing', () => {
      expect(tryParseId('garbage')).toBeNull();
      expect(tryParseId('s-amtrak-CHI')).toEqual({
        kind: 's',
        provider: 'amtrak',
        native: 'CHI',
      });
    });
  });

  describe('tryParseKindedId', () => {
    it('asserts kind', () => {
      expect(tryParseKindedId('s-amtrak-CHI', 's')).not.toBeNull();
      expect(tryParseKindedId('s-amtrak-CHI', 'r')).toBeNull();
      expect(tryParseKindedId('garbage', 's')).toBeNull();
    });
  });

  describe('providerOf', () => {
    it('extracts provider', () => {
      expect(providerOf('s-amtrak-CHI')).toBe('amtrak');
      expect(providerOf('o-brightline')).toBe('brightline');
      expect(providerOf('s-metra~electric-CHI')).toBe('metra~electric');
    });
    it('returns null on invalid', () => {
      expect(providerOf('garbage')).toBeNull();
    });
  });

  describe('runKey', () => {
    it('composes tripId@day-of-month from YYYY-MM-DD', () => {
      expect(runKey({ tripId: 't-amtrak-21', runDate: '2026-05-14' })).toBe('t-amtrak-21@14');
    });
    it('accepts RFC3339 / ISO 8601 (what Go time.Time marshals to)', () => {
      expect(runKey({ tripId: 't-amtrak-21', runDate: '2026-05-14T00:00:00Z' })).toBe(
        't-amtrak-21@14',
      );
    });
    it('strips leading zero on the day', () => {
      expect(runKey({ tripId: 't-amtrak-21', runDate: '2026-05-04' })).toBe('t-amtrak-21@4');
    });
    it('accepts a Date', () => {
      expect(runKey({ tripId: 't-amtrak-5', runDate: new Date(Date.UTC(2026, 4, 14)) })).toBe(
        't-amtrak-5@14',
      );
    });
    it('accepts epoch millis', () => {
      const epoch = Date.UTC(2026, 4, 14);
      expect(runKey({ tripId: 't-amtrak-5', runDate: epoch })).toBe('t-amtrak-5@14');
    });
    it('falls back to bare tripId when runDate is missing or invalid', () => {
      expect(runKey({ tripId: 't-amtrak-21' })).toBe('t-amtrak-21');
      expect(runKey({ tripId: 't-amtrak-21', runDate: null })).toBe('t-amtrak-21');
      expect(runKey({ tripId: 't-amtrak-21', runDate: 'garbage' })).toBe('t-amtrak-21');
    });
    it('disambiguates concurrent runs of the same trip', () => {
      const yesterday = runKey({ tripId: 't-amtrak-21', runDate: '2026-05-13' });
      const today = runKey({ tripId: 't-amtrak-21', runDate: '2026-05-14' });
      expect(yesterday).not.toBe(today);
    });
  });
});
