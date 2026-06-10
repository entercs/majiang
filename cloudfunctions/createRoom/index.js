const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

const { generateUniqueRoomCode } = require('./_shared/cloud-id');
const { getDefaultRule } = require('./_shared/ruleService');
const { ROOM_STATUS } = require('./_shared/constants');

const RATE_LIMIT_MS = 30 * 1000;        // 同一 clientId 30s 内只能创建 1 次
const MAX_ACTIVE_ROOMS = 10;            // 同一 clientId 最多 10 个 active 房间
const MAX_JOINED_ROOMS = 100;           // 同一 clientId 最多累计加入 100 个房间

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

  // 2. 反滥用检查（仅在有 clientId 时）
  if (clientId) {
    // 2a. 频率：最近 30s 内是否建过房
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
    // 2b. 累计加入房间数
    const joinedRes = await db.collection('players').where({ clientId }).count();
    if (joinedRes.total >= MAX_JOINED_ROOMS) {
      return { code: 'TOO_MANY_JOINED_ROOMS', message: `你已加入 ${joinedRes.total} 个房间，达到上限（${MAX_JOINED_ROOMS}）` };
    }
    // 2c. 活跃房间数：clientId 拥有的所有 player 记录，对应 room.status=active 且 isOnline=true
    const myPlayersRes = await db.collection('players').where({ clientId }).get();
    const myRoomIds = [...new Set(myPlayersRes.data.map(p => p.roomId))];
    let activeCount = 0;
    if (myRoomIds.length > 0) {
      const myRoomsRes = await db.collection('rooms')
        .where({ _id: _.in(myRoomIds), status: ROOM_STATUS.ACTIVE })
        .get();
      // 仅算"我在线"（isOnline=true）的那些房
      const myOnlineRoomIds = new Set(myPlayersRes.data.filter(p => p.isOnline).map(p => p.roomId));
      activeCount = myRoomsRes.data.filter(r => myOnlineRoomIds.has(r._id)).length;
    }
    if (activeCount >= MAX_ACTIVE_ROOMS) {
      return { code: 'TOO_MANY_ACTIVE_ROOMS', message: `你在 ${activeCount} 个房间进行中，达到上限（${MAX_ACTIVE_ROOMS}）` };
    }
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
