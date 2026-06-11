const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

const { generateUniqueRoomCode } = require('./_shared/cloud-id');
const { getDefaultRule } = require('./_shared/ruleService');
const { ROOM_STATUS } = require('./_shared/constants');

const RATE_LIMIT_MS = 30 * 1000;        // 同一 clientId 30s 内只能创建 1 次
const MAX_ACTIVE_ROOMS = 3;             // 同一 clientId 最多 3 个 active 房间
const MAX_JOINED_ROOMS = 10;            // 同一 clientId 最多累计 10 个房间

/**
 * 删除指定 clientId 的"最旧" player 记录（按 joinedAt 升序）
 * 返回被删除的 player 数量
 */
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

exports.main = async (event, context) => {
  const { openid } = cloud.getWXContext();
  const { nickname = '玩家', avatarIndex = 0, clientId, baseScore = 1 } = event;

  // 1. Validate
  if (typeof nickname !== 'string' || nickname.trim().length === 0 || nickname.length > 8) {
    return { code: 'INVALID_INPUT', message: '昵称长度 1-8', detail: 'nickname' };
  }
  if (!Number.isInteger(avatarIndex) || avatarIndex < 0 || avatarIndex > 7) {
    return { code: 'INVALID_INPUT', message: '头像序号 0-7', detail: 'avatarIndex' };
  }

  // 2. 反滥用 + 自动清理（仅在有 clientId 时）
  if (clientId) {
    // 2a. 频率：30s 内只能 1 次
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

    // 2b. 累计房间数：超 10 → 自动删最旧的，让出名额
    let joinedRes = await db.collection('players').where({ clientId }).count();
    while (joinedRes.total >= MAX_JOINED_ROOMS) {
      const deleted = await _deleteOldestPlayers(clientId, joinedRes.total - MAX_JOINED_ROOMS + 1);
      if (deleted === 0) break;  // 安全兜底
      joinedRes = await db.collection('players').where({ clientId }).count();
    }

    // 2c. 活跃房间数（isOnline=true 且 room.status='active'）超 3 → 自动删最旧的
    const myPlayersRes = await db.collection('players').where({ clientId }).get();
    const myRoomIds = [...new Set(myPlayersRes.data.map(p => p.roomId))];
    let activeCount = 0;
    if (myRoomIds.length > 0) {
      const myRoomsRes = await db.collection('rooms')
        .where({ _id: _.in(myRoomIds), status: ROOM_STATUS.ACTIVE })
        .get();
      const myOnlineRoomIds = new Set(myPlayersRes.data.filter(p => p.isOnline).map(p => p.roomId));
      activeCount = myRoomsRes.data.filter(r => myOnlineRoomIds.has(r._id)).length;
    }
    while (activeCount >= MAX_ACTIVE_ROOMS) {
      // 删最旧的一条"在线" player 记录
      const oldestOnline = await db.collection('players')
        .where({ clientId, isOnline: true })
        .orderBy('joinedAt', 'asc')
        .limit(1)
        .get();
      if (oldestOnline.data.length === 0) break;
      try {
        await db.collection('players').doc(oldestOnline.data[0]._id).remove();
      } catch (e) {
        console.error('remove player failed', e.message);
        break;
      }
      activeCount--;
    }
  }

  // 3. Generate unique 6-digit room code
  const roomCode = await generateUniqueRoomCode(async (code) => {
    const res = await db.collection('rooms').where({ roomCode: code }).count();
    return res.total > 0;
  });

  try {
    // 4. Create default rule
    const defaultRule = getDefaultRule();
    defaultRule.baseScore = Number(baseScore) || 1;
    const ruleRes = await db.collection('rules').add({
      data: { ...defaultRule, roomId: 'pending', createdAt: Date.now() }
    });
    const ruleId = ruleRes._id;
    await db.collection('rules').doc(ruleId).update({ data: { roomId: ruleId } });

    // 5. Create room
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

    // 6. Create player (owner)
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

    // 7. Update room's playerIds
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