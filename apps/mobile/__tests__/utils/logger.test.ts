import { logger } from '../../utils/logger';

describe('Logger utility', () => {
  let consoleLogSpy: jest.SpyInstance;
  let consoleWarnSpy: jest.SpyInstance;
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    // Spy on console methods
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

    // Clear logs before each test
    logger.clearLogs();
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  describe('warn', () => {
    it('should log warnings', () => {
      logger.warn('Test warning', 'extra data');

      expect(consoleWarnSpy).toHaveBeenCalledWith('[WARN] Test warning', 'extra data');
    });

    it('should store warnings in log history', () => {
      logger.warn('Test warning');

      const logs = logger.getRecentLogs();
      expect(logs).toHaveLength(1);
      expect(logs[0].level).toBe('WARN');
      expect(logs[0].message).toBe('Test warning');
    });
  });

  describe('error', () => {
    it('should log errors', () => {
      const error = new Error('Test error');
      logger.error('Error occurred', error);

      expect(consoleErrorSpy).toHaveBeenCalledWith('[ERROR] Error occurred', error);
    });

    it('should store errors in log history', () => {
      logger.error('Error occurred');

      const logs = logger.getRecentLogs();
      expect(logs).toHaveLength(1);
      expect(logs[0].level).toBe('ERROR');
      expect(logs[0].message).toBe('Error occurred');
    });
  });

  describe('getRecentLogs', () => {
    it('should return recent logs', () => {
      logger.warn('Warning 1');
      logger.error('Error 1');
      logger.warn('Warning 2');

      const logs = logger.getRecentLogs();
      expect(logs).toHaveLength(3);
      expect(logs[0].message).toBe('Warning 1');
      expect(logs[1].message).toBe('Error 1');
      expect(logs[2].message).toBe('Warning 2');
    });

    it('should limit returned logs to specified count', () => {
      logger.warn('Log 1');
      logger.warn('Log 2');
      logger.warn('Log 3');
      logger.warn('Log 4');

      const logs = logger.getRecentLogs(2);
      expect(logs).toHaveLength(2);
      expect(logs[0].message).toBe('Log 3');
      expect(logs[1].message).toBe('Log 4');
    });
  });

  describe('clearLogs', () => {
    it('should clear all stored logs', () => {
      logger.warn('Test 1');
      logger.error('Test 2');

      expect(logger.getRecentLogs()).toHaveLength(2);

      logger.clearLogs();
      expect(logger.getRecentLogs()).toHaveLength(0);
    });
  });

  describe('exportLogs', () => {
    it('should export logs as JSON string', () => {
      logger.warn('Test warning');

      const exported = logger.exportLogs();
      const parsed = JSON.parse(exported);

      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed[0].message).toBe('Test warning');
      expect(parsed[0].level).toBe('WARN');
    });
  });
});
