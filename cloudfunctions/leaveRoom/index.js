const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;
const { ROOM_STATUS } = require('./_shared/constants');

/**
 * 玩家退出房间
 * 入参: { roomId, playerId, clientId }
 *
 * 流程：
 *  1) 校验 player
 *  2) 校验 room
 *  3) 标 player.isOnline = false
 *  4) 返回剩余在线人数
 *
 * 房间超时关闭由 autoCloseTimeout 定时器独立处理
 */
exports.main = async (event) => {
  const { roomId, playerId, clientId } = event;

  if (!roomId || !playerId || !clientId) {
    return { code: 'INVALID_INPUT', message: '参数缺失', detail: 'roomId/playerId/clientId' };
  }

  // 1) 拿 player
  const playerRes = await db.collection('players').doc(playerId).get();
  if (!playerRes.data) {
    return { code: 'PLAYER_NOT_FOUND', message: '玩家不存在' };
  }
  if (playerRes.data.clientId !== clientId) {
    return { code: 'FORBIDDEN', message: '无权操作该玩家' };
  }

  // 2) 拿 room
  const roomRes = await db.collection('rooms').doc(roomId).get();
  if (!roomRes.data) {
    return { code: 'ROOM_NOT_FOUND', message: '房间不存在' };
  }

  // 3) 标为离线
  await db.collection('players').doc(playerId).update({
    data: { isOnline: false, lastSeenAt: Date.now() },
  });

  // 4) 查剩余在线人数
  const onlineRes = await db.collection('players')
    .where({ roomId, isOnline: true })
    .limit(10)
    .get();
  const onlineCount = onlineRes.data.length;

  // 5) 空房标记：无人在线 → 设 emptyAt 开始 5 分钟倒计时；还有人 → 清除空房标记
  if (onlineCount === 0) {
    await db.collection('rooms').doc(roomId).update({
      data: { emptyAt: Date.now() },
    });
  } else {
    await db.collection('rooms').doc(roomId).update({
      data: { emptyAt: _.remove() },
    });
  }

  return { code: 'OK', data: { onlineCount } };
};