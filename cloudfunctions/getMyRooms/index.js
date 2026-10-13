const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
// 文档不存在时返回 null，支持事务中的首次创建与旧记录兼容。
const db = cloud.database({ throwOnNotFound: false });
const { getAll, ownsPlayer, isOnline } = require('./_shared/roomLifecycle');

exports.main = async (event) => {
  const { OPENID: openid } = cloud.getWXContext();
  const { clientId } = event;
  if (!openid || !clientId) return { code: 'INVALID_INPUT', message: '身份缺失' };
  const candidates = await getAll(db.collection('players')
    .where(db.command.or([{ openid }, { clientId }])).orderBy('_id', 'asc'));
  const latest = new Map();
  for (const p of candidates.filter(p => ownsPlayer(p, openid, clientId))) {
    if (!latest.has(p.roomId) || (p.joinedAt || 0) > (latest.get(p.roomId).joinedAt || 0)) latest.set(p.roomId, p);
  }
  const recent = [...latest.values()].sort((a, b) => (b.joinedAt || 0) - (a.joinedAt || 0));
  const active = [], finished = [];
  const now = Date.now();
  // 先选最近十场，历史不删除；缺失房间不占展示名额。
  for (const mine of recent) {
    const found = await db.collection('rooms').where({ _id: mine.roomId }).limit(1).get();
    if (!found.data.length) continue;
    const room = found.data[0];
    const online = await db.collection('players').where({ roomId: room._id,
      isOnline: true, lastSeenAt: db.command.gt(now - 90000) }).count();
    const item = { roomId: room._id, roomCode: room.roomCode, onlineCount: online.total,
      isOnline: isOnline(mine, now), joinedAt: mine.joinedAt,
      closedAt: room.closedAt || null, closedBy: room.closedBy || null };
    (room.status === 'active' ? active : finished).push(item);
    if (active.length + finished.length >= 10) break;
  }
  return { code: 'OK', data: { active, finished } };
};
