const roomStore = require('../../../stores/roomStore');

Page({
  data: { rankList: [], totalRounds: 0, maxFan: 0, winTypeSummary: '' },

  onShow() {
    const totals = roomStore.getTotalScores();
    const players = roomStore.players;
    const rankList = players
      .map(p => ({ ...p, total: totals[p._id] || 0 }))
      .sort((a, b) => b.total - a.total);

    const totalRounds = roomStore.rounds.length;
    const maxFan = roomStore.rounds.reduce((m, r) => Math.max(m, r.fan), 0);
    const typeCount = {};
    roomStore.rounds.forEach(r => {
      typeCount[r.winType] = (typeCount[r.winType] || 0) + 1;
    });
    const winTypeSummary = Object.entries(typeCount)
      .map(([t, c]) => `${t}×${c}`).join(' / ');

    this.setData({ rankList, totalRounds, maxFan, winTypeSummary });
  },

  onBackHome() {
    roomStore.reset();
    wx.switchTab({ url: '/pages/home/index' });
  },
});
