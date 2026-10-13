const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
// 文档不存在时返回 null，支持事务中的首次创建与旧记录兼容。
const db = cloud.database({ throwOnNotFound: false });
const { getAll, closeReason } = require('./_shared/roomLifecycle');
const { cleanupRoomQRCode } = require('./_shared/qrCodeService');

exports.main = async () => {
  const now = Date.now();
  // 扫描全部活动房间，不固定只扫前 100 个。
  const rooms = await getAll(db.collection('rooms').where({ status: 'active' }).orderBy('_id', 'asc'));
  let closed = 0;
  const failures = [];
  for (const room of rooms) {
    try {
      const players = await getAll(db.collection('players').where({ roomId: room._id }).orderBy('_id', 'asc'));
      const last = await db.collection('rounds').where({ roomId: room._id })
        .orderBy('createdAt', 'desc').limit(1).get();
      const result = await db.runTransaction(async transaction => {
        const ref = transaction.collection('rooms').doc(room._id);
        const fresh = (await ref.get()).data;
        if (!fresh || fresh.status !== 'active') return null;
        // 心跳、加入、退出、计分均写同一 room 文档，事务冲突时重读，防止误关。
        const reason = closeReason({ ...fresh, lastActivityAt: Math.max(fresh.lastActivityAt || 0,
          last.data.length ? Number(last.data[0].createdAt) : 0) }, players, now);
        if (!reason) return null;
        // 上次扫描后新的房间心跳也应阻止使用过时的玩家列表关房。
        if (Number(fresh.presenceAt || 0) > now - 90000) return null;
        await ref.update({ data: { status: 'finished', closedAt: now, closedBy: reason,
          qrCodeFileID: db.command.remove() } });
        return { fileID: fresh.qrCodeFileID };
      });
      if (result) {
        closed++;
        await cleanupRoomQRCode(result.fileID);
      }
    } catch (err) {
      failures.push(room._id);
      console.error('auto close failed:', room._id, err.message);
    }
  }
  return { code: failures.length ? 'PARTIAL_FAILURE' : 'OK',
    data: { scanned: rooms.length, closed, failures, time: new Date(now).toISOString() } };
};
