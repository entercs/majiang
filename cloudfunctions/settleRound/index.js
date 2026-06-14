const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const { calculateRound } = require('./_shared/scoreService');
const { WIN_TYPE } = require('./_shared/constants');

exports.main = async (event) => {
  const { openid } = cloud.getWXContext();
  const { roomId, clientId, playerId, type, scoreChanges, input } = event;

  if (!roomId || !clientId || !type) {
    return { code: 'INVALID_INPUT', message: '参数缺失', detail: 'roomId/clientId/type' };
  }

  // 1. 幂等检查
  const existing = await db.collection('rounds').where({ roomId, clientId }).limit(1).get();
  if (existing.data.length > 0) {
    return { code: 'OK', data: existing.data[0] };
  }

  // 2. 拿房间
  const roomRes = await db.collection('rooms').doc(roomId).get();
  if (!roomRes.data) return { code: 'ROOM_NOT_FOUND', message: '房间不存在' };
  if (roomRes.data.status !== 'active') return { code: 'ROOM_FINISHED', message: '本局已结束' };

  // 3. 拿规则（manual 模式也拿，用于兼容保留）
  const ruleRes = await db.collection('rules').doc(roomRes.data.ruleId).get();
  if (!ruleRes.data) return { code: 'INVALID_INPUT', message: '规则不存在' };
  const rule = ruleRes.data;

  // 4. 拿玩家
  const playersRes = await db.collection('players').where({ roomId }).get();
  const players = playersRes.data;
  const playerIds = new Set(players.map(p => p._id));

  // 5. 按 type 分支
  let finalScoreChanges = {};
  let winnerId = null;
  let winType = null;
  let fan = 0;
  let gangEvents = [];
  let breakdown = null;
  let createdBy = openid || 'anonymous';

  if (type === 'manual') {
    // ========== Manual 模式：互相手动给分 ==========
    if (!scoreChanges || typeof scoreChanges !== 'object') {
      return { code: 'INVALID_INPUT', message: 'scoreChanges 必须是非空对象' };
    }
    // 守恒校验
    const sum = Object.values(scoreChanges).reduce((a, b) => a + Number(b || 0), 0);
    if (sum !== 0) {
      return { code: 'INVALID_INPUT', message: `分数不平衡（总和 ${sum}，应为 0）` };
    }
    // 玩家存在性校验
    for (const pid of Object.keys(scoreChanges)) {
      if (!playerIds.has(pid)) {
        return { code: 'INVALID_INPUT', message: `玩家 ${pid} 不在房间中` };
      }
    }
    // 玩家必须非空
    if (players.length === 0) {
      return { code: 'INVALID_INPUT', message: '房间内还没有玩家' };
    }
    finalScoreChanges = scoreChanges;
    // createdBy 标记为分数操作者（取 scoreChanges 中减分最多的人）
    let minDelta = 0;
    let operatorId = null;
    for (const [pid, delta] of Object.entries(scoreChanges)) {
      if (delta < minDelta) {
        minDelta = delta;
        operatorId = pid;
      }
    }
    if (operatorId) createdBy = operatorId;

  } else if (type === 'auto') {
    // ========== Auto 模式：辅助算分（沿用 v1 逻辑但去 4 人限制）==========
    if (!input) return { code: 'INVALID_INPUT', message: 'input 参数缺失' };
    const { winnerId: w, winType: t, fan: f, gangEvents: g = [], maResults: m = [] } = input;

    const winner = players.find(p => p._id === w);
    if (!winner) return { code: 'INVALID_INPUT', message: '胡牌者不在房间中' };
    if (input.loserId) {
      const loser = players.find(p => p._id === input.loserId);
      if (!loser) return { code: 'INVALID_INPUT', message: '点炮者不在房间中' };
    }
    if (!Number.isInteger(f) || f < 0) {
      return { code: 'INVALID_INPUT', message: '番数必须是非负整数' };
    }
    if (f > 100) {
      return { code: 'FAN_EXCEEDS_MAX', message: '番数过大' };
    }
    if (rule.allowDianpao === false && input.loserId && !['zimo', 'gangshanghua', 'haidilao', 'tianhu', 'dihu'].includes(t)) {
      return { code: 'INVALID_INPUT', message: '当前规则不允许点炮' };
    }

    // 调用 scoreService（不强求 4 人）
    const { scoreChanges: sc, breakdown: br, isBalanced } = calculateRound(rule, input, players);
    if (!isBalanced) {
      return { code: 'INTERNAL_ERROR', message: '分数计算不平衡' };
    }

    // 辅助算分：提交者必须是"给分者"（每人只能控制自己的扣分）
    // 自摸：3 个非胡牌者任一可提交（他们都得扣分）
    // 点炮：必须是点炮者（loserId 对应的玩家）
    // 优先按 playerId 找（前端传过来），兜底按 clientId
    const caller = players.find(p => p._id === playerId)
      || players.find(p => p.clientId === clientId);
    if (!caller) {
      return { code: 'FORBIDDEN', message: '你不在该房间中' };
    }
    const callerDelta = sc[caller._id] || 0;
    if (callerDelta >= 0) {
      return { code: 'FORBIDDEN', message: '只能算自己给别人多少分，无法应用' };
    }

    finalScoreChanges = sc;
    winnerId = w;
    winType = t;
    fan = f;
    gangEvents = g;
    breakdown = br;
  } else {
    return { code: 'INVALID_INPUT', message: 'type 必须是 manual 或 auto' };
  }

  // 6. 分配 roundIndex（服务端）
  const lastRound = await db.collection('rounds').where({ roomId }).orderBy('roundIndex', 'desc').limit(1).get();
  const roundIndex = lastRound.data.length > 0 ? lastRound.data[0].roundIndex + 1 : 1;

  // 7. 写入
  const roundDoc = {
    roomId,
    roundIndex,
    type,
    scoreChanges: finalScoreChanges,
    clientId,
    createdBy,
    createdAt: Date.now(),
  };
  if (type === 'auto') {
    roundDoc.winnerId = winnerId;
    roundDoc.winType = winType;
    roundDoc.fan = fan;
    roundDoc.gangEvents = gangEvents;
    roundDoc.breakdown = breakdown;
  }

  const addRes = await db.collection('rounds').add({ data: roundDoc });
  roundDoc._id = addRes._id;

  // 8. 刷新房间 lastActivityAt（给 autoCloseTimeout 30 分钟检查提供准确时间戳）
  await db.collection('rooms').doc(roomId).update({
    data: { lastActivityAt: roundDoc.createdAt },
  });

  return { code: 'OK', data: roundDoc };
};
