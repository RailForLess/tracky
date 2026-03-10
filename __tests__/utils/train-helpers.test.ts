import { extractTrainNumber } from '../../utils/train-helpers';

// Mock the gtfsParser
jest.mock('../../utils/gtfs-parser', () => ({
  gtfsParser: {
    getTrainNumber: jest.fn((tripId: string) => {
      // Simulate GTFS parser behavior
      if (tripId === 'Amtrak-43-20240104') return '43';
      if (tripId === '2151') return '2151';
      // Simulate GTFS lookup miss — returns tripId unchanged
      return tripId;
    }),
  },
}));

describe('train-helpers utilities', () => {
  describe('extractTrainNumber', () => {
    it('should extract train number from GTFS trip ID', () => {
      expect(extractTrainNumber('Amtrak-43-20240104')).toBe('43');
    });

    it('should return train number directly if already a number', () => {
      expect(extractTrainNumber('2151')).toBe('2151');
    });

    it('should extract numeric portion as fallback', () => {
      // When gtfsParser returns the tripId unchanged, extract numbers
      expect(extractTrainNumber('train-123-xyz')).toMatch(/123/);
    });

    it('should extract last numeric sequence from date-prefixed trip ID', () => {
      // "2026-03-10_AMTK_156" → should get "156", not "2026"
      expect(extractTrainNumber('2026-03-10_AMTK_156')).toBe('156');
    });

    it('should return raw numeric ID when no other format matches', () => {
      // Pure numeric trip IDs like "249400" — acceptable last resort
      expect(extractTrainNumber('249400')).toBe('249400');
    });

    it('should extract last number from complex trip ID', () => {
      expect(extractTrainNumber('2026-01-16_AMTK_543')).toBe('543');
    });

    it('should return tripId if no numbers present', () => {
      expect(extractTrainNumber('no-numbers-here')).toBe('no-numbers-here');
    });
  });
});
