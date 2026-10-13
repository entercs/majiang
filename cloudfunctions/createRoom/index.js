const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
// 文档不存在时返回 null，支持事务中的首次创建与旧记录兼容。
const db = cloud.database({ throwOnNotFound: false });
const { randomBytes, createHash } = require('crypto');

const { generateUniqueRoomCode } = require('./_shared/cloud-id');
const { getDefaultRule } = require('./_shared/ruleService');
const { ROOM_STATUS } = require('./_shared/constants');
const { generateRoomQRCode } = require('./_shared/qrCodeService');

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

  // 创建频率限制，保留历史玩家和战绩。
  if (clientId) {
    // 10s 内只能 1 次
    const recentRes = await db.collection('players')
      .where({ clientId, isOwner: true })
      .orderBy('joinedAt', 'desc')
      .limit(1)
      .get();
    if (recentRes.data.length > 0) {
      const lastCreateAt = recentRes.data[0].joinedAt;
      if (Date.now() - lastCreateAt < RATE_LIMIT_MS) {
        const wait = Math.ceil((RATE_LIMIT_MS - (Date.now() - lastCreateAt)) / 1000);
        return { code: 'RATE_LIMIT', message: `操作太频繁，请 ${wait} 秒后再试`, detail: 'createRoom' };
      }
    }

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
        await transaction.collection('rules').doc(ruleId).set({ data: { ...defaultRule, roomId, createdAt: now } });
        await transaction.collection('players').doc(playerId).set({ data: {
          roomId, nickname: assignedNickname, avatarIndex: assignedAvatar, seatIndex: 0,
          isOwner: true, openid, clientId, joinedAt: now, isOnline: true, lastSeenAt: now,
        } });
        await roomRef.set({ data: { roomCode, ownerId: openid, status: ROOM_STATUS.ACTIVE,
          ruleId, playerIds: [playerId], createdAt: now, presenceAt: now, roundCount: 0 } });
        return true;
      });
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
