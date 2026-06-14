const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;
const { ROOM_STATUS } = require('./_shared/constants');

// 30 分钟无活动 → 自动关闭
const TIMEOUT_MS = 30 * 60 * 1000;

exports.main = async () => {
  const cutoff = Date.now() - TIMEOUT_MS;

  // 找所有 status=active 且 最后 round.createdAt < cutoff 的房间
  // 简化：先找所有 active 房间，再逐个检查 lastActivityAt
  // （数据库没法 join rounds，只能这样）
  const roomsRes = await db.collection('rooms')
    .where({ status: ROOM_STATUS.ACTIVE })
    .limit(100)
    .get();

  let closed = 0;
  for (const room of roomsRes.data) {
    // 取该房间内所有 isOnline=true 的 player 数量
    const onlineRes = await db.collection('players')
      .where({ roomId: room._id, isOnline: true })
      .count();

    // 取最后一笔 round 的 createdAt
    const lastRoundRes = await db.collection('rounds')
      .where({ roomId: room._id })
      .orderBy('createdAt', 'desc')
      .limit(1)
      .get();
    const lastRoundAt = lastRoundRes.data.length > 0 ? lastRoundRes.data[0].createdAt : room.createdAt;

    // 触发条件：距最后活动 > 30 分钟（不检查是否在线）
    if (lastRoundAt < cutoff) {
      await db.collection('rooms').doc(room._id).update({
        data: {
          status: ROOM_STATUS.FINISHED,
          closedAt: Date.now(),
          closedBy: 'auto-timeout',
        },
      });
      closed++;
    }
  }

  return {
    code: 'OK',
    data: {
      scanned: roomsRes.data.length,
      closed,
      cutoffTime: new Date(cutoff).toISOString(),
    },
  };
};