const roomService = require('../../../services/roomService');
const { handleError } = require('../../../services/errorHandler');
const roomStore = require('../../../stores/roomStore');
const { groupRoundsBySession, formatDateTime, formatTime, roundToTransfers } = require('../../../utils/roundGrouping');

Page({
  data: {
    groups: [],
    loading: false,
    historyError: false,
  },

  onShow() {
    this._visible = true;
    this._loadHistory();
    this._render();
    // 房间同步仍在运行，刷新新记录。
    if (this._timer) clearInterval(this._timer);
    this._timer = setInterval(() => this._render(), 1000);
  },

  onHide() {
    this._visible = false;
    if (this._timer) { clearInterval(this._timer); this._timer = null; }
  },

  onUnload() {
    this._visible = false;
    if (this._timer) { clearInterval(this._timer); this._timer = null; }
  },

  _loadHistory() {
    if (roomStore.historyComplete || this._historyRequest) return;
    const roomId = roomStore.roomId;
    this.setData({ loading: true, historyError: false });
    this._historyRequest = roomService.getRoomSnapshot(roomId).then(snapshot => {
      if (roomStore.roomId !== roomId) return;
      // 请求期间新提交的记录继续保留；历史只读，不覆盖总分摘要。
      roomStore.mergeRounds(snapshot.rounds);
      roomStore.historyComplete = true;
      if (this._visible) this._render();
    }).catch(err => { if (this._visible) { this.setData({ historyError: true }); handleError(err, this); } })
      .finally(() => { this._historyRequest = null; if (this._visible) this.setData({ loading: false }); });
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
