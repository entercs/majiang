const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;
const { ROOM_STATUS } = require('./_shared/constants');

const TTL_MS = 30 * 24 * 60 * 60 * 1000;  // 30 天

/**
 * 每日 3:00 跑一次：
 *  - 找所有 status='finished' 且 closedAt < (now - 30d) 的房间
 *  - 删除这些房间下的所有 player 记录
 *  - 房间和 rounds 保留（历史战绩）
 *
 * 返回清理统计，便于在云函数日志中观察。
 */
exports.main = async () => {
  const cutoff = Date.now() - TTL_MS;

  // 1. 找"够老"的已结束房间
  const oldRoomsRes = await db.collection('rooms')
    .where({
      status: ROOM_STATUS.FINISHED,
      closedAt: _.lt(cutoff),
    })
    .limit(500)
    .get();

  if (oldRoomsRes.data.length === 0) {
    return { code: 'OK', data: { scanned: 0, playersDeleted: 0 } };
  }

  const oldRoomIds = oldRoomsRes.data.map(r => r._id);

  // 2. 找这些房间的所有 player
  const playersRes = await db.collection('players')
    .where({ roomId: _.in(oldRoomIds) })
    .limit(1000)
    .get();

  let deleted = 0;
  for (const p of playersRes.data) {
    try {
      await db.collection('players').doc(p._id).remove();
      deleted++;
    } catch (e) {
      console.error('remove player failed', p._id, e.message);
    }
  }

  return {
    code: 'OK',
    data: {
      roomsScanned: oldRoomsRes.data.length,
      playersScanned: playersRes.data.length,
      playersDeleted: deleted,
      cutoffDate: new Date(cutoff).toISOString(),
    },
  };
};