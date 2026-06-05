const v = require('../../miniprogram/utils/validators');

describe('validators', () => {
  describe('isValidRoomCode', () => {
    test('accepts 6-digit number', () => {
      expect(v.isValidRoomCode('123456')).toBe(true);
    });
    test('rejects 5-digit', () => {
      expect(v.isValidRoomCode('12345')).toBe(false);
    });
    test('rejects 7-digit', () => {
      expect(v.isValidRoomCode('1234567')).toBe(false);
    });
    test('rejects letters', () => {
      expect(v.isValidRoomCode('abcdef')).toBe(false);
    });
    test('rejects empty', () => {
      expect(v.isValidRoomCode('')).toBe(false);
    });
    test('rejects null', () => {
      expect(v.isValidRoomCode(null)).toBe(false);
    });
  });

  describe('isValidNickname', () => {
    test('accepts 1-8 chars', () => {
      expect(v.isValidNickname('张三')).toBe(true);
      expect(v.isValidNickname('a')).toBe(true);
      expect(v.isValidNickname('12345678')).toBe(true);
    });
    test('rejects empty', () => {
      expect(v.isValidNickname('')).toBe(false);
      expect(v.isValidNickname('   ')).toBe(false);
    });
    test('rejects > 8 chars', () => {
      expect(v.isValidNickname('123456789')).toBe(false);
    });
    test('trims whitespace', () => {
      expect(v.normalizeNickname('  张三  ')).toBe('张三');
    });
  });

  describe('isValidAvatarIndex', () => {
    test('accepts 0-7', () => {
      expect(v.isValidAvatarIndex(0)).toBe(true);
      expect(v.isValidAvatarIndex(7)).toBe(true);
    });
    test('rejects < 0', () => {
      expect(v.isValidAvatarIndex(-1)).toBe(false);
    });
    test('rejects > 7', () => {
      expect(v.isValidAvatarIndex(8)).toBe(false);
    });
  });

  describe('isValidFan', () => {
    test('accepts 0-100', () => {
      expect(v.isValidFan(0)).toBe(true);
      expect(v.isValidFan(50)).toBe(true);
      expect(v.isValidFan(100)).toBe(true);
    });
    test('rejects negative', () => {
      expect(v.isValidFan(-1)).toBe(false);
    });
    test('rejects > 100', () => {
      expect(v.isValidFan(101)).toBe(false);
    });
    test('rejects non-integer', () => {
      expect(v.isValidFan(1.5)).toBe(false);
    });
  });
});
