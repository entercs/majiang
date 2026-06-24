const cloud = require('wx-server-sdk');
cloud.init({ env: 'majing-d6gx0f5mm301172e1' });
const db = cloud.database();
const _ = db.command;
const { ROOM_STATUS } = require('./_shared/constants');
const { cleanupRoomQRCode } = require('./_shared/qrCodeService');

// 30 分钟无活动 → 自动关闭
const INACTIVE_TIMEOUT_MS = 30 * 60 * 1000;
// 空房（0 人在线）5 分钟 → 自动关闭
const EMPTY_TIMEOUT_MS = 5 * 60 * 1000;

exports.main = async () => {
  const now = Date.now();
  const inactiveCutoff = now - INACTIVE_TIMEOUT_MS;

  const roomsRes = await db.collection('rooms')
    .where({ status: ROOM_STATUS.ACTIVE })
    .limit(100)
    .get();

  let closed = 0;
  for (const room of roomsRes.data) {
    // ─── 分支 A：空房 5 分钟关停 ───
    // emptyAt 由 leaveRoom 在最后一人离线时写入，joinRoom 重入时清除
    // 所以 emptyAt 存在等价于房间无人
    if (room.emptyAt != null) {
      if (room.emptyAt + EMPTY_TIMEOUT_MS <= now) {
        const qrCodeFileID = room.qrCodeFileID;
        await db.collection('rooms').doc(room._id).update({
          data: {
            status: ROOM_STATUS.FINISHED,
            closedAt: now,
            closedBy: 'auto-empty',
            qrCodeFileID: _.remove(),
          },
        });
        // 异步清理云存储文件（best-effort，失败不影响关房）
        cleanupRoomQRCode(qrCodeFileID).catch(err =>
          console.error('QR cleanup background error:', err.message)
        );
        closed++;
      }
      continue;
    }

    // ─── 分支 B：30 分钟无活动关停 ───
    // 取最后活动时间的基准：room.lastActivityAt（settleRound 更新）或 room.createdAt
    const lastActivityAt = room.lastActivityAt || room.createdAt;
    if (lastActivityAt >= inactiveCutoff) continue; // 最近有活动，跳过

    // 兜底：去查 rounds 表取最后一笔的时间（兼容没有 lastActivityAt 的旧房间）
    const lastRoundRes = await db.collection('rounds')
      .where({ roomId: room._id })
      .orderBy('createdAt', 'desc')
      .limit(1)
      .get();
    const finalActivity = lastRoundRes.data.length > 0
      ? Math.max(lastRoundRes.data[0].createdAt, lastActivityAt)
      : lastActivityAt;

    if (finalActivity < inactiveCutoff) {
      const qrCodeFileID = room.qrCodeFileID;
      await db.collection('rooms').doc(room._id).update({
        data: {
          status: ROOM_STATUS.FINISHED,
          closedAt: now,
          closedBy: 'auto-timeout',
          qrCodeFileID: _.remove(),
        },
      });
      // 异步清理云存储文件（best-effort，失败不影响关房）
      cleanupRoomQRCode(qrCodeFileID).catch(err =>
        console.error('QR cleanup background error:', err.message)
      );
      closed++;
    }
  }

  return {
    code: 'OK',
    data: {
      scanned: roomsRes.data.length,
      closed,
      time: new Date(now).toISOString(),
    },
  };
};