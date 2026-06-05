const { formatScoreDelta, formatTotalScore, formatTimestamp } = require('../../miniprogram/utils/format');

describe('format', () => {
  describe('formatScoreDelta', () => {
    test('positive with plus sign', () => {
      expect(formatScoreDelta(8)).toBe('+8 分');
    });
    test('negative', () => {
      expect(formatScoreDelta(-4)).toBe('-4 分');
    });
    test('zero', () => {
      expect(formatScoreDelta(0)).toBe('0 分');
    });
  });
  describe('formatTotalScore', () => {
    test('integer', () => {
      expect(formatTotalScore(16)).toBe('16 分');
    });
    test('negative integer', () => {
      expect(formatTotalScore(-3)).toBe('-3 分');
    });
  });
  describe('formatTimestamp', () => {
    test('returns string', () => {
      const ts = 1717392000000; // 2024-06-03
      const s = formatTimestamp(ts);
      expect(typeof s).toBe('string');
      expect(s.length).toBeGreaterThan(0);
    });
  });
});
