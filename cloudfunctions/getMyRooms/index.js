const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database({ throwOnNotFound: false });
const { getAll, ownsPlayer, isOnline, ONLINE_TTL_MS } = require('./_shared/roomLifecycle');
exports.main = async event => {
  const { OPENID: openid } = cloud.getWXContext();
  const { clientId } = event;
  if (!openid || !clientId) return { code: 'INVALID_INPUT', message: '身份缺失' };
  const latest = new Map();
  const query = db.collection('players').where(db.command.or([{ openid }, { clientId }]))
    .orderBy('joinedAt', 'desc').orderBy('_id', 'asc');
  for (let offset = 0; latest.size < 10; offset += 20) {
    const page = (await query.skip(offset).limit(20).get()).data;
    for (const p of page) {
      if (ownsPlayer(p, openid, clientId) && !latest.has(p.roomId)) latest.set(p.roomId, p);
      if (latest.size === 10) break;
    }
    if (page.length < 20) break;
  }
  if (!latest.size) return { code: 'OK', data: { active: [], finished: [] } };
  const rooms = (await db.collection('rooms').where({ _id: db.command.in([...latest.keys()]) }).limit(10).get()).data;
  const activeIds = rooms.filter(r => r.status === 'active').map(r => r._id);
  const now = Date.now();
  const online = activeIds.length ? await getAll(db.collection('players').where({
    roomId: db.command.in(activeIds), isOnline: true, lastSeenAt: db.command.gt(now - ONLINE_TTL_MS),
  }).orderBy('_id', 'asc')) : [];
  const counts = {};
  for (const p of online) counts[p.roomId] = (counts[p.roomId] || 0) + 1;
  const active = [], finished = [];
  for (const mine of latest.values()) {
    const room = rooms.find(r => r._id === mine.roomId);
    if (!room) continue;
    const item = { roomId: room._id, roomCode: room.roomCode, onlineCount: counts[room._id] || 0,
      isOnline: room.status === 'active' && isOnline(mine, now), joinedAt: mine.joinedAt,
      closedAt: room.closedAt || null, closedBy: room.closedBy || null };
    (room.status === 'active' ? active : finished).push(item);
  }
  return { code: 'OK', data: { active, finished } };
};
