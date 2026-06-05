// Lazy getter for cloud database (avoid blocking at require time)
function getDb() {
  return wx.cloud.database();
}

function getOrCreateAnonymousUser() {
  let clientId = wx.getStorageSync('clientId');
  if (!clientId) {
    clientId = 'cli_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);
    wx.setStorageSync('clientId', clientId);
  }
  return { clientId, isAnonymous: true };
}

async function loginWithWx() {
  // 1. wx.login
  const loginRes = await new Promise((resolve, reject) => {
    wx.login({ success: resolve, fail: reject });
  });
  const code = loginRes.code;
  if (!code) throw new Error('wx.login 失败');

  // 2. getOpenid via cloud
  const { result } = await wx.cloud.callFunction({ name: 'getOpenid' });
  if (!result || !result.openid) throw new Error('获取 openid 失败');

  const openid = result.openid;

  // 3. Upsert users
  const db = getDb();
  const userRes = await db.collection('users').where({ _openid: openid }).limit(1).get();
  if (userRes.data.length === 0) {
    await db.collection('users').add({ data: { _openid: openid, createdAt: Date.now() } });
  }

  wx.setStorageSync('openid', openid);
  return { openid, isAnonymous: false };
}

function getProfile() {
  return {
    clientId: wx.getStorageSync('clientId') || '',
    openid: wx.getStorageSync('openid') || '',
    isAnonymous: !wx.getStorageSync('openid'),
  };
}

module.exports = { getOrCreateAnonymousUser, loginWithWx, getProfile, getDb };
