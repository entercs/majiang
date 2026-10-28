const { getAll, ONLINE_TTL_MS, EMPTY_TIMEOUT_MS } = require('./roomLifecycle');
const CHECK_DELAY_MS = ONLINE_TTL_MS + EMPTY_TIMEOUT_MS;
function setting(name, fallback, min, max) {
  const value = Number(process.env[name]);
  return Number.isSafeInteger(value) && value >= min && value <= max ? value : fallback;
}
function policy() {
  const mode = process.env.ROOM_SYNC_MODE === 'watch' ? 'watch' : 'poll';
  const heartbeatMs = setting('ROOM_HEARTBEAT_MS', mode === 'watch' ? 60000 : 30000, 15000, 60000);
  return { mode,
    pollMs: setting('ROOM_POLL_MS', 5000, 1000, 5000), heartbeatMs,
    reconcileMs: Math.min(setting('ROOM_RECONCILE_MS', 60000, 5000, 60000), heartbeatMs) };
}
function hasLedger(room) {
  return room.ledgerSchema === 1 && room.scoreTotals && Number.isSafeInteger(room.roundCount) && room.totalsThroughIndex === room.roundCount;
}
// 老房间一次性补建总分。扫描期间若发生记分或业务变更，重新取数，不写入过时总分。
async function ensureLedger(db, initial) {
  let room = initial;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (hasLedger(room)) return room;
    const rounds = await getAll(db.collection('rounds').where({ roomId: room._id }).orderBy('_id', 'asc'));
    const scoreTotals = {};
    let roundCount = 0;
    for (const r of rounds) {
      roundCount = Math.max(roundCount, r.roundIndex || 0);
      for (const [id, delta] of Object.entries(r.scoreChanges || {})) {
        const value = Number(delta);
        const next = (scoreTotals[id] || 0) + value;
        if (!Number.isSafeInteger(value) || !Number.isSafeInteger(next)) throw new Error('历史分数异常，请核对原始记录');
        scoreTotals[id] = next;
      }
    }
    const migrated = await db.runTransaction(async tx => {
      const ref = tx.collection('rooms').doc(room._id);
      const fresh = (await ref.get()).data;
      if (!fresh) throw new Error('房间不存在');
      if (hasLedger(fresh)) return fresh;
      if ((fresh.roundCount || 0) !== (room.roundCount || 0) ||
          (fresh.revision || 0) !== (room.revision || 0) ||
          (fresh.lastActivityAt || 0) !== (room.lastActivityAt || 0)) return null;
      const patch = { ledgerSchema: 1, scoreTotals, roundCount, totalsThroughIndex: roundCount, ledgerEntryCount: rounds.length };
      await ref.update({ data: patch });
      return { ...fresh, ...patch };
    });
    if (migrated) return migrated;
    room = (await db.collection('rooms').doc(room._id).get()).data;
  }
  const error = new Error('房间数据正在变化，请重试');
  error.code = 'SYNC_BUSY';
  throw error;
}
function subscribers(players) {
  return players.filter(p => p.openid).map(p => ({ playerId: p._id, openid: p.openid }));
}
async function writeFeed(tx, roomId, room, member) {
  await tx.collection('roomFeeds').doc(member.playerId).set({ data: {
    _openid: member.openid, roomId, revision: room.revision || 0,
    roundCount: room.roundCount || 0, status: room.status, updatedAt: Date.now(),
  } });
}
async function changeRoom(tx, roomId, room, patch, members) {
  const next = { ...room, ...patch, revision: (room.revision || 0) + 1 };
  if (members) next.subscribers = [...new Map([...(room.subscribers || []), ...members].map(m => [m.playerId, m])).values()];
  await tx.collection('rooms').doc(roomId).update({ data: {
    ...patch, revision: next.revision, ...(members ? { subscribers: next.subscribers } : {}),
  } });
  if (next.notify) {
    for (const member of next.subscribers || []) await writeFeed(tx, roomId, next, member);
  }
  return next;
}
module.exports = { policy, hasLedger, ensureLedger, subscribers, writeFeed, changeRoom, CHECK_DELAY_MS };
