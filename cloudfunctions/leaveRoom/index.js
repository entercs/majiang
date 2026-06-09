const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;
const { ROOM_STATUS } = require('./_shared/constants');

/**
 * 玩家退出房间
 * 入参: { roomId, playerId, clientId }
 *
 * 流程（一个事务内）：
 *  1) 校验 player.clientId === 调用方 clientId
 *  2) 校验 room 存在
 *  3) 置 player.isOnline = false
 *  4) 查该 room 内剩余 isOnline=true 的人数
 *  5) 若为 0 且 room.status === 'active' → 自动关闭
 */
exports.main = async (event) => {
  const { roomId, playerId, clientId } = event;

  if (!roomId || !playerId || !clientId) {
    return { code: 'INVALID_INPUT', message: '参数缺失', detail: 'roomId/playerId/clientId' };
  }

  try {
    const result = await db.runTransaction(async (tx) => {
      // 1) 拿 player
      const playerRes = await tx.collection('players').doc(playerId).get();
      if (!playerRes.data) {
        return { code: 'PLAYER_NOT_FOUND', message: '玩家不存在' };
      }
      if (playerRes.data.clientId !== clientId) {
        return { code: 'FORBIDDEN', message: '无权操作该玩家' };
      }

      // 2) 拿 room
      const roomRes = await tx.collection('rooms').doc(roomId).get();
      if (!roomRes.data) {
        return { code: 'ROOM_NOT_FOUND', message: '房间不存在' };
      }

      // 3) 标为离线
      await tx.collection('players').doc(playerId).update({
        data: { isOnline: false, lastSeenAt: Date.now() },
      });

      // 4) 查剩余在线人数
      const onlineCountRes = await tx.collection('players')
        .where({ roomId, isOnline: true })
        .count();
      const onlineCount = onlineCountRes.total;

      // 5) 若无人在线且房间还 active → 自动关
      let autoClosed = false;
      if (onlineCount === 0 && roomRes.data.status === ROOM_STATUS.ACTIVE) {
        await tx.collection('rooms').doc(roomId).update({
          data: {
            status: ROOM_STATUS.FINISHED,
            closedAt: Date.now(),
            closedBy: 'auto',
          },
        });
        autoClosed = true;
      }

      return { code: 'OK', data: { autoClosed, onlineCount } };
    });

    return result;
  } catch (err) {
    console.error('leaveRoom error:', err);
    return { code: 'INTERNAL_ERROR', message: err.message };
  }
};
