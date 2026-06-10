const roomStore = require('../../../stores/roomStore');
const roundService = require('../../../services/roundService');
const { calculateRound } = require('../../../services/scoreService');
const { handleError } = require('../../../services/errorHandler');
const { generateTempId } = require('../../../utils/cloud-id');
const { DIANPAO_TYPES } = require('../../../utils/constants');

Page({
  data: {
    players: [],
    otherPlayers: [],
    winnerId: '',
    loserId: '',
    winType: 'zimo',
    fan: 1,
    needsLoser: false,
    preview: [],
    previewDelta: {},
  },

  onLoad() {
    // 守卫：必须先在房间里才能进入此页
    if (!roomStore.roomId || !roomStore.currentPlayerId) {
      wx.showModal({
        title: '提示',
        content: '你不是这个房间的玩家，无法记分。',
        showCancel: false,
        success: () => wx.navigateBack(),
      });
      return;
    }
    const players = roomStore.players.slice().sort((a, b) => a.seatIndex - b.seatIndex);
    this.setData({
      players,
      otherPlayers: players.filter(p => p._id !== this.data.winnerId),
      rule: roomStore.rule,
    });
  },

  onSelectWinner(e) {
    const id = e.currentTarget.dataset.id;
    this.setData({
      winnerId: id,
      otherPlayers: this.data.players.filter(p => p._id !== id),
      loserId: '',
      preview: [],
    });
  },

  onSelectWinType(e) {
    const winType = e.currentTarget.dataset.type;
    const needsLoser = DIANPAO_TYPES.has(winType);
    this.setData({ winType, needsLoser, loserId: '', preview: [] });
  },

  onSelectLoser(e) {
    this.setData({ loserId: e.currentTarget.dataset.id, preview: [] });
  },

  onChangeFan(e) {
    const fan = Number(e.detail.value) || 0;
    this.setData({ fan, preview: [] });
  },

  onCalculate() {
    if (!this.data.winnerId) {
      wx.showToast({ title: '请选择胡牌者', icon: 'none' });
      return;
    }
    if (this.data.needsLoser && !this.data.loserId) {
      wx.showToast({ title: '请选择点炮者', icon: 'none' });
      return;
    }
    if (this.data.fan < 0) {
      wx.showToast({ title: '番数不能为负', icon: 'none' });
      return;
    }

    const input = {
      winnerId: this.data.winnerId,
      loserId: this.data.needsLoser ? this.data.loserId : undefined,
      winType: this.data.winType,
      fan: this.data.fan,
      gangEvents: [],
      maResults: [],
    };

    try {
      const { scoreChanges, isBalanced } = calculateRound(roomStore.rule, input, this.data.players);
      if (!isBalanced) {
        wx.showToast({ title: '分数计算不平衡', icon: 'none' });
        return;
      }
      const preview = this.data.players.map(p => ({
        _id: p._id,
        nickname: p.nickname,
        delta: scoreChanges[p._id] || 0,
      }));
      this.setData({ preview, previewDelta: scoreChanges });
    } catch (e) {
      handleError(e, this);
    }
  },

  onApply() {
    if (this.data.preview.length === 0) {
      wx.showToast({ title: '请先点计算', icon: 'none' });
      return;
    }
    const input = {
      winnerId: this.data.winnerId,
      loserId: this.data.needsLoser ? this.data.loserId : undefined,
      winType: this.data.winType,
      fan: this.data.fan,
      gangEvents: [],
      maResults: [],
    };
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
        setTimeout(() => wx.navigateBack(), 800);
      } else {
        handleError({ code: res.code, message: res.message }, this);
      }
    }).catch(err => { wx.hideLoading(); handleError(err, this); });
  },
});
