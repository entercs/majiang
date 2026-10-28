const cache = new Map();
const inflight = new Map();
const MAX_CACHE = 20;
function cached(fileID) { return cache.get(fileID) || ''; }
function invalidate(fileID) { cache.delete(fileID); }
function preload(fileID) {
  if (!fileID) return Promise.resolve('');
  if (cache.has(fileID)) return Promise.resolve(cache.get(fileID));
  if (inflight.has(fileID)) return inflight.get(fileID);
  if (!wx.cloud || !wx.cloud.downloadFile) return Promise.resolve(fileID);
  const request = wx.cloud.downloadFile({ fileID }).then(res => {
    if (!res.tempFilePath) throw new Error('二维码下载失败');
    cache.set(fileID, res.tempFilePath);
    if (cache.size > MAX_CACHE) cache.delete(cache.keys().next().value);
    return res.tempFilePath;
  }).finally(() => inflight.delete(fileID));
  inflight.set(fileID, request);
  return request;
}
// 创建时至多等待一段预下载时间。超时后继续进房，不阻塞使用。
function prepare(fileID, timeoutMs = 1200) {
  let timer;
  return Promise.race([preload(fileID).catch(() => ''),
    new Promise(resolve => { timer = setTimeout(() => resolve(''), timeoutMs); })])
    .finally(() => clearTimeout(timer));
}
module.exports = { preload, prepare, cached, invalidate };
