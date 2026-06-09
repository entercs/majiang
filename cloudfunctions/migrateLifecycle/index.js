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
 * 返回：{ playersUpdated, roomsUpdated, playersRemaining, roomsRemaining }
 */
exports.main = async () => {
  const now = Date.now();

  // 1. 批量更新 players：补 isOnline=true, lastSeenAt=now
  // 注意：.where().update() 单次最多 1000 条；超出需重试
  let playersUpdated = 0;
  let playersRemaining = 0;
  for (let i = 0; i < 10; i++) {
    const res = await db.collection('players')
      .where({ isOnline: _.exists(false) })
      .update({ data: { isOnline: true, lastSeenAt: now } });
    playersUpdated += res.updated || 0;
    if (!res.updated || res.updated < 1000) break;
  }
  if (playersUpdated >= 1000) {
    const remaining = await db.collection('players')
      .where({ isOnline: _.exists(false) })
      .count();
    playersRemaining = remaining.total;
  }

  // 2. 批量更新 rooms：补 closedAt=null, closedBy=null
  let roomsUpdated = 0;
  let roomsRemaining = 0;
  for (let i = 0; i < 10; i++) {
    const res = await db.collection('rooms')
      .where({ closedAt: _.exists(false) })
      .update({ data: { closedAt: null, closedBy: null } });
    roomsUpdated += res.updated || 0;
    if (!res.updated || res.updated < 1000) break;
  }
  if (roomsUpdated >= 1000) {
    const remaining = await db.collection('rooms')
      .where({ closedAt: _.exists(false) })
      .count();
    roomsRemaining = remaining.total;
  }

  return {
    code: 'OK',
    data: {
      playersUpdated,
      playersRemaining,
      roomsUpdated,
      roomsRemaining,
    },
  };
};
