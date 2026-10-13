const cloud = require('wx-server-sdk');
const { createHash } = require('crypto');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
// 文档不存在时返回 null，支持事务中的首次创建与旧记录兼容。
const db = cloud.database({ throwOnNotFound: false });
const { ownsPlayer, getAll } = require('./_shared/roomLifecycle');
const NAMES = ['东风', '南风', '西风', '北风', '红中', '白板', '发财'];

exports.main = async (event) => {
  const { OPENID: openid } = cloud.getWXContext();
  const { roomCode, nickname = '', avatarIndex, clientId, nicknameAuto } = event;
  if (!openid || typeof clientId !== 'string' || !clientId ||
      typeof roomCode !== 'string' || !/^\d{6}$/.test(roomCode) ||
      typeof nickname !== 'string' || nickname.length > 8 ||
      (nicknameAuto === false && !nickname.trim()) ||
      !Number.isInteger(avatarIndex) || avatarIndex < 0 || avatarIndex > 6) {
    return { code: 'INVALID_INPUT', message: '房间号或玩家信息无效' };
  }
  const found = await db.collection('rooms').where({ roomCode }).limit(1).get();
  if (!found.data.length) return { code: 'ROOM_NOT_FOUND', message: '房间号不存在' };
  const roomId = found.data[0]._id;
  const players = await getAll(db.collection('players').where({ roomId }).orderBy('_id', 'asc'));
  const old = players.find(p => p.openid === openid) ||
    players.find(p => !p.openid && ownsPlayer(p, openid, clientId));
  const playerId = old ? old._id : createHash('sha256').update(JSON.stringify([roomId, openid]))
    .digest('hex').slice(0, 32);
  return db.runTransaction(async transaction => {
    const roomRef = transaction.collection('rooms').doc(roomId);
    const room = (await roomRef.get()).data;
    if (!room || room.status !== 'active') return { code: 'ROOM_FINISHED', message: '本局已结束' };
    const playerRef = transaction.collection('players').doc(playerId);
    const current = (await playerRef.get()).data;
    if (current && !ownsPlayer(current, openid, clientId)) return { code: 'FORBIDDEN', message: '玩家身份不匹配' };
    const ids = [...new Set([...(room.playerIds || []), ...players.map(p => p._id)])];
    const occupied = new Set();
    for (const id of ids) {
      const p = (await transaction.collection('players').doc(id).get()).data;
      if (p && id !== playerId) occupied.add(p.avatarIndex);
    }
    let assignedAvatar = current ? current.avatarIndex : avatarIndex;
    if (!current || nicknameAuto === false) {
      assignedAvatar = avatarIndex;
      if (occupied.has(assignedAvatar)) {
        const free = NAMES.findIndex((_, index) => !occupied.has(index));
        if (free >= 0) assignedAvatar = free;
      }
    }
    const now = Date.now();
    const data = { roomId, openid, clientId, isOnline: true, lastSeenAt: now, joinedAt: now,
      avatarIndex: assignedAvatar,
      nickname: nicknameAuto === false ? nickname.trim() : current ? current.nickname : NAMES[assignedAvatar] };
    if (current) await playerRef.update({ data });
    else await playerRef.set({ data: { ...data, isOwner: false, seatIndex: ids.length } });
    await roomRef.update({ data: { playerIds: [...new Set([...ids, playerId])],
      presenceAt: now, emptyAt: db.command.remove() } });
    return { code: 'OK', data: { roomId, playerId, ruleId: room.ruleId,
      isRejoin: !!current, seatIndex: current ? current.seatIndex : ids.length } };
  });
};
