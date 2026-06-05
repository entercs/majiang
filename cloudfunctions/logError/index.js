const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event) => {
  const { openid } = cloud.getWXContext();
  const { clientId, action, errorCode, errorMsg, stack } = event;
  try {
    await db.collection('errorLogs').add({
      data: {
        openid: openid || null,
        clientId: clientId || null,
        action: action || 'unknown',
        errorCode: errorCode || null,
        errorMsg: errorMsg || '',
        stack: stack || '',
        timestamp: Date.now(),
      }
    });
    return { code: 'OK' };
  } catch (err) {
    console.error('logError failed:', err);
    return { code: 'INTERNAL_ERROR' };
  }
};
