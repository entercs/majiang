App({
  globalData: {
    cloudEnvId: 'majing-d6gx0f5mm301172e1', // 云开发环境 ID
    clientId: '',
  },

  onLaunch() {
    // 初始化云开发
    if (!wx.cloud) {
      console.error('当前微信版本过低，请升级到最新微信')
      return
    }
    wx.cloud.init({
      env: this.globalData.cloudEnvId,
      traceUser: true,
    })

    // 生成本次会话的 clientId
    let clientId = wx.getStorageSync('clientId')
    if (!clientId) {
      clientId = 'cli_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10)
      wx.setStorageSync('clientId', clientId)
    }
    this.globalData.clientId = clientId
  },

  onError(err) {
    console.error('App onError:', err);
    const { reportError } = require('./utils/logger');
    reportError('app.onError', err);
  },
})
