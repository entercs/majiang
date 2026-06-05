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
        throw err;
      }
      return res.result;
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
