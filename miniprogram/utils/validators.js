const { AVATAR_COUNT } = require('./constants');

function isValidRoomCode(code) {
  return typeof code === 'string' && /^\d{6}$/.test(code);
}

function isValidNickname(name) {
  if (typeof name !== 'string') return false;
  const trimmed = name.trim();
  return trimmed.length >= 1 && trimmed.length <= 8;
}

function normalizeNickname(name) {
  if (typeof name !== 'string') return '';
  return name.trim();
}

function isValidAvatarIndex(idx) {
  return Number.isInteger(idx) && idx >= 0 && idx < AVATAR_COUNT;
}

function isValidFan(fan) {
  return Number.isInteger(fan) && fan >= 0 && fan <= 100;
}

function isValidGangCount(count) {
  return Number.isInteger(count) && count >= 0 && count <= 16;
}

module.exports = {
  isValidRoomCode,
  isValidNickname,
  normalizeNickname,
  isValidAvatarIndex,
  isValidFan,
  isValidGangCount,
};
