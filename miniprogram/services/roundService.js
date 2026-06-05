const { callFunction } = require('./cloud');

/**
 * v2: 提交一局分数到云函数 settleRound
 * @param {Object} params
 * @param {string} params.roomId
 * @param {string} params.clientId
 * @param {string} [params.type] - 'manual' | 'auto'
 * @param {Object} [params.scoreChanges] - { playerId: delta }（manual 模式）
 * @param {Object} [params.input] - { winnerId, loserId, winType, fan, ... }（auto 模式）
 * @returns {Promise<{code: string, data?: Object, message?: string}>}
 */
function submitRound({ roomId, clientId, type, scoreChanges, input }) {
  const data = { roomId, clientId };
  if (type) data.type = type;
  if (scoreChanges) data.scoreChanges = scoreChanges;
  if (input) data.input = input;
  return callFunction('settleRound', data);
}

function getRounds(roomId) {
  const db = wx.cloud.database();
  return db.collection('rounds').where({ roomId }).orderBy('roundIndex', 'asc').get().then(r => r.data);
}

function watchRounds(roomId, onChange) {
  const db = wx.cloud.database();
  const watcher = db.collection('rounds').where({ roomId }).watch({
    onChange: (snapshot) => onChange(snapshot.docs),
    onError: (err) => console.error('watch rounds error:', err),
  });
  return () => watcher.close();
}

module.exports = { submitRound, getRounds, watchRounds };
