const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
// 文档不存在时返回 null，支持事务中的首次创建与旧记录兼容。
const db = cloud.database({ throwOnNotFound: false });
const { validateRule } = require('./_shared/ruleService');
const { getAll, ownsPlayer } = require('./_shared/roomLifecycle');
const FIELDS = ['baseScore', 'zimoMul', 'dianpaoMul', 'mingGangScore', 'anGangScore',
  'bugangScore', 'maxFan', 'maCount', 'dealerMul', 'allowDianpao', 'cardTypeFans', 'winTypeFans'];

exports.main = async (event) => {
  const { OPENID: openid } = cloud.getWXContext();
  const { roomId, rule, memberClientId } = event;
  if (!roomId || !openid || !validateRule(rule)) return { code: 'INVALID_INPUT', message: '规则字段不合法' };
  const players = await getAll(db.collection('players').where({ roomId }).orderBy('_id', 'asc'));
  const owner = players.find(p => p.isOwner && ownsPlayer(p, openid, memberClientId));
  if (!owner) return { code: 'FORBIDDEN', message: '仅房主可修改规则' };
  return db.runTransaction(async transaction => {
    const ref = transaction.collection('rooms').doc(roomId);
    const room = (await ref.get()).data;
    if (!room) return { code: 'ROOM_NOT_FOUND', message: '房间不存在' };
    if (room.status !== 'active') return { code: 'ROOM_FINISHED', message: '本局已结束' };
    const player = (await transaction.collection('players').doc(owner._id).get()).data;
    if (!player || !player.isOwner || !ownsPlayer(player, openid, memberClientId)) return { code: 'FORBIDDEN', message: '仅房主可修改规则' };
    const fields = {};
    for (const key of FIELDS) fields[key] = rule[key] == null ? db.command.remove() : rule[key];
    await transaction.collection('rules').doc(room.ruleId).update({ data: { ...fields, updatedAt: Date.now() } });
    await ref.update({ data: { ownerId: openid, lastActivityAt: Date.now() } });
    return { code: 'OK' };
  });
};
