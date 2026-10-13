const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
// 文档不存在时返回 null，支持事务中的首次创建与旧记录兼容。
const db = cloud.database({ throwOnNotFound: false });
const { ownsPlayer } = require('./_shared/roomLifecycle');

exports.main = async (event) => {
  const { OPENID: openid } = cloud.getWXContext();
  const { roomId, playerId, nickname, avatarIndex, memberClientId } = event;

  if (typeof nickname !== 'string' || nickname.trim().length === 0 || nickname.length > 8) {
    return { code: 'INVALID_INPUT', message: '昵称长度 1-8', detail: 'nickname' };
  }
  if (!Number.isInteger(avatarIndex) || avatarIndex < 0 || avatarIndex > 6) {
    return { code: 'INVALID_INPUT', message: '头像序号 0-6', detail: 'avatarIndex' };
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
  // 权限：只能改自己的
  if (!ownsPlayer(playerRes.data, openid, memberClientId)) {
    return { code: 'NOT_IN_ROOM', message: '只能修改自己的信息' };
  }

  await db.collection('players').doc(playerId).update({
    data: {
      openid,
      nickname: nickname.trim(),
      avatarIndex,
    },
  });

  return { code: 'OK', data: { playerId, nickname: nickname.trim(), avatarIndex } };
};
