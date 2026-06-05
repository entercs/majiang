const { generateRoomCode } = require('../../miniprogram/utils/cloud-id');

describe('cloud-id', () => {
  describe('generateRoomCode', () => {
    test('returns 6-digit string', () => {
      for (let i = 0; i < 100; i++) {
        const code = generateRoomCode();
        expect(code).toMatch(/^\d{6}$/);
      }
    });
    test('range 100000-999999', () => {
      for (let i = 0; i < 100; i++) {
        const code = generateRoomCode();
        const n = parseInt(code, 10);
        expect(n).toBeGreaterThanOrEqual(100000);
        expect(n).toBeLessThanOrEqual(999999);
      }
    });
    test('produces different codes (probabilistic)', () => {
      const codes = new Set();
      for (let i = 0; i < 1000; i++) codes.add(generateRoomCode());
      expect(codes.size).toBeGreaterThan(900); // at least 90% unique
    });
  });
});
