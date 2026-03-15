import {
  formatTime,
  formatTimeWithDayOffset,
  parseTimeToMinutes,
  parseTimeToDate,
  addDelayToTime,
} from '../../utils/time-formatting';

describe('time-formatting utilities', () => {
  describe('formatTimeWithDayOffset', () => {
    it('should format standard 24-hour time to 12-hour AM/PM', () => {
      expect(formatTimeWithDayOffset('14:30')).toEqual({ time: '2:30 PM', dayOffset: 0 });
      expect(formatTimeWithDayOffset('09:15')).toEqual({ time: '9:15 AM', dayOffset: 0 });
      expect(formatTimeWithDayOffset('00:00')).toEqual({ time: '12:00 AM', dayOffset: 0 });
      expect(formatTimeWithDayOffset('12:00')).toEqual({ time: '12:00 PM', dayOffset: 0 });
    });

    it('should handle overnight trains (hours >= 24)', () => {
      expect(formatTimeWithDayOffset('25:30')).toEqual({ time: '1:30 AM', dayOffset: 1 });
      expect(formatTimeWithDayOffset('26:45')).toEqual({ time: '2:45 AM', dayOffset: 1 });
      expect(formatTimeWithDayOffset('48:00')).toEqual({ time: '12:00 AM', dayOffset: 2 });
    });
  });

  describe('formatTime', () => {
    it('should format time without day offset suffix', () => {
      expect(formatTime('14:30')).toBe('2:30 PM');
      expect(formatTime('09:15')).toBe('9:15 AM');
    });

    it('should add +N suffix for overnight trains', () => {
      expect(formatTime('25:30')).toBe('1:30 AM +1');
      expect(formatTime('48:00')).toBe('12:00 AM +2');
    });
  });

  describe('parseTimeToMinutes', () => {
    it('should convert 12-hour time to minutes since midnight', () => {
      expect(parseTimeToMinutes('12:00 AM')).toBe(0);
      expect(parseTimeToMinutes('1:00 AM')).toBe(60);
      expect(parseTimeToMinutes('12:00 PM')).toBe(720);
      expect(parseTimeToMinutes('2:30 PM')).toBe(870);
      expect(parseTimeToMinutes('11:59 PM')).toBe(1439);
    });

    it('should handle case-insensitive meridian', () => {
      expect(parseTimeToMinutes('2:30 pm')).toBe(870);
      expect(parseTimeToMinutes('2:30 PM')).toBe(870);
    });

    it('should return 0 for invalid time strings', () => {
      expect(parseTimeToMinutes('invalid')).toBe(0);
      expect(parseTimeToMinutes('')).toBe(0);
    });
  });

  describe('parseTimeToDate', () => {
    it('should convert time string to Date object', () => {
      const baseDate = new Date(2024, 0, 15, 0, 0, 0, 0); // Jan 15, 2024 midnight

      const result = parseTimeToDate('2:30 PM', baseDate);
      expect(result.getHours()).toBe(14);
      expect(result.getMinutes()).toBe(30);
      expect(result.getDate()).toBe(15);
    });

    it('should handle midnight correctly', () => {
      const baseDate = new Date(2024, 0, 15, 0, 0, 0, 0);

      const result = parseTimeToDate('12:00 AM', baseDate);
      expect(result.getHours()).toBe(0);
      expect(result.getMinutes()).toBe(0);
    });

    it('should handle noon correctly', () => {
      const baseDate = new Date(2024, 0, 15, 0, 0, 0, 0);

      const result = parseTimeToDate('12:00 PM', baseDate);
      expect(result.getHours()).toBe(12);
      expect(result.getMinutes()).toBe(0);
    });
  });

  describe('addDelayToTime', () => {
    it('should add delay minutes to time', () => {
      expect(addDelayToTime('2:30 PM', 30)).toEqual({ time: '3:00 PM', dayOffset: 0 });
      expect(addDelayToTime('11:30 PM', 30)).toEqual({ time: '12:00 AM', dayOffset: 1 });
    });

    it('should handle day rollover with multiple days', () => {
      expect(addDelayToTime('11:00 PM', 180)).toEqual({ time: '2:00 AM', dayOffset: 1 });
    });

    it('should handle base day offset', () => {
      expect(addDelayToTime('11:30 PM', 60, 1)).toEqual({ time: '12:30 AM', dayOffset: 2 });
    });
  });
});
