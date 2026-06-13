const playerService = require('../services/playerService');
const roundService = require('../services/roundService');
const roomService = require('../services/roomService');
const roomStore = require('./roomStore');

let pollTimer = null;
let watchCleanup = null;
let stopRequested = false;

const ROOM_STATUS = { ACTIVE: 'active', FINISHED: 'finished' };

/**
 * 启动房间同步（纯轮询）
 * @param {string} roomId
 * @param {Object} callbacks { onSyncStatus, onPlayersChange, onRoundsChange, onRuleChange, onRoomClosed }
 */
function start(roomId, callbacks) {
  stop();
  stopRequested = false;
  callbacks.onSyncStatus && callbacks.onSyncStatus('connecting');

  // 立即拉一次
  _pullOnce(roomId, callbacks);

  // 2 秒轮询
  pollTimer = setInterval(() => {
    if (!stopRequested) _pullOnce(roomId, callbacks);
  }, 2000);
}

function _pullOnce(roomId, callbacks) {
  Promise.all([
    playerService.getPlayers(roomId),
    roundService.getRounds(roomId),
    roomService.getRoomStatus(roomId),  // 拉房间状态
  ]).then(([players, cloudRounds, roomStatus]) => {
    if (stopRequested) return;

    // 房间被关闭 → 弹窗并跳转到总结算页
    if (roomStatus !== ROOM_STATUS.ACTIVE) {
      stop();
      roomStore.roomStatus = ROOM_STATUS.FINISHED;
      callbacks.onRoomClosed && callbacks.onRoomClosed();
      return;
    }

    roomStore.setPlayers(players);
    const merged = _mergeRounds(roomStore.rounds, cloudRounds);
    roomStore.setRounds(merged);
    callbacks.onSyncStatus && callbacks.onSyncStatus('connected');
    callbacks.onPlayersChange && callbacks.onPlayersChange(players);
    callbacks.onRoundsChange && callbacks.onRoundsChange(merged);
  }).catch(() => { /* 静默失败，下次轮询重试 */ });
}

/**
 * 合并本地 rounds（含未确认的 tempRound）和云端 rounds
 */
function _mergeRounds(localRounds, cloudRounds) {
  const map = new Map();
  for (const r of (cloudRounds || [])) {
    map.set(r._id, r);
  }
  for (const r of (localRounds || [])) {
    if (r.isOptimistic) {
      const real = (cloudRounds || []).find(c => c.clientId === r._id);
      if (real) {
        map.set(real._id, { ...real, clientId: r._id });
        map.delete(r._id);
      } else if (!map.has(r._id)) {
        map.set(r._id, r);
      }
    } else {
      if (!map.has(r._id)) {
        map.set(r._id, r);
      }
    }
  }
  return Array.from(map.values()).sort((a, b) => a.roundIndex - b.roundIndex);
}

function stop() {
  stopRequested = true;
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
  if (watchCleanup) { watchCleanup(); watchCleanup = null; }
}

module.exports = { start, stop };
