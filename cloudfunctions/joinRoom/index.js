const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;
const { ROOM_STATUS } = require('./_shared/constants');

exports.main = async (event) => {
  const { openid } = cloud.getWXContext();
  const { roomCode, nickname, avatarIndex } = event;

  if (typeof roomCode !== 'string' || !/^\d{6}$/.test(roomCode)) {
    return { code: 'INVALID_INPUT', message: '房间号格式错误', detail: 'roomCode' };
  }
  if (typeof nickname !== 'string' || nickname.trim().length === 0 || nickname.length > 8) {
    return { code: 'INVALID_INPUT', message: '昵称长度 1-8', detail: 'nickname' };
  }
  if (!Number.isInteger(avatarIndex) || avatarIndex < 0 || avatarIndex > 7) {
    return { code: 'INVALID_INPUT', message: '头像序号 0-7', detail: 'avatarIndex' };
  }

  // 1. Find room
  const roomRes = await db.collection('rooms').where({ roomCode }).limit(1).get();
  if (roomRes.data.length === 0) {
    return { code: 'ROOM_NOT_FOUND', message: '房间号不存在' };
  }
  const room = roomRes.data[0];

  if (room.status !== ROOM_STATUS.ACTIVE) {
    return { code: 'ROOM_FINISHED', message: '本局已结束' };
  }

  // 2. Check if already joined (by openid) — 必须在人数检查前，避免重入也被拒
  if (openid) {
    const existing = await db.collection('players').where({ roomId: room._id, openid }).limit(1).get();
    if (existing.data.length > 0) {
      return { code: 'OK', data: { roomId: room._id, playerId: existing.data[0]._id, ruleId: room.ruleId, rejoined: true } };
    }
  }

  // 3. 不限人数。座位号 = 当前人数（0-indexed 按加入顺序）
  const playersRes = await db.collection('players').where({ roomId: room._id }).count();
  const seatIndex = playersRes.total;

  // 4. Create player
  const playerRes = await db.collection('players').add({
    data: {
      roomId: room._id,
      nickname: nickname.trim(),
      avatarIndex,
      seatIndex,
      isOwner: false,
      openid: openid || null,
      joinedAt: Date.now(),
    }
  });

  // 5. Update room's playerIds
  await db.collection('rooms').doc(room._id).update({
    data: { playerIds: _.push(playerRes._id) }
  });

  return {
    code: 'OK',
    data: { roomId: room._id, playerId: playerRes._id, ruleId: room.ruleId, seatIndex }
  };
};
