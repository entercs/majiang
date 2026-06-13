const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;
const { ROOM_STATUS } = require('./_shared/constants');

const MAX_RETURN = 10;  // 最多返回 10 场（active + finished 合并）

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
 *  5) 按"最近活跃"（player.joinedAt 降序）排序
 *  6) 截前 10 场
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

    // 每个 roomId 取 joinedAt 最大的 player（最最近一次加入）
    const latestByRoom = new Map();
    for (const p of playersRes.data) {
      const cur = latestByRoom.get(p.roomId);
      if (!cur || (p.joinedAt || 0) > (cur.joinedAt || 0)) {
        latestByRoom.set(p.roomId, p);
      }
    }

    // 2. 去重 roomIds
    const roomIds = [...latestByRoom.keys()];

    // 3. 一次性查所有 room
    const roomsRes = await db.collection('rooms')
      .where({ _id: _.in(roomIds) })
      .get();
    const rooms = roomsRes.data;

    // 4. 归类（"进行中" = 我在该房 isOnline=true 且房间 active）
    const active = [];
    const finished = [];
    for (const room of rooms) {
      const onlineCountRes = await db.collection('players')
        .where({ roomId: room._id, isOnline: true })
        .count();
      const myPlayer = latestByRoom.get(room._id);
      const item = {
        roomId: room._id,
        roomCode: room.roomCode,
        onlineCount: onlineCountRes.total,
        isOnline: myPlayer.isOnline,        // 我是否在线
        joinedAt: myPlayer.joinedAt,        // 我加入/重入时间
        closedAt: room.closedAt || null,
        closedBy: room.closedBy || null,
      };
      // "进行中"：room 是 active 就显示（不看我是否在线，因为其他玩家可能还在房间里）
      if (room.status === ROOM_STATUS.ACTIVE) {
        active.push(item);
      } else {
        finished.push(item);
      }
    }

    // 5. 按 joinedAt 倒序（最近活跃的在前）
    const sortByJoined = (a, b) => (b.joinedAt || 0) - (a.joinedAt || 0);
    active.sort(sortByJoined);
    finished.sort(sortByJoined);

    // 6. 合并截前 10 场
    const merged = [...active, ...finished]
      .sort(sortByJoined)
      .slice(0, MAX_RETURN);
    const activeIds = new Set(active.map(r => r.roomId));
    const finalActive = merged.filter(r => activeIds.has(r.roomId));
    const finalFinished = merged.filter(r => !activeIds.has(r.roomId));

    return { code: 'OK', data: { active: finalActive, finished: finalFinished } };
  } catch (err) {
    console.error('getMyRooms error:', err);
    return { code: 'INTERNAL_ERROR', message: err.message };
  }
};