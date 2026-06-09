const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;
const { ROOM_STATUS } = require('./_shared/constants');

/**
 * 手动结束本局（任何玩家可调用）
 * 入参: { roomId, clientId }
 *
 * 流程：
 *  1) 校验调用者是房内玩家（players.where({ roomId, clientId }) 至少 1 条）
 *  2) 校验 rooms.status === 'active'
 *  3) 事务：rooms → status=finished/closedAt/closedBy=manual
 *           players → 所有 isOnline=false
 */
exports.main = async (event) => {
  const { roomId, clientId } = event;

  if (!roomId || !clientId) {
    return { code: 'INVALID_INPUT', message: '参数缺失' };
  }

  try {
    // 1. 校验调用者是房内玩家
    const playerRes = await db.collection('players')
      .where({ roomId, clientId })
      .limit(1)
      .get();
    if (playerRes.data.length === 0) {
      return { code: 'FORBIDDEN', message: '你不在该房间中' };
    }

    // 2. 校验房间状态
    const roomRes = await db.collection('rooms').doc(roomId).get();
    if (!roomRes.data) {
      return { code: 'ROOM_NOT_FOUND', message: '房间不存在' };
    }
    if (roomRes.data.status !== ROOM_STATUS.ACTIVE) {
      return { code: 'ROOM_ALREADY_FINISHED', message: '本局已结束' };
    }

    // 3. 关闭房间 + 清理所有 isOnline
    const now = Date.now();
    await db.runTransaction(async (tx) => {
      await tx.collection('rooms').doc(roomId).update({
        data: {
          status: ROOM_STATUS.FINISHED,
          closedAt: now,
          closedBy: 'manual',
        },
      });
      await tx.collection('players').where({ roomId }).update({
        data: { isOnline: false, lastSeenAt: now },
      });
    });

    return { code: 'OK', data: { closedAt: now, closedBy: 'manual' } };
  } catch (err) {
    console.error('finishRoom error:', err);
    return { code: 'INTERNAL_ERROR', message: err.message };
  }
};
