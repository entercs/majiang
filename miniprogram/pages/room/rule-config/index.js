const roomStore = require('../../../stores/roomStore');
const roomService = require('../../../services/roomService');
const { validateRule } = require('../../../services/ruleService');
const { handleError } = require('../../../services/errorHandler');

Page({
  data: { rule: {} },

  onLoad() {
    this.setData({ rule: { ...roomStore.rule } });
  },

  onChange(e) {
    const field = e.currentTarget.dataset.field;
    const value = Number(e.detail.value);
    this.setData({ [`rule.${field}`]: value });
  },

  onToggleDianpao(e) {
    this.setData({ 'rule.allowDianpao': e.detail.value });
  },

  onSave() {
    if (!validateRule(this.data.rule)) {
      wx.showToast({ title: '规则字段不合法', icon: 'none' });
      return;
    }
    wx.showLoading({ title: '保存中...' });
    roomService.updateRule({ roomId: roomStore.roomId, rule: this.data.rule })
      .then((res) => {
        wx.hideLoading();
        if (res.code === 'OK') {
          roomStore.setRule(this.data.rule);
          wx.showToast({ title: '已保存' });
          setTimeout(() => wx.navigateBack(), 800);
        } else {
          handleError({ code: res.code, message: res.message }, this);
        }
      })
      .catch(err => { wx.hideLoading(); handleError(err, this); });
  },
});
