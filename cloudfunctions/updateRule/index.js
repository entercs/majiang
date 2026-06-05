const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const { validateRule } = require('./_shared/ruleService');

exports.main = async (event) => {
  const { openid } = cloud.getWXContext();
  const { roomId, rule } = event;

  if (!validateRule(rule)) {
    return { code: 'INVALID_INPUT', message: '规则字段不合法', detail: 'rule' };
  }

  // 1. Verify owner
  const roomRes = await db.collection('rooms').doc(roomId).get();
  if (!roomRes.data) return { code: 'ROOM_NOT_FOUND', message: '房间不存在' };
  if (roomRes.data.ownerId !== openid) {
    return { code: 'NOT_IN_ROOM', message: '仅房主可修改规则' };
  }

  // 2. Update rule
  await db.collection('rules').doc(roomRes.data.ruleId).update({
    data: { ...rule, updatedAt: Date.now() }
  });

  return { code: 'OK' };
};
