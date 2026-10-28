const { callFunction } = require('../services/cloud');

let reported = 0;
const recent = new Map();
const MAX_REPORTS_PER_SESSION = 50;

function reportError(action, err) {
  const signature = JSON.stringify([action, err && err.code, err && (err.message || String(err))]);
  if (recent.has(signature) && Date.now() - recent.get(signature) < 60000) return;
  if (reported >= MAX_REPORTS_PER_SESSION) return;
  recent.set(signature, Date.now());
  if (recent.size > 100) recent.delete(recent.keys().next().value);
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
