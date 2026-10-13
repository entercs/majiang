const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
// 文档不存在时返回 null，支持事务中的首次创建与旧记录兼容。
const db = cloud.database({ throwOnNotFound: false });
const { getAll, ownsPlayer, isOnline } = require('./_shared/roomLifecycle');
const PAGE_SIZE = 100;

exports.main = async (event) => {
  const { OPENID: openid } = cloud.getWXContext();
  const { roomId, memberClientId, heartbeat = false, offset = 0, throughRoundIndex } = event;
  if (!openid || !roomId || !Number.isSafeInteger(offset) || offset < 0 ||
      (throughRoundIndex != null && (!Number.isSafeInteger(throughRoundIndex) || throughRoundIndex < 0))) {
    return { code: 'INVALID_INPUT', message: '房间或分页参数无效' };
  }
  const players = await getAll(db.collection('players').where({ roomId }).orderBy('_id', 'asc'));
  const me = players.find(p => ownsPlayer(p, openid, memberClientId));
  if (!me) return { code: 'NOT_IN_ROOM', message: '你不在该房间中，请重新加入' };
  let room = (await db.collection('rooms').doc(roomId).get()).data;
  if (!room) return { code: 'ROOM_NOT_FOUND', message: '房间不存在' };
  const now = Date.now();
  if (heartbeat && offset === 0) {
    room = await db.runTransaction(async transaction => {
      const roomRef = transaction.collection('rooms').doc(roomId);
      const currentRoom = (await roomRef.get()).data;
      const playerRef = transaction.collection('players').doc(me._id);
      const currentPlayer = (await playerRef.get()).data;
      if (!ownsPlayer(currentPlayer, openid, memberClientId)) throw new Error('玩家身份已变更');
      if (!currentRoom) throw new Error('房间不存在');
      if (currentRoom.status === 'active') {
        await playerRef.update({ data: { openid, isOnline: true, lastSeenAt: now } });
        await roomRef.update({ data: { presenceAt: now, emptyAt: db.command.remove() } });
        me.isOnline = true;
        me.lastSeenAt = now;
      }
      return currentRoom;
    });
  }
  let upper = throughRoundIndex;
  if (upper == null) {
    const last = await db.collection('rounds').where({ roomId }).orderBy('roundIndex', 'desc').limit(1).get();
    upper = last.data.length ? last.data[0].roundIndex : 0;
  }
  const rounds = (await db.collection('rounds').where({ roomId, roundIndex: db.command.lte(upper) })
    .orderBy('roundIndex', 'asc').orderBy('_id', 'asc').skip(offset).limit(PAGE_SIZE).get()).data;
  const rule = offset === 0 ? (await db.collection('rules').doc(room.ruleId).get()).data : null;
  return { code: 'OK', data: {
    room: { _id: room._id, roomCode: room.roomCode, status: room.status, qrCodeFileID: room.qrCodeFileID || '' },
    currentPlayerId: me._id,
    players: offset === 0 ? players.map(({ openid: ignoredOpenid, clientId, ...p }) =>
      ({ ...p, isOnline: isOnline(p, now) })) : [],
    rule, rounds, throughRoundIndex: upper,
    nextOffset: rounds.length === PAGE_SIZE ? offset + PAGE_SIZE : null,
  } };
};
