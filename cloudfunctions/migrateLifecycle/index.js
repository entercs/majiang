const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

/**
 * 一次性迁移：为老 players/rooms 记录补 isOnline/lastSeenAt/closedAt/closedBy 字段
 *
 * 触发方式：在微信开发者工具的"云开发 → 云函数"里直接调用
 *   wx.cloud.callFunction({ name: 'migrateLifecycle', data: {} })
 *
 * 返回：{ playersUpdated, roomsUpdated, playersSkipped, roomsSkipped }
 */
exports.main = async () => {
  const now = Date.now();
  let playersUpdated = 0;
  let playersSkipped = 0;
  let roomsUpdated = 0;
  let roomsSkipped = 0;

  // 1. 迁移 players：补 isOnline=true, lastSeenAt=now
  // 策略：拉所有没 isOnline 字段的记录（_exists: false），逐条 update
  const playersToUpdate = await db.collection('players')
    .where({ isOnline: _.exists(false) })
    .limit(100)
    .get();

  for (const p of playersToUpdate.data) {
    await db.collection('players').doc(p._id).update({
      data: { isOnline: true, lastSeenAt: now },
    });
    playersUpdated++;
  }
  playersSkipped = playersToUpdate.data.length === 0 ? 'all-have-isOnline' : 0;

  // 2. 迁移 rooms：补 closedAt=null, closedBy=null
  const roomsToUpdate = await db.collection('rooms')
    .where({ closedAt: _.exists(false) })
    .limit(100)
    .get();

  for (const r of roomsToUpdate.data) {
    await db.collection('rooms').doc(r._id).update({
      data: { closedAt: null, closedBy: null },
    });
    roomsUpdated++;
  }
  roomsSkipped = roomsToUpdate.data.length === 0 ? 'all-have-closedAt' : 0;

  return {
    code: 'OK',
    data: {
      playersUpdated,
      playersSkipped,
      roomsUpdated,
      roomsSkipped,
      note: '如果 playersUpdated/roomsUpdated < 实际老记录数，多调几次（每次最多 100 条）',
    },
  };
};
