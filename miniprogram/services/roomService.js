const { callFunction } = require('./cloud');

function createRoom({ nickname, avatarIndex, clientId, baseScore, nicknameAuto }) {
  return callFunction('createRoom', { nickname, avatarIndex, clientId, baseScore, nicknameAuto });
}

function joinRoom({ roomCode, nickname, avatarIndex, clientId, nicknameAuto }) {
  return callFunction('joinRoom', { roomCode, nickname, avatarIndex, clientId, nicknameAuto });
}

function updateRule({ roomId, rule }) {
  return callFunction('updateRule', { roomId, rule });
}

function getRoom(roomId) {
  const db = wx.cloud.database();
  return db.collection('rooms').doc(roomId).get().then(r => r.data);
}

function getRoomStatus(roomId) {
  const db = wx.cloud.database();
  return db.collection('rooms').doc(roomId).field({ status: true }).get().then(r => r.data?.status);
}

function getPlayers(roomId) {
  const db = wx.cloud.database();
  return db.collection('players').where({ roomId }).get().then(r => r.data);
}

function leaveRoom({ roomId, playerId, clientId }) {
  return callFunction('leaveRoom', { roomId, playerId, clientId });
}

function getMyRooms({ clientId }) {
  return callFunction('getMyRooms', { clientId });
}

module.exports = { createRoom, joinRoom, updateRule, getRoom, getRoomStatus, getPlayers, leaveRoom, getMyRooms };
