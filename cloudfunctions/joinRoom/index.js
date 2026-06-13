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
  const { roomCode, nickname, avatarIndex, clientId, nicknameAuto } = event;
  console.log('【joinRoom】入参:', { roomCode, nickname, avatarIndex, nicknameAuto, clientId });

  if (typeof roomCode !== 'string' || !/^\d{6}$/.test(roomCode)) {
    return { code: 'INVALID_INPUT', message: '房间号格式错误', detail: 'roomCode' };
  }
  if (typeof nickname !== 'string' || nickname.trim().length === 0 || nickname.length > 8) {
    return { code: 'INVALID_INPUT', message: '昵称长度 1-8', detail: 'nickname' };
  }
  if (!Number.isInteger(avatarIndex) || avatarIndex < 0 || avatarIndex > 6) {
    return { code: 'INVALID_INPUT', message: '头像序号 0-6', detail: 'avatarIndex' };
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
      const updateData = {
        isOnline: true,
        lastSeenAt: now,
      };
      // 如果用户手动设置过昵称（nicknameAuto=false），同步过来；否则保持原昵称
      if (nicknameAuto === false) {
        updateData.nickname = nickname.trim();
        updateData.avatarIndex = avatarIndex;
        console.log('【joinRoom clientId重入-手动】更新 nickname:', nickname.trim(), 'avatarIndex:', avatarIndex);
      } else {
        console.log('【joinRoom clientId重入-自动】保持原昵称:', p.nickname);
      }
      await db.collection('players').doc(p._id).update({ data: updateData });
      // 旧 player 不在 playerIds 时补回
      if (!room.playerIds || !room.playerIds.includes(p._id)) {
        await db.collection('rooms').doc(room._id).update({
          data: { playerIds: _.push(p._id) },
        });
      }
      // 重新查询拿到最新数据（nickname 可能变了）
      const updated = await db.collection('players').doc(p._id).get();
      console.log('【joinRoom clientId重入】更新后 nickname:', updated.data.nickname);
      return {
        code: 'OK',
        data: { roomId: room._id, playerId: updated.data._id, ruleId: room.ruleId, isRejoin: true },
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
      const updateData = { isOnline: true, lastSeenAt: now };
      if (nicknameAuto === false) {
        updateData.nickname = nickname.trim();
        updateData.avatarIndex = avatarIndex;
      }
      await db.collection('players').doc(p._id).update({ data: updateData });
      const updated = await db.collection('players').doc(p._id).get();
      return {
        code: 'OK',
        data: { roomId: room._id, playerId: updated.data._id, ruleId: room.ruleId, isRejoin: true },
      };
    }
  }

  // 4. 创建新 player：分配该房间未占用的头像序号
  const existingPlayers = await db.collection('players')
    .where({ roomId: room._id })
    .field({ avatarIndex: true })
    .get();
  const occupiedSet = new Set(existingPlayers.data.map(p => p.avatarIndex));

  // 若 nicknameAuto=false（用户手动设置过昵称），昵称固定，头像取未占用
  // 若 nicknameAuto=true/undefined（自动昵称），头像昵称一起随机
  const isManualNickname = nicknameAuto === false;
  const NAMES = ['东风', '南风', '西风', '北风', '红中', '白板', '发财'];
  let assignedAvatar = avatarIndex;
  let assignedNickname = nickname.trim();
  if (isManualNickname) {
    // 昵称固定，头像取未占用的
    if (occupiedSet.has(assignedAvatar)) {
      for (let i = 0; i <= 6; i++) {
        if (!occupiedSet.has(i)) { assignedAvatar = i; break; }
      }
    }
  } else {
    // 随机分配头像和昵称
    const freeNames = NAMES.filter((_, i) => !occupiedSet.has(i));
    if (freeNames.length > 0) {
      const pick = freeNames[Math.floor(Math.random() * freeNames.length)];
      assignedAvatar = NAMES.indexOf(pick);
      assignedNickname = pick;
    } else {
      assignedAvatar = (avatarIndex + 1) % 7;
      assignedNickname = NAMES[assignedAvatar];
    }
  }

  const playerRes = await db.collection('players').add({
    data: {
      roomId: room._id,
      nickname: assignedNickname,
      avatarIndex: assignedAvatar,
      seatIndex: existingPlayers.data.length,
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
    data: { roomId: room._id, playerId: playerRes._id, ruleId: room.ruleId, isRejoin: false, seatIndex: existingPlayers.data.length },
  };
};
