const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
// 文档不存在时返回 null，支持事务中的首次创建与旧记录兼容。
const db = cloud.database({ throwOnNotFound: false });
const { changeRoom, subscribers, CHECK_DELAY_MS } = require('./_shared/roomSync');
const { ownsPlayer, isOnline, getAll } = require('./_shared/roomLifecycle');

exports.main = async (event) => {
  const { OPENID: openid } = cloud.getWXContext();
  const { roomId, playerId, clientId } = event;
  if (!roomId || !playerId || !openid) return { code: 'INVALID_INPUT', message: '身份缺失' };
  const players = await getAll(db.collection('players').where({ roomId }).orderBy('_id', 'asc'));
  const now = Date.now();
  return db.runTransaction(async transaction => {
    const playerRef = transaction.collection('players').doc(playerId);
    const p = (await playerRef.get()).data;
    if (!p || p.roomId !== roomId || !ownsPlayer(p, openid, clientId)) {
      return { code: 'FORBIDDEN', message: '无权操作该玩家' };
    }
    const roomRef = transaction.collection('rooms').doc(roomId);
    const room = (await roomRef.get()).data;
    if (!room) return { code: 'ROOM_NOT_FOUND', message: '房间不存在' };
    await playerRef.update({ data: { openid, isOnline: false, lastSeenAt: now } });
    let onlineCount = 0;
    for (const other of players) {
      if (other._id === playerId) continue;
      const fresh = (await transaction.collection('players').doc(other._id).get()).data;
      if (fresh && isOnline(fresh, now)) onlineCount++;
    }
    // emptyAt 只是候选时间，关闭前还须复核最近心跳，不能仅凭标记关房。
    await changeRoom(transaction, roomId, room, { emptyAt: onlineCount ? db.command.remove() : now,
      nextCheckAt: now + (onlineCount ? CHECK_DELAY_MS : 300000) }, subscribers(players));
    return { code: 'OK', data: { onlineCount } };
  });
};
