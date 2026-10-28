const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
// 文档不存在时返回 null，支持事务中的首次创建与旧记录兼容。
const db = cloud.database({ throwOnNotFound: false });
const { randomBytes, createHash } = require('crypto');

const { generateUniqueRoomCode } = require('./_shared/cloud-id');
const { getDefaultRule } = require('./_shared/ruleService');
const { ROOM_STATUS } = require('./_shared/constants');
const { generateRoomQRCode } = require('./_shared/qrCodeService');

const { subscribers, writeFeed, policy, CHECK_DELAY_MS } = require('./_shared/roomSync');

const RATE_LIMIT_MS = 10 * 1000;        // 同一 clientId 10s 内只能创建 1 次
exports.main = async (event, context) => {
  const { OPENID: openid } = cloud.getWXContext();
  const { nickname = '玩家', avatarIndex = 0, clientId, baseScore = 1, nicknameAuto } = event;

  if (!openid || typeof clientId !== 'string' || !clientId) return { code: 'INVALID_INPUT', message: '身份缺失' };
  if (!Number.isSafeInteger(baseScore) || baseScore < 1) return { code: 'INVALID_INPUT', message: '底分须为正整数' };

  // 1. Validate
  if (!Number.isInteger(avatarIndex) || avatarIndex < 0 || avatarIndex > 6) {
    return { code: 'INVALID_INPUT', message: '头像序号 0-6', detail: 'avatarIndex' };
  }

  // 若用户手动设置过昵称，固定用传入的；否则随机分配
  const NAMES = ['东风', '南风', '西风', '北风', '红中', '白板', '发财'];
  const isManual = nicknameAuto === false;

  // 手动模式才校验昵称（自动模式会用系统名覆盖）
  if (isManual) {
    if (typeof nickname !== 'string' || nickname.trim().length === 0 || nickname.length > 8) {
      return { code: 'INVALID_INPUT', message: '昵称长度 1-8', detail: 'nickname' };
    }
  }
  const assignedAvatar = isManual ? avatarIndex : Math.floor(Math.random() * 7);
  const assignedNickname = isManual ? nickname.trim() : NAMES[assignedAvatar];

  const limitId = 'create_' + createHash('sha256').update(openid).digest('hex').slice(0, 32);
  const lastLimit = (await db.collection('requestLimits').doc(limitId).get()).data;
  if (lastLimit && Date.now() - lastLimit.createdAt < RATE_LIMIT_MS) {
    return { code: 'RATE_LIMIT', message: '操作太频繁，请稍后再创建' };
  }

  try {
    const defaultRule = { ...getDefaultRule(), baseScore };
    for (let attempt = 0; attempt < 10; attempt++) {
      const roomCode = await generateUniqueRoomCode(async code =>
        (await db.collection('rooms').where({ roomCode: code }).count()).total > 0);
      // 固定 ID 使并发抽到同一房号时发生事务冲突，而不是生成两个同号房间。
      const roomId = 'room_' + roomCode;
      const ruleId = randomBytes(16).toString('hex');
      const playerId = createHash('sha256').update(JSON.stringify([roomId, openid])).digest('hex').slice(0, 32);
      const created = await db.runTransaction(async transaction => {
        const roomRef = transaction.collection('rooms').doc(roomId);
        if ((await roomRef.get()).data) return false;
        const now = Date.now();
        const limitRef = transaction.collection('requestLimits').doc(limitId);
        const limit = (await limitRef.get()).data;
        if (limit && now - limit.createdAt < RATE_LIMIT_MS) return 'limited';
        await limitRef.set({ data: { createdAt: now } });
        await transaction.collection('rules').doc(ruleId).set({ data: { ...defaultRule, roomId, createdAt: now } });
        await transaction.collection('players').doc(playerId).set({ data: {
          roomId, nickname: assignedNickname, avatarIndex: assignedAvatar, seatIndex: 0,
          isOwner: true, openid, clientId, joinedAt: now, isOnline: true, lastSeenAt: now,
        } });
        await roomRef.set({ data: { roomCode, ownerId: openid, status: ROOM_STATUS.ACTIVE,
          ruleId, playerIds: [playerId], createdAt: now, presenceAt: now, roundCount: 0,
          ledgerSchema: 1, totalsThroughIndex: 0, ledgerEntryCount: 0, scoreTotals: { [playerId]: 0 }, revision: 1, nextCheckAt: now + CHECK_DELAY_MS,
          subscribers: [{ playerId, openid }] } });
        if (policy().mode === 'watch') await writeFeed(transaction, roomId, { revision: 1, roundCount: 0, status: 'active' }, { playerId, openid });
        return true;
      });
      if (created === 'limited') return { code: 'RATE_LIMIT', message: '操作太频繁，请稍后再创建' };
      if (!created) continue;
      const qrCodeFileID = await generateRoomQRCode(roomId, roomCode);
      return { code: 'OK', data: { roomId, roomCode, playerId, ruleId, qrCodeFileID } };
    }
    return { code: 'INTERNAL_ERROR', message: '生成房间号失败，请重试' };
  } catch (err) {
    console.error('createRoom error:', err);
    return { code: 'INTERNAL_ERROR', message: '创建失败，请稍后重试' };
  }
};
