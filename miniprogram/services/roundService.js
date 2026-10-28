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
const pending = new Map();
const inflight = new Map();
const RETRIES_KEY = 'pendingScoreOperationsV1';
function loadPending() {
  try {
    const stored = wx.getStorageSync && wx.getStorageSync(RETRIES_KEY);
    if (Array.isArray(stored)) for (const op of stored) {
      if (op && op.roomId && op.clientId && !pending.has(op.clientId)) pending.set(op.clientId, op);
    }
  } catch (_) {}
}
function savePending(strict = false) {
  try {
    if (!wx.setStorageSync) throw new Error('storage unavailable');
    wx.setStorageSync(RETRIES_KEY, [...pending.values()]);
  } catch (_) {
    if (strict) {
      const error = new Error('无法保存给分确认记录，请检查本机存储后重试');
      error.code = 'LOCAL_STORAGE_ERROR';
      throw error;
    }
  }
}
function definite(error) {
  return typeof error.code === 'string' && ['INVALID_INPUT', 'FORBIDDEN', 'NOT_IN_ROOM',
    'ROOM_NOT_FOUND', 'ROOM_FINISHED', 'FAN_EXCEEDS_MAX'].includes(error.code);
}
function unknown() {
  const error = new Error('给分结果待确认，请勿重复给分；恢复连接后会自动核对');
  error.code = 'SUBMISSION_UNCONFIRMED';
  return error;
}
function send(op) {
  if (inflight.has(op.clientId)) return inflight.get(op.clientId);
  op.lastAttemptAt = Date.now();
  op.attempts = (op.attempts || 0) + 1;
  savePending();
  const task = (async () => {
    try {
      let result;
      try { result = await callFunction('settleRound', op); }
      catch (error) {
        if (definite(error)) throw error;
        // 响应丢失时先核对原编号；未找到也只使用同一编号重试。
        const lookup = await callFunction('settleRound', { roomId: op.roomId, playerId: op.playerId,
          memberClientId: op.memberClientId, clientId: op.clientId, action: 'lookup' })
          .catch(() => { throw unknown(); });
        result = lookup.data ? lookup : await callFunction('settleRound', op);
      }
      pending.delete(op.clientId); savePending();
      return result;
    } catch (error) {
      if (definite(error)) { pending.delete(op.clientId); savePending(); throw error; }
      throw unknown();
    }
  })().finally(() => inflight.delete(op.clientId));
  inflight.set(op.clientId, task);
  return task;
}
function submitRound({ roomId, clientId, playerId, type, scoreChanges, input }) {
  const appStore = require('../stores/appStore');
  loadPending();
  const unresolved = [...pending.values()].find(op => op.roomId === roomId && op.memberClientId === appStore.clientId);
  if (unresolved && unresolved.clientId !== clientId) return Promise.reject(unknown());
  const op = unresolved || { roomId, clientId, playerId, type, scoreChanges, input, memberClientId: appStore.clientId };
  pending.set(clientId, op);
  try { savePending(true); } catch (error) {
    if (!unresolved) pending.delete(clientId);
    return Promise.reject(error);
  }
  return send(op);
}
async function reconcilePending(roomId, force = false) {
  const appStore = require('../stores/appStore');
  loadPending();
  const results = [];
  for (const op of pending.values()) {
    if (op.roomId !== roomId || op.memberClientId !== appStore.clientId ||
        inflight.has(op.clientId) || (!force && (op.attempts >= 8 || Date.now() - (op.lastAttemptAt || 0) < Math.min(300000, 10000 * Math.pow(2, (op.attempts || 1) - 1))))) continue;
    try { results.push(await send(op)); } catch (_) {}
  }
  return results;
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

function hasPending(roomId) {
  loadPending();
  const owner = require('../stores/appStore').clientId;
  return [...pending.values()].some(op => op.roomId === roomId && op.memberClientId === owner);
}
module.exports = { submitRound, reconcilePending, hasPending, getRounds, watchRounds };
