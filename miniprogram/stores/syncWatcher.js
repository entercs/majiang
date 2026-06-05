const playerService = require('../services/playerService');
const roundService = require('../services/roundService');
const roomStore = require('./roomStore');

let pollTimer = null;
let watchCleanup = null;
let stopRequested = false;

/**
 * 启动房间同步（纯轮询）
 * @param {string} roomId
 * @param {Object} callbacks { onPlayersChange, onRoundsChange, onRuleChange, onSyncStatus }
 *
 * 注：原设计有"watch 实时推送"备用通道，但云开发个人版实时推送连接数有限 + 存在 setTimeout 泄漏 bug，
 *    实际运行中 watch 持续失败。MVP 阶段纯轮询已够用（2 秒内同步，4 人麻将无感）。
 *    如未来需要秒级推送，可重新启用并修复泄漏。
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
  ]).then(([players, cloudRounds]) => {
    if (stopRequested) return;
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
 * - 云端数据为权威
 * - 本地 tempRound 在云端返回对应真实 round 前保留
 * - 避免 watch/轮询 直接覆盖导致"先出现 → 消失 → 再出现"闪烁
 */
function _mergeRounds(localRounds, cloudRounds) {
  const map = new Map();
  // 1. 用云端数据建立索引
  for (const r of (cloudRounds || [])) {
    map.set(r._id, r);
  }
  // 2. 本地数据处理：用 isOptimistic 字段识别 tempRound
  for (const r of (localRounds || [])) {
    if (r.isOptimistic) {
      // 乐观更新（tempRound）：找云端是否有 clientId 匹配的对应真实 round
      const real = (cloudRounds || []).find(c => c.clientId === r._id);
      if (real) {
        // 用真实 round 替换 tempRound（保留 clientId 字段以便后续 replaceRound 也能匹配）
        map.set(real._id, { ...real, clientId: r._id });
        map.delete(r._id);
      } else if (!map.has(r._id)) {
        // 云端还没回传，保留 tempRound
        map.set(r._id, r);
      }
    } else {
      // 真实 round：云端有就跳，云端没有就保留（防时序丢失）
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
