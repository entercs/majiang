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

const stateInflight = new Map();
async function getRoomState(roomId, options = {}) {
  const appStore = require('../stores/appStore');
  const key = JSON.stringify([appStore.clientId, roomId, options]);
  if (stateInflight.has(key)) return stateInflight.get(key);
  const request = (async () => {
    let first, offset = 0;
    const rounds = [];
    do {
      const { requestScope, ...cloudOptions } = options;
      const data = { roomId, memberClientId: appStore.clientId, protocol: 2, ...cloudOptions,
        heartbeat: !!options.heartbeat && offset === 0, subscribe: !!options.subscribe && offset === 0, offset };
      if (first) data.throughRoundIndex = first.throughRoundIndex;
      const res = await callFunction('getRoomSnapshot', data);
      if (!first) first = res.data;
      rounds.push(...res.data.rounds);
      offset = res.data.nextOffset;
    } while (offset != null);
    return { ...first, rounds };
  })().finally(() => stateInflight.delete(key));
  stateInflight.set(key, request);
  return request;
}
function watchRoom(watchId, onChange, onError) {
  // 自定义安全规则校验查询条件，不会根据文档 ID 自动补齐归属条件。
  // {openid} 由云端替换为当前调用者身份，不依赖本地缓存的账号信息。
  const ref = wx.cloud.database().collection('roomFeeds').where({
    _id: watchId, _openid: '{openid}',
  });
  let diagnosed = false;
  const watcher = ref.watch({
    onChange: snapshot => onChange(snapshot.docs && snapshot.docs[0]),
    onError: error => {
      onError(error);
      // 每条失败连接只检查一次普通读取，区分数据权限问题与实时通道问题。
      if (diagnosed) return;
      diagnosed = true;
      Promise.resolve().then(() => ref.get()).then(result => {
        const doc = result.data && result.data[0];
        console.warn('房间通知读取诊断', {
          readable: true, exists: !!doc,
          hasOwner: !!(doc && doc._openid),
        });
      }).catch(readError => {
        console.warn('房间通知读取诊断', {
          readable: false,
          code: readError && (readError.errCode != null ? readError.errCode : readError.code),
          message: readError && (readError.errMsg || readError.message) || String(readError),
        });
      });
    },
  });
  return () => {
    try { const closed = watcher.close(); if (closed && closed.catch) closed.catch(() => {}); } catch (_) {}
  };
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

module.exports = { createRoom, joinRoom, updateRule, getRoom, getRoomStatus, getPlayers, leaveRoom, getMyRooms, getRoomQRCode, getRoomSnapshot, getRoomState, watchRoom };
