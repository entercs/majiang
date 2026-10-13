const roomService = require('../services/roomService');
const roomStore = require('./roomStore');
let session = null;
let suspended = false;

function start(roomId, callbacks = {}) {
  stop();
  session = { roomId, callbacks, timer: null, lastHeartbeat: 0 };
  callbacks.onSyncStatus && callbacks.onSyncStatus('connecting');
  if (!suspended) pull(session);
}

async function pull(current) {
  // 串行轮询；切换房间、切后台后，旧请求不得覆盖新状态。
  const initialIds = new Set(roomStore.rounds.map(r => r._id));
  const heartbeat = Date.now() - current.lastHeartbeat >= 30000;
  try {
    const snapshot = await roomService.getRoomSnapshot(current.roomId, { heartbeat });
    if (session !== current || suspended || roomStore.roomId !== current.roomId) return;
    if (heartbeat) current.lastHeartbeat = Date.now();
    const cloudClientIds = new Set(snapshot.rounds.map(r => r.clientId));
    const cloudIds = new Set(snapshot.rounds.map(r => r._id));
    // 已确认历史以云端完整快照为准，只保留未确认或请求期间刚确认的记录。
    const pending = snapshot.room.status === 'active' ? roomStore.rounds.filter(r =>
      !cloudIds.has(r._id) && !cloudClientIds.has(r._id) &&
      (r.isOptimistic || !initialIds.has(r._id))) : [];
    roomStore.setPlayers(snapshot.players);
    roomStore.setRounds([...snapshot.rounds, ...pending].sort((a, b) => a.roundIndex - b.roundIndex));
    roomStore.setRule(snapshot.rule);
    roomStore.roomStatus = snapshot.room.status;
    current.callbacks.onSyncStatus && current.callbacks.onSyncStatus('connected');
    current.callbacks.onPlayersChange && current.callbacks.onPlayersChange(snapshot.players);
    current.callbacks.onRoundsChange && current.callbacks.onRoundsChange(roomStore.rounds);
    current.callbacks.onRuleChange && current.callbacks.onRuleChange(snapshot.rule);
    if (snapshot.room.status !== 'active') {
      stop();
      current.callbacks.onRoomClosed && current.callbacks.onRoomClosed();
      return;
    }
  } catch (err) {
    if (session !== current || suspended) return;
    console.warn('room sync failed:', err.code || err.message);
    current.callbacks.onSyncStatus && current.callbacks.onSyncStatus('reconnecting');
  }
  if (session === current && !suspended) current.timer = setTimeout(() => pull(current), 2000);
}

function stop() {
  if (session && session.timer) clearTimeout(session.timer);
  session = null;
}

function suspend() {
  suspended = true;
  if (session) {
    if (session.timer) clearTimeout(session.timer);
    session = { ...session, timer: null };
  }
}

function resume() {
  if (!suspended) return;
  suspended = false;
  if (session) {
    session.lastHeartbeat = 0;
    pull(session);
  }
}

module.exports = { start, stop, suspend, resume };
