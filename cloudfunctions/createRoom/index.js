const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

const { generateUniqueRoomCode } = require('./_shared/cloud-id');
const { getDefaultRule } = require('./_shared/ruleService');
const { ROOM_STATUS } = require('./_shared/constants');

exports.main = async (event, context) => {
  const { openid } = cloud.getWXContext();
  const { nickname = '玩家', avatarIndex = 0, clientId } = event;

  // 1. Validate nickname and avatar
  if (typeof nickname !== 'string' || nickname.trim().length === 0 || nickname.length > 8) {
    return { code: 'INVALID_INPUT', message: '昵称长度 1-8', detail: 'nickname' };
  }
  if (!Number.isInteger(avatarIndex) || avatarIndex < 0 || avatarIndex > 7) {
    return { code: 'INVALID_INPUT', message: '头像序号 0-7', detail: 'avatarIndex' };
  }

  // 2. Generate unique 6-digit room code
  const roomCode = await generateUniqueRoomCode(async (code) => {
    const res = await db.collection('rooms').where({ roomCode: code }).count();
    return res.total > 0;
  });

  try {
    // 3. Create default rule
    const ruleRes = await db.collection('rules').add({
      data: { ...getDefaultRule(), roomId: 'pending', createdAt: Date.now() }
    });
    const ruleId = ruleRes._id;
    await db.collection('rules').doc(ruleId).update({ data: { roomId: ruleId } });

    // 4. Create room
    const roomRes = await db.collection('rooms').add({
      data: {
        roomCode,
        ownerId: openid,
        status: ROOM_STATUS.ACTIVE,
        ruleId,
        playerIds: [],
        createdAt: Date.now(),
      }
    });
    const roomId = roomRes._id;

    // 5. Create player (owner)
    const playerRes = await db.collection('players').add({
      data: {
        roomId,
        nickname: nickname.trim(),
        avatarIndex,
        seatIndex: 0, // dealer seat
        isOwner: true,
        openid: openid || null,
        clientId: clientId || null,
        joinedAt: Date.now(),
        isOnline: true,
        lastSeenAt: Date.now(),
      }
    });

    // 6. Update room's playerIds
    await db.collection('rooms').doc(roomId).update({
      data: { playerIds: [playerRes._id] }
    });

    return {
      code: 'OK',
      data: { roomId, roomCode, playerId: playerRes._id, ruleId }
    };
  } catch (err) {
    console.error('createRoom error:', err);
    return { code: 'INTERNAL_ERROR', message: err.message };
  }
};
