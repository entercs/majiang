const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
// 文档不存在时返回 null，支持事务中的首次创建与旧记录兼容。
const db = cloud.database({ throwOnNotFound: false });
const { ROOM_STATUS } = require('./_shared/constants');
const { generateRoomQRCode } = require('./_shared/qrCodeService');

// 单飞缓存：同一 roomCode 并发请求复用同一个 Promise
// 注意：云函数实例可能在多 worker 间调度，inflight 是 per-instance（不是全局）
// 极端情况：跨 worker 的并发仍可能重复生成一次 wxacode，可接受
const inflight = new Map(); // roomCode -> Promise<fileID|null>

exports.main = async (event) => {
  const { roomCode } = event;

  if (typeof roomCode !== 'string' || !/^\d{6}$/.test(roomCode)) {
    return { code: 'INVALID_INPUT', message: '房间号格式错误', detail: 'roomCode' };
  }

  // 找房间
  const roomRes = await db.collection('rooms').where({ roomCode }).limit(1).get();
  if (roomRes.data.length === 0) {
    return { code: 'ROOM_NOT_FOUND', message: '房间号不存在' };
  }
  const room = roomRes.data[0];

  // 拒绝已结束房间（QR 已无意义）
  if (room.status !== ROOM_STATUS.ACTIVE) {
    return { code: 'ROOM_FINISHED', message: '本局已结束' };
  }

  // 已有 fileID → 直接返回（秒开路径）
  if (room.qrCodeFileID) {
    return { code: 'OK', data: { fileID: room.qrCodeFileID } };
  }

  // 单飞：并发请求共享一次生成
  if (inflight.has(roomCode)) {
    const fileID = await inflight.get(roomCode);
    return fileID
      ? { code: 'OK', data: { fileID } }
      : { code: 'QR_GEN_FAILED', message: '二维码生成失败，请重试' };
  }

  // 首次/重试生成
  const promise = generateRoomQRCode(room._id, roomCode)
    .finally(() => inflight.delete(roomCode));
  inflight.set(roomCode, promise);

  const fileID = await promise;
  return fileID
    ? { code: 'OK', data: { fileID } }
    : { code: 'QR_GEN_FAILED', message: '二维码生成失败，请重试' };
};