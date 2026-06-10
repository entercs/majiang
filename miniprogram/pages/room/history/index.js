const roomStore = require('../../../stores/roomStore');
const { groupRoundsBySession, isOngoing, formatTime, roundToTransfers } = require('../../../utils/roundGrouping');

Page({
  data: {
    groups: [],
  },

  onShow() {
    this._render();
    // 每秒刷新（让"进行中"标记保持最新）
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
    const now = Date.now();
    const ongoing = isOngoing(groups, now);

    const enriched = groups.map((g, idx) => {
      const nameOf = (id) => {
        const p = roomStore.players.find((x) => x._id === id);
        return p ? p.nickname : id;
      };
      const transfers = g.items.flatMap((r) => roundToTransfers(r, nameOf));
      const isLast = g === groups[groups.length - 1];
      return {
        startTime: g.startTime,
        endTime: g.endTime,
        timeText: formatTime(g.startTime),
        ongoing: isLast && ongoing,
        transfers,
        // roundNo 按时间顺序编号（reverse 前 idx=0 是最老的一局）
        roundNo: idx + 1,
      };
    });

    // 倒序展示（最新一局在最上），reverse 后 roundNo 自动变成反序（最新局号最大）
    this.setData({ groups: enriched.reverse() });
  },

  onTapSession(e) {
    // 暂不展开/折叠；MVP 直接全展开
  },
});
