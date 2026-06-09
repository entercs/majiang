const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;
const { ROOM_STATUS } = require('../_shared/constants');

/**
 * 拉取当前 clientId 的所有相关房间
 * 入参: { clientId }
 *
 * 返回: { code: 'OK', data: { active: [...], finished: [...] } }
 *
 * 流程：
 *  1) 查 players.where({clientId}) → 拿到所有 player 记录
 *  2) 收集去重 roomIds
 *  3) 一次性查所有 rooms
 *  4) 对每个 room 算在线人数 + 归类
 */
exports.main = async (event) => {
  const { clientId } = event;
  if (!clientId) {
    return { code: 'INVALID_INPUT', message: 'clientId 缺失' };
  }

  try {
    // 1. 该 clientId 的所有 player
    const playersRes = await db.collection('players')
      .where({ clientId })
      .get();
    if (playersRes.data.length === 0) {
      return { code: 'OK', data: { active: [], finished: [] } };
    }

    // 2. 去重 roomIds
    const roomIds = [...new Set(playersRes.data.map(p => p.roomId))];

    // 3. 一次性查所有 room
    const roomsRes = await db.collection('rooms')
      .where({ _id: _.in(roomIds) })
      .get();
    const rooms = roomsRes.data;

    // 4. 归类
    const active = [];
    const finished = [];
    for (const room of rooms) {
      const onlineCountRes = await db.collection('players')
        .where({ roomId: room._id, isOnline: true })
        .count();
      const item = {
        roomId: room._id,
        roomCode: room.roomCode,
        onlineCount: onlineCountRes.total,
        closedAt: room.closedAt || null,
        closedBy: room.closedBy || null,
      };
      if (room.status === ROOM_STATUS.ACTIVE) {
        active.push(item);
      } else {
        finished.push(item);
      }
    }

    // 5. 排序
    active.sort((a, b) => (b.closedAt || 0) - (a.closedAt || 0));
    finished.sort((a, b) => (b.closedAt || 0) - (a.closedAt || 0));

    return { code: 'OK', data: { active, finished } };
  } catch (err) {
    console.error('getMyRooms error:', err);
    return { code: 'INTERNAL_ERROR', message: err.message };
  }
};
