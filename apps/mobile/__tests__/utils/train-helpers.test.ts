import { extractTrainNumber, isLikelyTrainNumber } from '../../utils/train-helpers';

// Mock the gtfsParser
jest.mock('../../utils/gtfs-parser', () => ({
  gtfsParser: {
    getTrainNumber: jest.fn((tripId: string) => {
      // Simulate GTFS parser behavior — returns trip_short_name or null
      if (tripId === 'Amtrak-43-20240104') return '43';
      if (tripId === '2151') return '2151';
      // Simulate GTFS lookup miss — returns null
      return null;
    }),
  },
}));

describe('train-helpers utilities', () => {
  describe('isLikelyTrainNumber', () => {
    it('should accept 1-4 digit numbers', () => {
      expect(isLikelyTrainNumber('1')).toBe(true);
      expect(isLikelyTrainNumber('43')).toBe(true);
      expect(isLikelyTrainNumber('543')).toBe(true);
      expect(isLikelyTrainNumber('2151')).toBe(true);
    });

    it('should reject 5+ digit numbers (opaque IDs)', () => {
      expect(isLikelyTrainNumber('24876')).toBe(false);
      expect(isLikelyTrainNumber('248766')).toBe(false);
      expect(isLikelyTrainNumber('1234567')).toBe(false);
    });

    it('should reject non-numeric strings', () => {
      expect(isLikelyTrainNumber('abc')).toBe(false);
      expect(isLikelyTrainNumber('12abc')).toBe(false);
      expect(isLikelyTrainNumber('')).toBe(false);
    });
  });

  describe('extractTrainNumber', () => {
    it('should extract train number from GTFS trip ID via parser', () => {
      expect(extractTrainNumber('Amtrak-43-20240104')).toBe('43');
    });

    it('should return train number directly if already a valid number', () => {
      expect(extractTrainNumber('2151')).toBe('2151');
    });

    it('should extract trailing number after underscore', () => {
      expect(extractTrainNumber('2026-03-10_AMTK_156')).toBe('156');
    });

    it('should extract last number from complex trip ID with underscores', () => {
      expect(extractTrainNumber('2026-01-16_AMTK_543')).toBe('543');
    });

    it('should return null for opaque numeric IDs (5+ digits)', () => {
      expect(extractTrainNumber('249400')).toBeNull();
    });

    it('should return null for pure-numeric 6-digit database IDs', () => {
      expect(extractTrainNumber('248766')).toBeNull();
    });

    it('should return null when no train number can be extracted', () => {
      expect(extractTrainNumber('no-numbers-here')).toBeNull();
    });

    it('should return null for strings with numbers but no underscore structure', () => {
      expect(extractTrainNumber('train-123-xyz')).toBeNull();
    });

    it('should handle small valid train numbers as direct input', () => {
      expect(extractTrainNumber('80')).toBe('80');
      expect(extractTrainNumber('5')).toBe('5');
      expect(extractTrainNumber('600')).toBe('600');
    });
  });
});
