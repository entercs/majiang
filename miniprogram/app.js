App({
  globalData: {
    cloudEnvId: 'majing-d6gx0f5mm301172e1', // 云开发环境 ID
    clientId: '',
    pendingJoinCode: '',  // 扫码带过来的房间号，由 onLaunch/onShow 写入，home 页消费后清空
  },

  onLaunch(options) {
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

    // 扫码带 scene → 暂存给首页消费
    // 注意：scene 不一定是房间号，也可能是微信 sourceAppId（1001=扫一扫、1007=转发等）
    // 只有 6 位数字才算房间号
    if (options && options.scene && /^\d{6}$/.test(String(options.scene))) {
      this.globalData.pendingJoinCode = String(options.scene);
    }
  },

  onShow(options) {
    // 扫码从后台唤醒也会走这里（同样需要 6 位数字过滤）
    if (options && options.scene && /^\d{6}$/.test(String(options.scene))) {
      this.globalData.pendingJoinCode = String(options.scene);
    }
  },

  onError(err) {
    console.error('App onError:', err);
    const { reportError } = require('./utils/logger');
    reportError('app.onError', err);
  },
})