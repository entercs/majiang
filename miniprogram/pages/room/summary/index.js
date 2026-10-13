const roomStore = require('../../../stores/roomStore');

Page({
  data: {
    rankList: [],
    totalRounds: 0,
    maxFan: 0,
    winTypeSummary: '',
    isReadonly: false,
  },

  onLoad(query) {
    if (query.roomId) {
      this.setData({ isReadonly: query.readonly === '1' });
      this._loadFromCloud(query.roomId);
    } else {
      this._render();
    }
  },

  onShow() {
    if (!this.data.isReadonly) {
      this._render();
    }
  },

  // 来自 roomStore（房间内结束后跳转）
  _render() {
    const totals = roomStore.getTotalScores();
    const players = roomStore.players;
    const rankList = players
      .map(p => ({ ...p, total: totals[p._id] || 0 }))
      .sort((a, b) => b.total - a.total);

    this.setData({
      rankList,
      ...this._calcStats(roomStore.rounds),
    });
  },

  // 来自云端（首页"已结束"直接查看战绩）
  _loadFromCloud(roomId) {
    const roomService = require('../../../services/roomService');
    roomService.getRoomSnapshot(roomId).then(({ players, rounds }) => {
      // 算总分
      const totals = {};
      players.forEach(p => { totals[p._id] = 0; });
      rounds.forEach(r => {
        Object.entries(r.scoreChanges || {}).forEach(([pid, delta]) => {
          totals[pid] = (totals[pid] || 0) + Number(delta || 0);
        });
      });

      const rankList = players
        .map(p => ({ ...p, total: totals[p._id] || 0 }))
        .sort((a, b) => b.total - a.total);

      this.setData({ rankList, ...this._calcStats(rounds) });
    }).catch((err) => {
      console.error('summary load error:', err);
      wx.showToast({ title: '加载失败', icon: 'none' });
    });
  },

  _calcStats(rounds) {
    const totalRounds = rounds.length;
    const maxFan = rounds.reduce((m, r) => Math.max(m, r.fan || 0), 0);
    const typeCount = {};
    rounds.forEach(r => {
      const t = r.winType || (r.type === 'manual' ? '手动' : r.type);
      if (t) typeCount[t] = (typeCount[t] || 0) + 1;
    });
    const winTypeSummary = Object.entries(typeCount)
      .map(([t, c]) => `${t}×${c}`).join(' / ');
    return { totalRounds, maxFan, winTypeSummary };
  },

  onBackHome() {
    if (!this.data.isReadonly) {
      roomStore.reset();
    }
    wx.reLaunch({ url: '/pages/home/index' });
  },
});
