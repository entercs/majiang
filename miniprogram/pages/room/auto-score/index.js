const roomStore = require('../../../stores/roomStore');
const roundService = require('../../../services/roundService');
const { handleError } = require('../../../services/errorHandler');
const { generateTempId } = require('../../../utils/cloud-id');

const WIN_TYPE_LABELS = {
  zimo: '自摸',
  dianpao: '点炮',
};

Page({
  data: {
    otherPlayers: [],     // 排除自己
    targetId: '',
    targetName: '',
    winType: 'zimo',      // 默认自摸
    winTypeLabel: '自摸',
    amount: 0,            // 计算的金额（番数固定 1，后续完善）
    canApply: false,
  },

  onLoad() {
    // 守卫：必须先在房间里
    if (!roomStore.roomId || !roomStore.currentPlayerId) {
      wx.showModal({
        title: '提示',
        content: '你不是这个房间的玩家，无法记分。',
        showCancel: false,
        success: () => wx.navigateBack(),
      });
      return;
    }
    const me = roomStore.players.find(p => p._id === roomStore.currentPlayerId);
    if (!me) {
      wx.navigateBack();
      return;
    }
    // 排除自己
    const otherPlayers = roomStore.players
      .filter(p => p._id !== roomStore.currentPlayerId)
      .sort((a, b) => a.seatIndex - b.seatIndex);
    this.setData({ otherPlayers });
  },

  onSelectTarget(e) {
    const id = e.currentTarget.dataset.id;
    const target = this.data.otherPlayers.find(p => p._id === id);
    this.setData({
      targetId: id,
      targetName: target ? target.nickname : '',
    });
    this._recompute();
  },

  onSelectWinType(e) {
    const winType = e.currentTarget.dataset.type;
    this.setData({ winType, winTypeLabel: WIN_TYPE_LABELS[winType] || winType });
    this._recompute();
  },

  // 简化版算分：底分 × 倍数 × 1 番
  // 完整规则（番数、杠分、买马等）后续完善
  _recompute() {
    const rule = roomStore.rule || { baseScore: 1, zimoMul: 2, dianpaoMul: 1 };
    const mul = this.data.winType === 'zimo' ? rule.zimoMul : rule.dianpaoMul;
    const amount = (rule.baseScore || 1) * mul * 1;
    const canApply = !!(this.data.targetId && this.data.winType);
    this.setData({ amount, canApply });
  },

  onApply() {
    if (!this.data.canApply) {
      wx.showToast({ title: '请选完再应用', icon: 'none' });
      return;
    }
    // 构造 round 输入：我是 loser，target 是 winner
    const input = {
      winnerId: this.data.targetId,
      winType: this.data.winType,
      fan: 1,
      gangEvents: [],
      maResults: [],
    };
    // 点炮场景：把我也带上让云函数知道 loser 是谁
    if (this.data.winType === 'dianpao') {
      input.loserId = roomStore.currentPlayerId;
    }
    const clientId = 'auto_' + generateTempId();
    wx.showLoading({ title: '应用中...' });
    roundService.submitRound({
      roomId: roomStore.roomId,
      clientId,
      type: 'auto',
      input,
    }).then((res) => {
      wx.hideLoading();
      if (res.code === 'OK') {
        wx.showToast({ title: '已应用', icon: 'success' });
        setTimeout(() => wx.navigateBack(), 600);
      } else {
        handleError({ code: res.code, message: res.message }, this);
      }
    }).catch(err => { wx.hideLoading(); handleError(err, this); });
  },
});