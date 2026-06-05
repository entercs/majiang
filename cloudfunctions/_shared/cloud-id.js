const { ROOM_CODE_LENGTH } = require('./constants');

/**
 * Generate a 6-digit numeric room code (100000-999999)
 */
function generateRoomCode() {
  const min = Math.pow(10, ROOM_CODE_LENGTH - 1);
  const max = Math.pow(10, ROOM_CODE_LENGTH) - 1;
  const n = Math.floor(Math.random() * (max - min + 1)) + min;
  return String(n);
}

/**
 * Generate a unique room code asynchronously, looping until uniqueness check passes
 * @param {Function} existsCheck - async (code: string) => boolean returning true if exists
 * @param {number} maxRetries
 * @returns {Promise<string>}
 */
async function generateUniqueRoomCode(existsCheck, maxRetries = 10) {
  for (let i = 0; i < maxRetries; i++) {
    const code = generateRoomCode();
    const exists = await existsCheck(code);
    if (!exists) return code;
  }
  throw new Error('Failed to generate unique room code after retries');
}

/**
 * Generate a local session ID
 */
function generateClientId() {
  return 'cli_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);
}

/**
 * Generate a temporary round ID (for optimistic updates)
 */
function generateTempId() {
  return 'temp_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
}

module.exports = {
  generateRoomCode,
  generateUniqueRoomCode,
  generateClientId,
  generateTempId,
};
