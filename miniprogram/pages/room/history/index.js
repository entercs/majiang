const roomStore = require('../../../stores/roomStore');
const { groupRoundsBySession, formatDateTime, formatTime, roundToTransfers } = require('../../../utils/roundGrouping');

Page({
  data: {
    groups: [],
  },

  onShow() {
    this._render();
    // 房间同步仍在运行，刷新新记录。
    if (this._timer) clearInterval(this._timer);
    this._timer = setInterval(() => this._render(), 1000);
  },

  onHide() {
    if (this._timer) { clearInterval(this._timer); this._timer = null; }
  },

  onUnload() {
    if (this._timer) { clearInterval(this._timer); this._timer = null; }
  },

  _render() {
    const groups = groupRoundsBySession(roomStore.rounds);
    const enriched = groups.map(g => {
      const nameOf = (id) => {
        const p = roomStore.players.find((x) => x._id === id);
        return p ? p.nickname : id;
      };
      const transfers = g.items.flatMap(r => roundToTransfers(r, nameOf).map((transfer, index) => ({
        ...transfer,
        id: `${r._id}-${index}`,
      })));
      return {
        startTime: g.startTime,
        endTime: g.endTime,
        timeText: `${formatDateTime(g.startTime)}:${formatTime(g.startTime).slice(-2)}`,
        transfers,
      };
    });

    // 最新时间组显示在最上方。
    this.setData({ groups: enriched.reverse() });
  },

});
