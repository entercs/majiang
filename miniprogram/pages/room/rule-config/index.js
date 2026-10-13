const roomStore = require('../../../stores/roomStore');
const roomService = require('../../../services/roomService');
const { handleError } = require('../../../services/errorHandler');

const huangmei = require('../../../rules/huangmei');
const CARD_TYPES = huangmei.sections.cardTypes;

const CARD_TYPE_DESCS = {
  pinghu: '最基本的胡牌方式',
  qiyidui: '手牌凑齐7个对子',
  pengpenghu: '全部为刻子（碰牌）的胡牌',
  qingyise: '全部为同一花色的胡牌',
  hunyise: '同一花色+风牌/箭牌的胡牌',
  quanqiuren: '吃碰杠后只剩单张，且全部吃碰别人的牌',
};

// 胡牌方式定义（默认值与 auto-score 的 HM_WIN_TYPES 完全一致）
const WIN_TYPES = [
  { key: 'dianpao',   label: '点炮',     fan: 0 },
  { key: 'zimo',      label: '自摸',     fan: 1 },
  { key: 'caishang',  label: '财上开花', fan: 2 },
  { key: 'gangshang', label: '杠上开花', fan: 5 },
  { key: 'qianggang', label: '抢杠',     fan: 5 },
  { key: 'haidilao',  label: '海底捞月', fan: 5 },
];

const WIN_TYPE_DESCS = {
  dianpao: '点炮者单独付分给胡牌者',
  zimo: '自摸胡牌，3家各付分',
  caishang: '杠牌补花后自摸',
  gangshang: '杠后补牌自摸',
  qianggang: '他人杠牌时抢胡',
  haidilao: '最后一张牌自摸',
};

Page({
  data: {
    cardTypes: [],
    winTypes: [],
    isOwner: false,
  },

  onLoad() {
    const rule = roomStore.rule || {};
    const cardTypeFans = rule.cardTypeFans || {};
    const winTypeFans = rule.winTypeFans || {};
    const isOwner = !!roomStore.isOwner;

    this.setData({
      isOwner,
      cardTypes: CARD_TYPES.map(c => ({
        key: c.key,
        label: c.label,
        desc: CARD_TYPE_DESCS[c.key] || '',
        fan: cardTypeFans[c.key] ?? c.fan,  // 默认值从 CARD_TYPES.fan 取
        readonly: !isOwner,
      })),
      winTypes: WIN_TYPES.map(w => ({
        key: w.key,
        label: w.label,
        desc: WIN_TYPE_DESCS[w.key] || '',
        fan: winTypeFans[w.key] ?? w.fan,  // 默认值从 WIN_TYPES.fan 取
        readonly: !isOwner,
      })),
    });
  },

  _updateCard(key, delta) {
    if (!this.data.isOwner) return;
    const list = this.data.cardTypes.map(c => {
      if (c.key !== key) return c;
      const newFan = Math.max(0, Math.min(100, c.fan + delta));
      return { ...c, fan: newFan };
    });
    this.setData({ cardTypes: list });
  },

  _updateWin(key, delta) {
    if (!this.data.isOwner) return;
    const list = this.data.winTypes.map(w => {
      if (w.key !== key) return w;
      const newFan = Math.max(0, Math.min(100, w.fan + delta));
      return { ...w, fan: newFan };
    });
    this.setData({ winTypes: list });
  },

  onCardMinus(e) { this._updateCard(e.currentTarget.dataset.key, -1); },
  onCardPlus(e)  { this._updateCard(e.currentTarget.dataset.key, 1); },
  onWinMinus(e)  { this._updateWin(e.currentTarget.dataset.key, -1); },
  onWinPlus(e)   { this._updateWin(e.currentTarget.dataset.key, 1); },

  onReset() {
    if (!this.data.isOwner) return;
    wx.showModal({
      title: '恢复默认炮数',
      content: '将恢复默认炮数，点击「应用」后才会保存到房间。确定重置吗？',
      confirmText: '重置',
      cancelText: '取消',
      success: result => {
        if (!result.confirm) return;
        this._resetRuleDraft();
        wx.showToast({ title: '已重置', icon: 'success', duration: 1000 });
      },
    });
  },

  _resetRuleDraft() {
    // 重置到 CARD_TYPES / WIN_TYPES 内置的默认值（单一数据源）
    this.setData({
      cardTypes: this.data.cardTypes.map(c => {
        const def = CARD_TYPES.find(t => t.key === c.key);
        return { ...c, fan: def ? def.fan : c.fan };
      }),
      winTypes: this.data.winTypes.map(w => {
        const def = WIN_TYPES.find(t => t.key === w.key);
        return { ...w, fan: def ? def.fan : w.fan };
      }),
    });
  },

  onCancel() {
    wx.navigateBack();
  },

  onApply() {
    if (!this.data.isOwner) return;
    const cardTypeFans = {};
    this.data.cardTypes.forEach(c => { cardTypeFans[c.key] = c.fan; });
    const winTypeFans = {};
    this.data.winTypes.forEach(w => { winTypeFans[w.key] = w.fan; });

    // 复制时排除系统字段（_id、roomId 等不允许被云端覆盖）
    const { _id, roomId, createdAt, updatedAt, ...restRule } = roomStore.rule || {};
    const updatedRule = { ...restRule };

    // 优化：全等于默认值 → 删除字段（恢复出厂）；否则写入自定义值
    const allCardDefault = this.data.cardTypes.every(c => {
      const def = CARD_TYPES.find(t => t.key === c.key);
      return def && c.fan === def.fan;
    });
    const allWinDefault = this.data.winTypes.every(w => {
      const def = WIN_TYPES.find(t => t.key === w.key);
      return def && w.fan === def.fan;
    });
    if (allCardDefault && allWinDefault) {
      delete updatedRule.cardTypeFans;
      delete updatedRule.winTypeFans;
    } else {
      updatedRule.cardTypeFans = cardTypeFans;
      updatedRule.winTypeFans = winTypeFans;
    }

    wx.showLoading({ title: '保存中...' });
    roomService.updateRule({ roomId: roomStore.roomId, rule: updatedRule })
      .then((res) => {
        wx.hideLoading();
        if (res.code === 'OK') {
          roomStore.setRule(updatedRule);
          wx.showToast({ title: '已保存', icon: 'success' });
          setTimeout(() => wx.navigateBack(), 800);
        } else {
          handleError({ code: res.code, message: res.message }, this);
        }
      })
      .catch((err) => { wx.hideLoading(); handleError(err, this); });
  },
});