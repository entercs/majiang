const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event) => {
  const { openid } = cloud.getWXContext();
  const { roomId, playerId, nickname } = event;

  if (typeof nickname !== 'string' || nickname.trim().length === 0 || nickname.length > 8) {
    return { code: 'INVALID_INPUT', message: '昵称长度 1-8', detail: 'nickname' };
  }
  if (!roomId || !playerId) {
    return { code: 'INVALID_INPUT', message: '参数缺失', detail: 'roomId/playerId' };
  }

  const playerRes = await db.collection('players').doc(playerId).get();
  if (!playerRes.data) {
    return { code: 'INVALID_INPUT', message: '玩家不存在' };
  }
  if (playerRes.data.roomId !== roomId) {
    return { code: 'INVALID_INPUT', message: '玩家不属于该房间' };
  }
  // 权限：只能改自己的。匿名用户没有 openid 时不做校验（MVP 临时放行）
  if (playerRes.data.openid && playerRes.data.openid !== openid) {
    return { code: 'NOT_IN_ROOM', message: '只能修改自己的昵称' };
  }

  await db.collection('players').doc(playerId).update({
    data: { nickname: nickname.trim() },
  });

  return { code: 'OK', data: { playerId, nickname: nickname.trim() } };
};
