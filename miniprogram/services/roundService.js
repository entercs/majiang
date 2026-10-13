const { callFunction } = require('./cloud');

/**
 * v2: 提交一局分数到云函数 settleRound
 * @param {Object} params
 * @param {string} params.roomId
 * @param {string} params.clientId
 * @param {string} [params.playerId] - 调用方在房间里的 playerId（避免老数据 clientId 为 null）
 * @param {string} [params.type] - 'manual' | 'auto'
 * @param {Object} [params.scoreChanges] - { playerId: delta }（manual 模式）
 * @param {Object} [params.input] - { winnerId, loserId, winType, fan, ... }（auto 模式）
 * @returns {Promise<{code: string, data?: Object, message?: string}>}
 */
function submitRound({ roomId, clientId, playerId, type, scoreChanges, input }) {
  const appStore = require('../stores/appStore');
  const data = { roomId, clientId, memberClientId: appStore.clientId };
  if (playerId) data.playerId = playerId;
  if (type) data.type = type;
  if (scoreChanges) data.scoreChanges = scoreChanges;
  if (input) data.input = input;
  return callFunction('settleRound', data);
}

async function getRounds(roomId) {
  const db = wx.cloud.database();
  const rounds = [];
  for (let offset = 0; ; offset += 20) {
    const page = await db.collection('rounds').where({ roomId }).orderBy('roundIndex', 'asc')
      .orderBy('_id', 'asc').skip(offset).limit(20).get();
    rounds.push(...page.data);
    if (page.data.length < 20) return rounds;
  }
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
