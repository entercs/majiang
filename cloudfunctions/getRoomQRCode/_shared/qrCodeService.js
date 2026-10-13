const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database({ throwOnNotFound: false });

/**
 * 生成房间小程序码（弱一致：失败返回 null，不抛错）
 * @param {string} roomId - room._id
 * @param {string} roomCode - 6 位数字房间号
 * @returns {Promise<string|null>} 云存储 fileID 或 null
 */
async function generateRoomQRCode(roomId, roomCode) {
  try {
    // 1. 调 wxacode.get 生成小程序码 buffer
    //    - get 允许 path 含 query string（不同于 getUnlimited）
    //    - 把 joinCode 放在 path query 里，扫码后 home onLoad 直接收到 options.joinCode
    //    - 重要：scene 在真机调试模式下会被微信替换为 1001 (sourceAppId)，
    //      只有 path query 是开发/测试期间稳定可用的传递方式
    const wxacodeRes = await cloud.openapi.wxacode.get({
      path: `pages/home/index?joinCode=${roomCode}`,
      width: 430,
    });

    // 2. 上传到云存储 qrcodes/{roomId}.png
    const uploadRes = await cloud.uploadFile({
      cloudPath: `qrcodes/${roomId}.png`,
      fileContent: wxacodeRes.buffer,
    });

    // 3. 写回 rooms 文档
    const saved = await db.runTransaction(async transaction => {
      const ref = transaction.collection('rooms').doc(roomId);
      const room = (await ref.get()).data;
      if (!room || room.status !== 'active') return false;
      await ref.update({ data: { qrCodeFileID: uploadRes.fileID } });
      return true;
    });
    if (!saved) {
      await cleanupRoomQRCode(uploadRes.fileID);
      return null;
    }

    return uploadRes.fileID;
  } catch (err) {
    console.error('generateRoomQRCode failed:', err.message);
    return null;
  }
}

/**
 * 清理房间小程序码（best-effort：失败不抛错）
 * 注意：调用方需自行负责清除 rooms.qrCodeFileID 字段
 * @param {string} qrCodeFileID - 云存储 fileID
 */
async function cleanupRoomQRCode(qrCodeFileID) {
  if (!qrCodeFileID) return;
  try {
    await cloud.deleteFile({ fileList: [qrCodeFileID] });
  } catch (err) {
    console.error('cleanupRoomQRCode failed:', err.message);
    // 不抛错：清理失败不应阻塞主流程
  }
}

module.exports = { generateRoomQRCode, cleanupRoomQRCode };
