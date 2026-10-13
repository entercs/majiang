const cloud = require('wx-server-sdk');
const { createHash } = require('crypto');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
// 文档不存在时返回 null，支持事务中的首次创建与旧记录兼容。
const db = cloud.database({ throwOnNotFound: false });
const { calculateRound } = require('./_shared/scoreService');
const { ownsPlayer, getAll } = require('./_shared/roomLifecycle');

function invalid(message) { return { code: 'INVALID_INPUT', message }; }

exports.main = async (event) => {
  const { OPENID: openid } = cloud.getWXContext();
  // clientId 是本次操作的幂等键，memberClientId 才是旧设备身份。
  const { roomId, clientId, memberClientId, playerId, type, scoreChanges, input } = event;
  if (!openid || typeof roomId !== 'string' || !roomId || typeof clientId !== 'string' ||
      !clientId || clientId.length > 128 || !['manual', 'auto'].includes(type)) {
    return invalid('房间、操作编号或计分类型无效');
  }
  const players = await getAll(db.collection('players').where({ roomId }).orderBy('_id', 'asc'));
  const caller = players.find(p => (!playerId || p._id === playerId) && ownsPlayer(p, openid, memberClientId));
  if (!caller) return { code: 'FORBIDDEN', message: '只能以自己的身份记分，请重新加入房间' };
  // 兼容旧版本随机 _id 的已提交记录。
  const existing = await db.collection('rounds').where({ roomId, clientId }).limit(1).get();
  if (existing.data.length) {
    return existing.data[0].createdBy === caller._id
      ? { code: 'OK', data: existing.data[0] }
      : { code: 'FORBIDDEN', message: '操作编号已被其他玩家使用' };
  }
  // 旧房间首次迁移时用已有最大序号作为种子；并发后由房间事务计数器分配。
  const last = await db.collection('rounds').where({ roomId }).orderBy('roundIndex', 'desc').limit(1).get();
  const seed = last.data.length ? last.data[0].roundIndex : 0;
  const roundId = createHash('sha256').update(JSON.stringify([roomId, clientId])).digest('hex').slice(0, 32);
  return db.runTransaction(async transaction => {
    const roomRef = transaction.collection('rooms').doc(roomId);
    const room = (await roomRef.get()).data;
    if (!room) return { code: 'ROOM_NOT_FOUND', message: '房间不存在' };
    const callerRef = transaction.collection('players').doc(caller._id);
    const currentCaller = (await callerRef.get()).data;
    if (!ownsPlayer(currentCaller, openid, memberClientId) || currentCaller.roomId !== roomId) {
      return { code: 'FORBIDDEN', message: '玩家身份已变更' };
    }
    const roundRef = transaction.collection('rounds').doc(roundId);
    const saved = (await roundRef.get()).data;
    if (saved) return saved.createdBy === caller._id
      ? { code: 'OK', data: saved } : { code: 'FORBIDDEN', message: '操作编号冲突' };
    if (room.status !== 'active') return { code: 'ROOM_FINISHED', message: '本局已结束' };
    let changes = scoreChanges;
    let autoFields = {};
    if (type === 'auto') {
      if (!input || !Number.isSafeInteger(input.fan) || input.fan < 0 || input.fan > 100 ||
          !players.some(p => p._id === input.winnerId) ||
          (input.loserId && !players.some(p => p._id === input.loserId))) return invalid('辅助计分参数无效');
      const rule = (await transaction.collection('rules').doc(room.ruleId).get()).data;
      if (!rule) return invalid('规则不存在');
      if (rule.allowDianpao === false && input.loserId &&
          !['zimo', 'gangshanghua', 'haidilao', 'tianhu', 'dihu'].includes(input.winType)) return invalid('当前规则不允许点炮');
      const result = calculateRound(rule, input, players);
      if (!result.isBalanced) return invalid('分数计算不平衡');
      changes = result.scoreChanges;
      autoFields = { winnerId: input.winnerId, winType: input.winType, fan: input.fan,
        gangEvents: input.gangEvents || [], breakdown: result.breakdown };
    }
    if (!changes || typeof changes !== 'object' || Array.isArray(changes) || !Object.keys(changes).length) {
      return invalid('分数必须是非空对象');
    }
    const ids = new Set(players.map(p => p._id));
    let sum = 0;
    for (const [pid, delta] of Object.entries(changes)) {
      if (!ids.has(pid) || !Number.isSafeInteger(delta)) return invalid('玩家或分数无效，分数必须是安全整数');
      if (delta < 0 && pid !== caller._id) return { code: 'FORBIDDEN', message: '只能扣自己的分数' };
      sum += delta;
      if (!Number.isSafeInteger(sum)) return invalid('分数过大');
    }
    if (sum !== 0 || !(changes[caller._id] < 0)) return invalid('分数必须守恒，且由给分者提交');
    const now = Date.now();
    const roundDoc = { roomId, roundIndex: Math.max(room.roundCount || 0, seed) + 1,
      type, scoreChanges: changes, clientId, createdBy: caller._id, createdAt: now, ...autoFields };
    await roundRef.set({ data: roundDoc });
    await callerRef.update({ data: { openid, lastSeenAt: now, isOnline: true } });
    await roomRef.update({ data: { roundCount: roundDoc.roundIndex, lastActivityAt: now,
      presenceAt: now, emptyAt: db.command.remove() } });
    return { code: 'OK', data: { ...roundDoc, _id: roundId } };
  });
};
