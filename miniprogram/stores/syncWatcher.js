const roomService = require('../services/roomService');
const roomStore = require('./roomStore');
const roundService = require('../services/roundService');
let session = null;
let suspended = false;
let generation = 0;
const WATCH_RETRY_DELAYS = [30000, 60000, 120000, 300000];
const WATCH_INIT_TIMEOUT_MS = 10000;

function alive(current) { return session === current && !suspended && roomStore.roomId === current.roomId; }
function apply(snapshot, initialIds) {
  if (snapshot.protocol === 2) {
    roomStore.mergeRounds(snapshot.rounds);
    if (!roomStore.historyComplete && !snapshot.historyComplete) {
      const pending = roomStore.rounds.filter(r => r.isOptimistic);
      const recent = roomStore.rounds.filter(r => !r.isOptimistic).slice(-100);
      roomStore.setRounds([...recent, ...pending]);
    }
    roomStore.setServerTotals(snapshot.scoreTotals, snapshot.totalsThrough);
    roomStore.syncCursor = snapshot.throughRoundIndex;
    roomStore.revision = snapshot.revision;
    if (snapshot.historyComplete) roomStore.historyComplete = true;
  } else {
    const clientIds = new Set(snapshot.rounds.map(r => r.clientId));
    const ids = new Set(snapshot.rounds.map(r => r._id));
    const pending = snapshot.room.status === 'active' ? roomStore.rounds.filter(r =>
      !ids.has(r._id) && !clientIds.has(r._id) && (r.isOptimistic || !initialIds.has(r._id))) : [];
    roomStore.setRounds([...snapshot.rounds, ...pending].sort((a, b) => a.roundIndex - b.roundIndex));
  }
  if (snapshot.room.status !== 'active') roomStore.rounds = roomStore.rounds.filter(r => !r.isOptimistic);
  roomStore.setPlayers(snapshot.players);
  if (snapshot.rule) roomStore.setRule(snapshot.rule);
  roomStore.roomStatus = snapshot.room.status;
}
function emit(current, snapshot) {
  const cb = current.callbacks;
  cb.onSyncStatus && cb.onSyncStatus('connected');
  cb.onPlayersChange && cb.onPlayersChange(snapshot.players);
  cb.onRoundsChange && cb.onRoundsChange(roomStore.rounds);
  cb.onRuleChange && snapshot.rule && cb.onRuleChange(snapshot.rule);
  if (snapshot.room.status !== 'active') {
    stop();
    cb.onRoomClosed && cb.onRoomClosed();
  }
}
function logWatchFailure(error) {
  console.warn('房间通知连接不可用，已回退增量轮询', {
    code: error && (error.errCode != null ? error.errCode : error.code),
    message: error && (error.errMsg || error.message) || String(error),
  });
}
function stopWatch(current) {
  const close = current.unwatch;
  current.watchAttempt = null;
  current.unwatch = null;
  current.watchReady = false;
  clearTimeout(current.watchInitTimer);
  current.watchInitTimer = null;
  clearTimeout(current.noticeTimer);
  current.noticeTimer = null;
  if (close) close();
}
function shouldSubscribe(current) {
  return !current.watchAttempt && Date.now() >= current.watchRetryAt;
}
function setupWatch(current, snapshot) {
  if (!shouldSubscribe(current) || !snapshot.sync || snapshot.sync.mode !== 'watch') return;
  const attempt = { recovering: current.watchFailures > 0 };
  current.watchAttempt = attempt;
  const valid = () => alive(current) && current.watchAttempt === attempt;
  const failed = error => {
    if (!valid()) return;
    logWatchFailure(error);
    stopWatch(current);
    const delay = WATCH_RETRY_DELAYS[Math.min(current.watchFailures, WATCH_RETRY_DELAYS.length - 1)];
    current.watchFailures++;
    current.watchRetryAt = Date.now() + delay;
    if (!current.inFlight) schedule(current);
  };
  current.watchInitTimer = setTimeout(() => failed({
    code: 'WATCH_INIT_TIMEOUT', message: '通知连接初始化超时',
  }), WATCH_INIT_TIMEOUT_MS);
  try {
    const close = roomService.watchRoom(snapshot.watchId, notice => {
      if (!valid()) return;
      // 收到首个快照才认为连接建立；初始化期间继续轮询，避免连接悬挂导致漏更新。
      if (!current.watchReady) {
        current.watchReady = true;
        clearTimeout(current.watchInitTimer);
        current.watchInitTimer = null;
        current.watchFailures = 0;
        current.watchRetryAt = 0;
        if (attempt.recovering) console.info('房间通知连接已恢复，已停止增量轮询');
        if (!current.inFlight) schedule(current);
      }
      if (!notice || notice.revision <= (roomStore.revision || 0)) return;
      // 同一突发批次的多次通知合并为一次增量读取。
      if (current.inFlight) { current.dirty = true; return; }
      clearTimeout(current.timer);
      if (!current.noticeTimer) current.noticeTimer = setTimeout(() => {
        current.noticeTimer = null; pull(current);
      }, 100);
    }, failed);
    if (valid()) current.unwatch = close;
    else close(); // 同步报错或会话已结束时，关闭刚返回的旧连接。
  } catch (error) { failed(error); }
}
function schedule(current) {
  if (!alive(current)) return;
  clearTimeout(current.timer);
  const normal = current.watchReady ? (current.policy.reconcileMs || 60000) : (current.policy.pollMs || 5000);
  const delay = current.dirty ? 100 : current.failures
    ? Math.min(30000, 5000 * Math.pow(2, current.failures - 1)) : normal;
  current.dirty = false;
  current.timer = setTimeout(() => pull(current), delay + (current.failures > 1 ? Math.floor(Math.random() * 500) : 0));
}
async function pull(current) {
  if (!alive(current) || current.inFlight) return;
  current.inFlight = true;
  const initialIds = new Set(roomStore.rounds.map(r => r._id));
  const heartbeatMs = current.policy.heartbeatMs || (current.policy.mode === 'watch' ? 60000 : 30000);
  const heartbeat = !current.lastHeartbeat || Date.now() - current.lastHeartbeat >= heartbeatMs;
  try {
    const options = { requestScope: current.scope, heartbeat, subscribe: shouldSubscribe(current) };
    if (roomStore.syncCursor != null) options.sinceRoundIndex = roomStore.syncCursor;
    if (roomStore.revision != null) options.knownRevision = roomStore.revision;
    const snapshot = await roomService.getRoomState(current.roomId, options);
    if (!alive(current)) return;
    if (heartbeat) current.lastHeartbeat = Date.now();
    current.failures = 0;
    current.policy = snapshot.sync || {};
    if (current.policy.mode !== 'watch') {
      stopWatch(current);
      current.watchFailures = 0;
      current.watchRetryAt = 0;
    }
    apply(snapshot, initialIds);
    emit(current, snapshot);
    if (!alive(current)) return;
    if (options.subscribe) setupWatch(current, snapshot);
    if (roundService.reconcilePending) {
      roundService.reconcilePending(current.roomId).then(results => {
        if (!alive(current)) return;
        for (const result of results) roomStore.acceptRound(result.data.clientId, result);
        if (results.length) current.callbacks.onRoundsChange && current.callbacks.onRoundsChange(roomStore.rounds);
      }).catch(() => {});
    }
  } catch (err) {
    if (!alive(current)) return;
    current.failures++;
    current.callbacks.onSyncStatus && current.callbacks.onSyncStatus('reconnecting');
    if (['NOT_IN_ROOM', 'FORBIDDEN', 'ROOM_NOT_FOUND'].includes(err.code)) {
      stop();
      current.callbacks.onSyncStatus && current.callbacks.onSyncStatus('unavailable');
      return;
    }
  } finally {
    current.inFlight = false;
    schedule(current);
  }
}
function start(roomId, callbacks = {}, initial) {
  stop();
  const current = { roomId, callbacks, timer: null, unwatch: null, lastHeartbeat: 0,
    scope: ++generation, failures: 0, policy: {}, inFlight: false,
    watchAttempt: null, watchReady: false, watchInitTimer: null, watchFailures: 0, watchRetryAt: 0 };
  session = current;
  callbacks.onSyncStatus && callbacks.onSyncStatus('connecting');
  if (suspended) return;
  if (initial) {
    current.lastHeartbeat = Date.now();
    current.policy = initial.sync || {};
    emit(current, initial);
    if (alive(current)) { setupWatch(current, initial); schedule(current); }
  } else pull(current);
}
function cleanup(current) {
  if (!current) return;
  clearTimeout(current.timer);
  clearTimeout(current.noticeTimer);
  stopWatch(current);
}
function stop() { const old = session; session = null; cleanup(old); }
function suspend() {
  suspended = true;
  const old = session;
  if (old) {
    cleanup(old);
    session = { ...old, scope: ++generation, timer: null, noticeTimer: null, unwatch: null, inFlight: false, dirty: false,
      watchAttempt: null, watchReady: false, watchInitTimer: null, watchFailures: 0, watchRetryAt: 0 };
  }
}
function resume() {
  if (!suspended) return;
  suspended = false;
  if (session) { session.lastHeartbeat = 0; pull(session); }
}
module.exports = { start, stop, suspend, resume };
