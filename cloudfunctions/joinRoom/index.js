const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;
const { ROOM_STATUS } = require('./_shared/constants');

const MAX_JOINED_ROOMS = 10;  // 与 createRoom 一致

async function _deleteOldestPlayers(clientId, count) {
  const oldestRes = await db.collection('players')
    .where({ clientId })
    .orderBy('joinedAt', 'asc')
    .limit(count)
    .get();
  let deleted = 0;
  for (const p of oldestRes.data) {
    try {
      await db.collection('players').doc(p._id).remove();
      deleted++;
    } catch (e) {
      console.error('remove player failed', p._id, e.message);
    }
  }
  return deleted;
}

/**
 * 加入或重入房间
 * 入参: { roomCode, nickname, avatarIndex, clientId }
 *
 * 优先级：
 *  1) 按 clientId 查旧 player（重入）→ 激活 isOnline，更新昵称/头像
 *  2) 按 openid 查旧 player（兜底）→ 激活 isOnline
 *  3) 都没有 → 创建新 player
 */
exports.main = async (event) => {
  const { openid } = cloud.getWXContext();
  const { roomCode, nickname, avatarIndex, clientId } = event;

  if (typeof roomCode !== 'string' || !/^\d{6}$/.test(roomCode)) {
    return { code: 'INVALID_INPUT', message: '房间号格式错误', detail: 'roomCode' };
  }
  if (typeof nickname !== 'string' || nickname.trim().length === 0 || nickname.length > 8) {
    return { code: 'INVALID_INPUT', message: '昵称长度 1-8', detail: 'nickname' };
  }
  if (!Number.isInteger(avatarIndex) || avatarIndex < 0 || avatarIndex > 7) {
    return { code: 'INVALID_INPUT', message: '头像序号 0-7', detail: 'avatarIndex' };
  }

  // 0. 反滥用：累计加入房间数（仅对"新加入"生效——重入不计）
  // 放在房间校验前可以挡住纯恶意
  if (clientId) {
    let joinedRes = await db.collection('players').where({ clientId }).count();
    while (joinedRes.total >= MAX_JOINED_ROOMS) {
      const deleted = await _deleteOldestPlayers(clientId, joinedRes.total - MAX_JOINED_ROOMS + 1);
      if (deleted === 0) break;
      joinedRes = await db.collection('players').where({ clientId }).count();
    }
  }

  // 1. 找房间
  const roomRes = await db.collection('rooms').where({ roomCode }).limit(1).get();
  if (roomRes.data.length === 0) {
    return { code: 'ROOM_NOT_FOUND', message: '房间号不存在' };
  }
  const room = roomRes.data[0];

  if (room.status !== ROOM_STATUS.ACTIVE) {
    return { code: 'ROOM_FINISHED', message: '本局已结束' };
  }

  const now = Date.now();

  // 2. 优先按 clientId 重入
  if (clientId) {
    const existing = await db.collection('players')
      .where({ roomId: room._id, clientId })
      .limit(1)
      .get();
    if (existing.data.length > 0) {
      const p = existing.data[0];
      // 激活 + 同步昵称头像
      await db.collection('players').doc(p._id).update({
        data: {
          isOnline: true,
          lastSeenAt: now,
          nickname: nickname.trim(),
          avatarIndex,
        },
      });
      // 旧 player 不在 playerIds 时补回
      if (!room.playerIds || !room.playerIds.includes(p._id)) {
        await db.collection('rooms').doc(room._id).update({
          data: { playerIds: _.push(p._id) },
        });
      }
      return {
        code: 'OK',
        data: { roomId: room._id, playerId: p._id, ruleId: room.ruleId, isRejoin: true },
      };
    }
  }

  // 3. 兜底：按 openid 查旧 player（微信登录用户）
  if (openid) {
    const existing = await db.collection('players')
      .where({ roomId: room._id, openid })
      .limit(1)
      .get();
    if (existing.data.length > 0) {
      const p = existing.data[0];
      await db.collection('players').doc(p._id).update({
        data: { isOnline: true, lastSeenAt: now },
      });
      return {
        code: 'OK',
        data: { roomId: room._id, playerId: p._id, ruleId: room.ruleId, isRejoin: true },
      };
    }
  }

  // 4. 创建新 player
  const playersRes = await db.collection('players').where({ roomId: room._id }).count();
  const seatIndex = playersRes.total;

  const playerRes = await db.collection('players').add({
    data: {
      roomId: room._id,
      nickname: nickname.trim(),
      avatarIndex,
      seatIndex,
      isOwner: false,
      openid: openid || null,
      clientId: clientId || null,
      joinedAt: now,
      isOnline: true,
      lastSeenAt: now,
    },
  });

  // 5. 更新 rooms.playerIds
  await db.collection('rooms').doc(room._id).update({
    data: { playerIds: _.push(playerRes._id) },
  });

  return {
    code: 'OK',
    data: { roomId: room._id, playerId: playerRes._id, ruleId: room.ruleId, isRejoin: false, seatIndex },
  };
};
