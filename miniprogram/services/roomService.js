const { callFunction } = require('./cloud');

function createRoom({ nickname, avatarIndex, clientId, baseScore, nicknameAuto }) {
  return callFunction('createRoom', { nickname, avatarIndex, clientId, baseScore, nicknameAuto });
}

function joinRoom({ roomCode, nickname, avatarIndex, clientId, nicknameAuto }) {
  return callFunction('joinRoom', { roomCode, nickname, avatarIndex, clientId, nicknameAuto });
}

function updateRule({ roomId, rule }) {
  const appStore = require('../stores/appStore');
  return callFunction('updateRule', { roomId, rule, memberClientId: appStore.clientId });
}

async function getRoomSnapshot(roomId, { heartbeat = false } = {}) {
  const appStore = require('../stores/appStore');
  let offset = 0;
  let snapshot;
  const rounds = [];
  do {
    const res = await callFunction('getRoomSnapshot', {
      roomId, memberClientId: appStore.clientId, heartbeat: heartbeat && offset === 0,
      offset, throughRoundIndex: snapshot ? snapshot.throughRoundIndex : undefined,
    });
    if (!snapshot) snapshot = res.data;
    rounds.push(...res.data.rounds);
    offset = res.data.nextOffset;
  } while (offset != null);
  return { ...snapshot, rounds };
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

function getRoomQRCode({ roomCode }) {
  return callFunction('getRoomQRCode', { roomCode });
}

module.exports = { createRoom, joinRoom, updateRule, getRoom, getRoomStatus, getPlayers, leaveRoom, getMyRooms, getRoomQRCode, getRoomSnapshot };
