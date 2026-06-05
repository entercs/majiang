const { ERR_CODE } = require('../utils/constants');

const MESSAGE_MAP = {
  [ERR_CODE.ROOM_NOT_FOUND]: { toast: '房间号不存在', redirectHome: true },
  [ERR_CODE.ROOM_FULL]: { toast: '房间已满' },
  [ERR_CODE.ROOM_FINISHED]: { toast: '本局已结束' },
  [ERR_CODE.NOT_IN_ROOM]: { toast: '你不在该房间中' },
  [ERR_CODE.INVALID_INPUT]: { toast: '输入有误', modal: true, useMessage: true },
  [ERR_CODE.FAN_EXCEEDS_MAX]: { toast: '番数超出封顶', useMessage: true },
  [ERR_CODE.GANG_COUNT_EXCEEDS]: { toast: '杠数过多', useMessage: true },
  [ERR_CODE.INTERNAL_ERROR]: { toast: '系统繁忙，请稍后重试' },
};

function handleError(err, pageCtx) {
  const config = MESSAGE_MAP[err.code] || { toast: err.message || '未知错误' };
  // 如果云函数返回了具体 message，且配置允许用 message，则优先用 message（更具体）
  const display = (config.useMessage && err.message) ? err.message : config.toast;

  if (pageCtx && pageCtx.setData) {
    pageCtx.setData({ error: display });
  }

  if (config.modal) {
    wx.showModal({ title: '提示', content: display + (err.detail && !display.includes(err.detail) ? `: ${err.detail}` : ''), showCancel: false });
  } else {
    wx.showToast({ title: display, icon: 'none' });
  }

  if (config.redirectHome && pageCtx) {
    setTimeout(() => {
      wx.switchTab({ url: '/pages/home/index' });
    }, 1500);
  }

  return config;
}

module.exports = { handleError, MESSAGE_MAP };
