const { callFunction } = require('../services/cloud');

let reported = 0;
const MAX_REPORTS_PER_SESSION = 50;

function reportError(action, err) {
  if (reported >= MAX_REPORTS_PER_SESSION) return;
  reported++;
  const payload = {
    clientId: (getApp() && getApp().globalData && getApp().globalData.clientId) || '',
    action,
    errorCode: err && err.code,
    errorMsg: err && (err.message || err.toString()),
    stack: err && err.stack,
  };
  // 失败不重试
  callFunction('logError', payload).catch(() => {});
}

module.exports = { reportError };
