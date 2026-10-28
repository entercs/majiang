const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
// 文档不存在时返回 null，支持事务中的首次创建与旧记录兼容。
const db = cloud.database({ throwOnNotFound: false });
const { getAll, ownsPlayer, isOnline } = require('./_shared/roomLifecycle');
const { ensureLedger, policy, writeFeed, CHECK_DELAY_MS } = require('./_shared/roomSync');
const PAGE_SIZE = 100;

exports.main = async (event) => {
  const { OPENID: openid } = cloud.getWXContext();
  const { roomId, memberClientId, heartbeat = false, offset = 0, throughRoundIndex } = event;
  if (!openid || !roomId || !Number.isSafeInteger(offset) || offset < 0 ||
      (throughRoundIndex != null && (!Number.isSafeInteger(throughRoundIndex) || throughRoundIndex < 0))) {
    return { code: 'INVALID_INPUT', message: '房间或分页参数无效' };
  }
  if (event.sinceRoundIndex != null && (!Number.isSafeInteger(event.sinceRoundIndex) || event.sinceRoundIndex < 0)) {
    return { code: 'INVALID_INPUT', message: '记录游标无效' };
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
      if (currentRoom.status === 'active' && (!currentPlayer.openid || !currentPlayer.isOnline || now - (currentPlayer.lastSeenAt || 0) >= policy().heartbeatMs - 5000)) {
        await playerRef.update({ data: { openid, isOnline: true, lastSeenAt: now } });
        await roomRef.update({ data: { presenceAt: now, nextCheckAt: now + CHECK_DELAY_MS, emptyAt: db.command.remove() } });
        me.isOnline = true;
        me.lastSeenAt = now;
      }
      return currentRoom;
    });
  }
  if (event.protocol === 2) {
    room = await ensureLedger(db, room);
    const upper = throughRoundIndex == null ? room.roundCount : throughRoundIndex;
    let rounds, nextOffset = null;
    if (event.summaryOnly) rounds = [];
    else if (event.sinceRoundIndex == null) {
      // 首次只提供最近记录用于变化量提示，完整历史在打开历史页时读取。
      rounds = (await db.collection('rounds').where({ roomId })
        .orderBy('roundIndex', 'desc').limit(PAGE_SIZE).get()).data.reverse();
    } else if (event.sinceRoundIndex < upper) {
      const query = db.command.and([{ roomId }, { roundIndex: db.command.gt(event.sinceRoundIndex) },
        { roundIndex: db.command.lte(upper) }]);
      const page = (await db.collection('rounds').where(query).orderBy('roundIndex', 'asc')
        .orderBy('_id', 'asc').skip(offset).limit(PAGE_SIZE + 1).get()).data;
      rounds = page.slice(0, PAGE_SIZE);
      if (page.length > PAGE_SIZE) nextOffset = offset + PAGE_SIZE;
    } else rounds = [];
    const result = { protocol: 2, room: { _id: roomId, roomCode: room.roomCode, status: room.status,
      qrCodeFileID: room.qrCodeFileID || '' }, currentPlayerId: me._id,
      players: players.map(({ openid: ignored, clientId, ...p }) => ({ ...p, isOnline: isOnline(p, now) })),
      rounds, nextOffset, throughRoundIndex: upper, totalsThrough: room.roundCount,
      scoreTotals: room.scoreTotals, revision: room.revision || 0, sync: policy(), watchId: me._id,
      historyComplete: event.sinceRoundIndex == null && rounds.length === (room.ledgerEntryCount == null ? room.roundCount : room.ledgerEntryCount) };
    if (!event.summaryOnly && event.knownRevision !== result.revision) {
      result.rule = (await db.collection('rules').doc(room.ruleId).get()).data;
    }
    if (event.subscribe && offset === 0 && policy().mode === 'watch') {
      await db.runTransaction(async tx => {
        const fresh = (await tx.collection('rooms').doc(roomId).get()).data;
        const member = (await tx.collection('players').doc(me._id).get()).data;
        if (!ownsPlayer(member, openid, memberClientId)) throw new Error('玩家身份已变更');
        const ref = tx.collection('roomFeeds').doc(me._id);
        const existing = (await ref.get()).data;
        const members = new Map((fresh.subscribers || []).map(m => [m.playerId, m]));
        if (!fresh.notify || !members.has(me._id) || members.get(me._id).openid !== openid) {
          members.set(me._id, { playerId: me._id, openid });
          await tx.collection('rooms').doc(roomId).update({ data: { notify: true, subscribers: [...members.values()] } });
        }
        if (!existing || existing.revision !== (fresh.revision || 0) || existing._openid !== openid) {
          await writeFeed(tx, roomId, fresh, { playerId: me._id, openid });
        }
      });
    }
    if (offset === 0 && policy().mode === 'poll' && room.notify) {
      await db.collection('rooms').doc(roomId).update({ data: { notify: false } });
    }
    return { code: 'OK', data: result };
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
