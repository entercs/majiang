const { callFunction } = require('./cloud');

function createRoom({ nickname, avatarIndex, clientId }) {
  return callFunction('createRoom', { nickname, avatarIndex, clientId });
}

function joinRoom({ roomCode, nickname, avatarIndex }) {
  return callFunction('joinRoom', { roomCode, nickname, avatarIndex });
}

function updateRule({ roomId, rule }) {
  return callFunction('updateRule', { roomId, rule });
}

function getRoom(roomId) {
  const db = wx.cloud.database();
  return db.collection('rooms').doc(roomId).get().then(r => r.data);
}

function getPlayers(roomId) {
  const db = wx.cloud.database();
  return db.collection('players').where({ roomId }).get().then(r => r.data);
}

function finishRoom(roomId) {
  return callFunction('finishRoom', { roomId });
}

module.exports = { createRoom, joinRoom, updateRule, getRoom, getPlayers, finishRoom };
