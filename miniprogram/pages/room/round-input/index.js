const roomStore = require('../../../stores/roomStore');
const appStore = require('../../../stores/appStore');
const roundService = require('../../../services/roundService');
const { calculateRound } = require('../../../services/scoreService');
const { handleError } = require('../../../services/errorHandler');
const { DIANPAO_TYPES } = require('../../../utils/constants');

Page({
  data: {
    players: [],
    otherPlayers: [],
    winnerId: '',
    loserId: '',
    winType: 'zimo',
    fan: 1,
    gangEvents: [],
    rule: {},
    needsLoser: false,
    canAddGang: true,
  },

  onLoad() {
    const players = roomStore.players.slice().sort((a, b) => a.seatIndex - b.seatIndex);
    // 客户端预检查：人数不足 4 人时弹窗提示
    if (players.length < 4) {
      wx.showModal({
        title: '人数不足',
        content: `当前房间有 ${players.length} 名玩家，需要 4 人才能开始记录。\n\n请其他玩家使用「加入牌局」功能输入房间号加入。`,
        confirmText: '返回房间',
        showCancel: false,
        success: () => {
          setTimeout(() => wx.navigateBack(), 100);
        },
      });
    }
    this.setData({
      players,
      otherPlayers: players,
      rule: roomStore.rule,
    });
  },

  onSelectWinner(e) {
    const id = e.currentTarget.dataset.id;
    const otherPlayers = this.data.players.filter(p => p._id !== id);
    this.setData({ winnerId: id, otherPlayers });
  },

  onSelectLoser(e) {
    this.setData({ loserId: e.currentTarget.dataset.id });
  },

  onChangeWinType(e) {
    const winType = e.detail.value;
    const needsLoser = DIANPAO_TYPES.has(winType);
    this.setData({ winType, needsLoser, loserId: '' });
  },

  onSelectType(e) {
    const winType = e.currentTarget.dataset.type;
    const needsLoser = DIANPAO_TYPES.has(winType);
    this.setData({ winType, needsLoser, loserId: '' });
  },

  onChangeFan(e) {
    this.setData({ fan: Number(e.detail.value) || 0 });
  },

  onAddGang() {
    wx.showActionSheet({
      itemList: ['明杠（抓牌）', '暗杠', '补杠'],
      success: (res) => {
        const types = ['ming', 'an', 'bu'];
        const type = types[res.tapIndex];
        const playerNames = this.data.players.map(p => p.nickname);
        wx.showActionSheet({
          itemList: playerNames,
          success: (res2) => {
            const playerId = this.data.players[res2.tapIndex]._id;
            this.setData({ gangEvents: [...this.data.gangEvents, { type, playerId }] });
          },
        });
      },
    });
  },

  onRemoveGang(e) {
    const idx = e.currentTarget.dataset.index;
    const gangEvents = this.data.gangEvents.filter((_, i) => i !== idx);
    this.setData({ gangEvents });
  },

  getPlayerName(id) {
    const p = this.data.players.find(x => x._id === id);
    return p ? p.nickname : '';
  },

  onSubmit() {
    if (!this.data.winnerId) {
      wx.showToast({ title: '请选择胡牌者', icon: 'none' });
      return;
    }
    if (this.data.needsLoser && !this.data.loserId) {
      wx.showToast({ title: '请选择点炮者', icon: 'none' });
      return;
    }
    if (this.data.fan < 0 || this.data.fan > 100) {
      wx.showToast({ title: '番数 0-100', icon: 'none' });
      return;
    }

    const input = {
      winnerId: this.data.winnerId,
      loserId: this.data.needsLoser ? this.data.loserId : undefined,
      winType: this.data.winType,
      fan: this.data.fan,
      gangEvents: this.data.gangEvents,
      maResults: [],
    };

    // Optimistic update
    const tempRound = {
      _id: 'temp_' + Date.now(),
      roomId: roomStore.roomId,
      roundIndex: (roomStore.rounds[roomStore.rounds.length - 1]?.roundIndex || 0) + 1,
      ...input,
      scoreChanges: calculateLocalPreview(this.data.rule, input, this.data.players),
      createdAt: Date.now(),
      isOptimistic: true,
    };
    roomStore.addRound(tempRound);
    wx.showLoading({ title: '提交中...' });

    roundService.submitRound({
      roomId: roomStore.roomId,
      clientId: appStore.clientId,
      input,
    }).then((res) => {
      wx.hideLoading();
      if (res.code === 'OK') {
        roomStore.rounds = roomStore.rounds.filter(r => r._id !== tempRound._id);
        roomStore.addRound(res.data);
        wx.showToast({ title: '已记录' });
        setTimeout(() => wx.navigateBack(), 800);
      } else {
        roomStore.rounds = roomStore.rounds.filter(r => r._id !== tempRound._id);
        handleError({ code: res.code, message: res.message }, this);
      }
    }).catch((err) => {
      roomStore.rounds = roomStore.rounds.filter(r => r._id !== tempRound._id);
      wx.hideLoading();
      handleError(err, this);
    });
  },
});

function calculateLocalPreview(rule, input, players) {
  try {
    return calculateRound(rule, input, players).scoreChanges;
  } catch (e) {
    return {};
  }
}
