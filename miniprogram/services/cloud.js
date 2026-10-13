/**
 * Unified WeChat Cloud Development wrapper
 * - callFunction: invoke cloud function (with error normalization)
 * - watch: subscribe to database changes
 */

function callFunction(name, data = {}) {
  return wx.cloud.callFunction({ name, data })
    .then((res) => {
      if (res.result && res.result.code && res.result.code !== 'OK') {
        const err = new Error(res.result.message || '云函数错误');
        err.code = res.result.code;
        err.detail = res.result.detail;
        err.requestId = res.requestID || res.requestId;
        throw err;
      }
      return res.result;
    }).catch((error) => {
      const err = error instanceof Error ? error : new Error(error.errMsg || error.message || '云函数调用失败');
      err.code = err.code || error.code || error.errCode;
      err.detail = err.detail || error.detail;
      err.requestId = err.requestId || error.requestId || error.requestID;
      // 不打印调用参数，避免身份凭据进入调试日志。
      console.error('[cloud.callFunction]', { name, code: err.code, message: err.message, requestId: err.requestId });
      throw err;
    });
}

/**
 * Subscribe to a collection's changes
 * @param {string} collection
 * @param {Object} query - e.g. { _id, roomId, ... }
 * @param {Function} onChange - (snapshot) => void
 * @returns {Function} stop watching function
 */
function watch(collection, query, onChange) {
  const db = wx.cloud.database();
  const watcher = db.collection(collection).where(query).watch({
    onChange: (snapshot) => onChange(snapshot),
    onError: (err) => console.error(`watch ${collection} error:`, err),
  });
  return () => watcher.close();
}

function getOpenid() {
  return wx.cloud.callFunction({ name: 'getOpenid' })
    .then((res) => res.result.openid);
}

module.exports = { callFunction, watch, getOpenid };
