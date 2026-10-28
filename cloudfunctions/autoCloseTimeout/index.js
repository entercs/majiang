const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database({ throwOnNotFound: false });
const { getAll, closeReason, ONLINE_TTL_MS } = require('./_shared/roomLifecycle');
const { ensureLedger, changeRoom, subscribers, CHECK_DELAY_MS } = require('./_shared/roomSync');
const { cleanupRoomQRCode } = require('./_shared/qrCodeService');
const MAX_BATCH = 100;
exports.main = async () => {
  const now = Date.now();
  const due = (await db.collection('rooms').where({ status: 'active', nextCheckAt: db.command.lte(now) })
    .orderBy('nextCheckAt', 'asc').orderBy('_id', 'asc').limit(MAX_BATCH).get()).data;
  const legacy = due.length < MAX_BATCH ? (await db.collection('rooms').where({ status: 'active',
    nextCheckAt: db.command.exists(false) }).orderBy('_id', 'asc').limit(MAX_BATCH - due.length).get()).data : [];
  const rooms = [...due, ...legacy];
  let closed = 0, processed = 0;
  const failures = [];
  for (const candidate of rooms) {
    if (Date.now() - now > 20000) break;
    processed++;
    try {
      const players = await getAll(db.collection('players').where({ roomId: candidate._id }).orderBy('_id', 'asc'));
      let lastRoundAt = 0;
      if (!candidate.lastActivityAt) {
        const last = await db.collection('rounds').where({ roomId: candidate._id }).orderBy('createdAt', 'desc').limit(1).get();
        lastRoundAt = last.data.length ? Number(last.data[0].createdAt) : 0;
      }
      // 只在确实需要关房时补建旧房间总分，不给仍活跃的旧房间增加扫描。
      if (closeReason({ ...candidate, lastActivityAt: Math.max(candidate.lastActivityAt || 0, lastRoundAt) }, players, now)) {
        await ensureLedger(db, candidate);
      }
      const result = await db.runTransaction(async tx => {
        const ref = tx.collection('rooms').doc(candidate._id);
        const fresh = (await ref.get()).data;
        if (!fresh || fresh.status !== 'active') return null;
        const reason = closeReason({ ...fresh, lastActivityAt: Math.max(fresh.lastActivityAt || 0, lastRoundAt) }, players, now);
        if (!reason || Number(fresh.presenceAt || 0) > now - ONLINE_TTL_MS) {
          const lastSeen = Math.max(fresh.createdAt || 0, fresh.lastActivityAt || 0, fresh.presenceAt || 0,
            ...players.map(p => p.lastSeenAt || 0));
          await ref.update({ data: { nextCheckAt: Math.max(now + 300000, lastSeen + CHECK_DELAY_MS) } });
          return null;
        }
        await changeRoom(tx, candidate._id, fresh, { status: 'finished', closedAt: now, closedBy: reason,
          qrCodeFileID: db.command.remove() }, fresh.subscribers || subscribers(players));
        return { fileID: fresh.qrCodeFileID };
      });
      if (result) { closed++; await cleanupRoomQRCode(result.fileID); }
    } catch (err) { failures.push(candidate._id); console.error('auto close failed:', candidate._id, err.message); }
  }
  return { code: failures.length ? 'PARTIAL_FAILURE' : 'OK', data: {
    scanned: processed, closed, failures, batchLimit: MAX_BATCH,
    more: due.length + legacy.length === MAX_BATCH || processed < rooms.length,
    time: new Date(now).toISOString(),
  } };
};
