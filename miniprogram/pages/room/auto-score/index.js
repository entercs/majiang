const roomStore = require('../../../stores/roomStore');
const roundService = require('../../../services/roundService');
const { handleError } = require('../../../services/errorHandler');
const { generateTempId } = require('../../../utils/cloud-id');

// ============== 玩法常量（黄梅麻将） ==============

const RULE_TYPES = ['黄梅麻将'];

const BASIC_TYPES = [
  { key: 'pinghu', label: '平胡', fan: 1 },
  { key: 'qiyidui', label: '七一对', fan: 15 },
  { key: 'pengpenghu', label: '碰碰胡', fan: 15 },
  { key: 'qingyise', label: '清一色', fan: 15 },
  { key: 'hunyise', label: '混一色', fan: 15 },
  { key: 'quanqiuren', label: '全求人', fan: 30 },
];

const WIN_TYPES = [
  { key: 'dianpao', label: '点炮', fan: 0 },
  { key: 'zimo', label: '自摸', fan: 1 },
  { key: 'caishang', label: '财上开花', fan: 2 },
  { key: 'gangshang', label: '杠上开花', fan: 5 },
  { key: 'qianggang', label: '抢杠', fan: 5 },
  { key: 'haidilao', label: '海底捞月', fan: 5 },
];

const HONGZHONG_OPTIONS = [
  { key: 'none', label: '无', fan: 0 },
  { key: 'peng', label: '碰红中', fan: 1 },
  { key: 'anke', label: '暗刻红中', fan: 2 },
  { key: 'minggang', label: '明杠红中', fan: 3 },
  { key: 'anggang', label: '暗杠红中', fan: 4 },
];

const BAIBAN_OPTIONS = [
  { key: 'none', label: '无', fan: 0 },
  { key: 'peng', label: '碰白板', fan: 1 },
  { key: 'anke', label: '暗刻白板', fan: 2 },
  { key: 'minggang', label: '明杠白板', fan: 3 },
  { key: 'anggang', label: '暗杠白板', fan: 4 },
];

const MENQING_OPTIONS = [
  { key: 'none', label: '无', fan: 0 },
  { key: 'menqianqing', label: '门前清', fan: 1 },
  { key: 'kadang', label: '卡档', fan: 1 },
  { key: 'bianzhang', label: '边张', fan: 1 },
  { key: 'diandiao', label: '单吊', fan: 1 },
];

// 大牌组合：basicType 多选配对 → 额外 +15 番
const BIG_HAND_BONUSES = [
  { items: ['qingyise', 'pengpenghu'], name: '清一色·碰碰胡' },
  { items: ['hunyise', 'pengpenghu'], name: '混一色·碰碰胡' },
  { items: ['qingyise', 'qiyidui'], name: '清一色·七一对' },
  { items: ['hunyise', 'qiyidui'], name: '混一色·七一对' },
];

// 互斥：七一对/全求人 → 禁用门清与听牌型
const DISABLE_MENQING_BASIC = ['qiyidui', 'quanqiuren'];

// 找选项的辅助
const _find = (arr, key) => arr.find(o => o.key === key);

// ============== 页面 ==============

Page({
  data: {
    ruleTypes: RULE_TYPES,
    ruleTypeIndex: 0,
    baseScore: 1,
    totalFan: 0,
    canHu: false,
    canHuText: '请选择基础牌型和胡牌方式',

    basicTypes: BASIC_TYPES,
    basicType: 'pinghu',

    winTypes: WIN_TYPES,
    winType: 'dianpao',

    facaiCount: 0,
    mingGangCount: 0,
    anGangCount: 0,

    hongZhongOptions: HONGZHONG_OPTIONS,
    hongZhong: 'none',

    baiBanOptions: BAIBAN_OPTIONS,
    baiBan: 'none',

    menqingOptions: MENQING_OPTIONS,
    menqing: 'none',
    menqingDisabled: false,

    otherPlayers: [],
    targetId: '',
    targetName: '',

    fanBreakdown: [],
    amount: 0,
    canApply: false,
  },

  onLoad() {
    if (!roomStore.roomId || !roomStore.currentPlayerId) {
      wx.showModal({
        title: '提示',
        content: '你不是这个房间的玩家，无法记分。',
        showCancel: false,
        success: () => wx.navigateBack(),
      });
      return;
    }
    const otherPlayers = roomStore.players
      .filter(p => p._id !== roomStore.currentPlayerId)
      .sort((a, b) => a.seatIndex - b.seatIndex);
    this.setData({ otherPlayers });
    this._recompute();
  },

  onRuleTypeChange(e) {
    this.setData({ ruleTypeIndex: Number(e.detail.value) });
    // 当前只有 1 个选项，无需重置数据
  },

  onBaseScoreChange(e) {
    const n = Number(e.detail.value);
    if (Number.isFinite(n) && n >= 0) {
      this.setData({ baseScore: n });
      this._recompute();
    }
  },

  onBasicTypeChange(e) {
    const newType = e.detail.value;
    // 互斥：七一对/全求人 → 清空门清 + 禁用
    if (DISABLE_MENQING_BASIC.includes(newType)) {
      this.setData({ basicType: newType, menqing: 'none', menqingDisabled: true });
    } else {
      this.setData({ basicType: newType, menqingDisabled: false });
    }
    this._recompute();
  },

  onWinTypeChange(e) {
    this.setData({ winType: e.detail.value });
    this._recompute();
  },

  onFacaiMinus() {
    if (this.data.facaiCount > 0) this.setData({ facaiCount: this.data.facaiCount - 1 }, () => this._recompute());
  },
  onFacaiPlus() {
    if (this.data.facaiCount < 4) this.setData({ facaiCount: this.data.facaiCount + 1 }, () => this._recompute());
  },

  onMingGangMinus() {
    if (this.data.mingGangCount > 0) this.setData({ mingGangCount: this.data.mingGangCount - 1 }, () => this._recompute());
  },
  onMingGangPlus() {
    if (this.data.mingGangCount < 3) this.setData({ mingGangCount: this.data.mingGangCount + 1 }, () => this._recompute());
  },

  onAnGangMinus() {
    if (this.data.anGangCount > 0) this.setData({ anGangCount: this.data.anGangCount - 1 }, () => this._recompute());
  },
  onAnGangPlus() {
    if (this.data.anGangCount < 3) this.setData({ anGangCount: this.data.anGangCount + 1 }, () => this._recompute());
  },

  onHongZhongChange(e) {
    this.setData({ hongZhong: e.detail.value });
    this._recompute();
  },

  onBaiBanChange(e) {
    this.setData({ baiBan: e.detail.value });
    this._recompute();
  },

  onMenqingChange(e) {
    if (this.data.menqingDisabled) return;
    this.setData({ menqing: e.detail.value });
    this._recompute();
  },

  onTargetChange(e) {
    const id = e.currentTarget.dataset.id;
    const target = this.data.otherPlayers.find(p => p._id === id);
    this.setData({ targetId: id, targetName: target ? target.nickname : '' });
    this._recompute();
  },

  onReset() {
    this.setData({
      baseScore: 1,
      basicType: 'pinghu',
      winType: 'dianpao',
      facaiCount: 0,
      mingGangCount: 0,
      anGangCount: 0,
      hongZhong: 'none',
      baiBan: 'none',
      menqing: 'none',
      menqingDisabled: false,
      targetId: '',
      targetName: '',
    });
    this._recompute();
  },

  onApply() {
    if (!this.data.canApply) {
      wx.showToast({ title: this.data.canHu ? '请选付给谁' : '总番数不足2番，不能胡', icon: 'none' });
      return;
    }
    // 手动 type 提交：scoreChanges = { winner: +amount, me: -amount }
    const amount = this.data.amount;
    const me = roomStore.players.find(p => p._id === roomStore.currentPlayerId);
    const targetId = this.data.targetId;
    const scoreChanges = { [targetId]: amount, [me._id]: -amount };
    const clientId = 'auto_' + generateTempId();
    wx.showLoading({ title: '应用中...' });
    roundService.submitRound({
      roomId: roomStore.roomId,
      clientId,
      playerId: roomStore.currentPlayerId,
      type: 'manual',
      scoreChanges,
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

  // 计算番数 + 金额 + 可胡 + 可应用
  _recompute() {
    const breakdown = [];

    // 1) 基础牌型
    const basic = _find(BASIC_TYPES, this.data.basicType);
    if (basic && basic.fan > 0) breakdown.push({ name: basic.label, fan: basic.fan });

    // 2) 胡牌方式
    const win = _find(WIN_TYPES, this.data.winType);
    if (win && win.fan > 0) breakdown.push({ name: win.label, fan: win.fan });

    // 3) 发财
    const facai = this.data.facaiCount;
    if (facai > 0) {
      const facaiFan = facai === 4 ? 8 : facai;
      breakdown.push({ name: `发财×${facai}`, fan: facaiFan });
    }

    // 4) 明杠 / 暗杠
    if (this.data.mingGangCount > 0) {
      breakdown.push({ name: `明杠数牌×${this.data.mingGangCount}`, fan: this.data.mingGangCount });
    }
    if (this.data.anGangCount > 0) {
      breakdown.push({ name: `暗杠数牌×${this.data.anGangCount}`, fan: this.data.anGangCount * 2 });
    }

    // 5) 红中 / 白板
    const hz = _find(HONGZHONG_OPTIONS, this.data.hongZhong);
    if (hz && hz.fan > 0) breakdown.push({ name: hz.label, fan: hz.fan });
    const bb = _find(BAIBAN_OPTIONS, this.data.baiBan);
    if (bb && bb.fan > 0) breakdown.push({ name: bb.label, fan: bb.fan });

    // 6) 门清与听牌型
    if (!this.data.menqingDisabled) {
      const mq = _find(MENQING_OPTIONS, this.data.menqing);
      if (mq && mq.fan > 0) breakdown.push({ name: mq.label, fan: mq.fan });
    }

    // 7) 大牌组合：基础牌型组合 → 额外 +15
    const basicKey = this.data.basicType;
    for (const combo of BIG_HAND_BONUSES) {
      if (combo.items.includes(basicKey)) {
        // 也需要对方的 basicType 吗？实际上大牌组合是两个基础牌型都是 15 番的组合
        // 用户可能只选了一个基础牌型？不会——基础牌型是单选
        // 所以这里改成：单选 + 大牌组合检测 → 检测所有"单选"是否触发多个 15 番基础牌型
      }
    }
    // 重新设计：基础牌型是单选（只能选 1 个），所以大牌组合需要从"单选 + 字牌状态"等组合判断
    // 实际上 need.md 里的"清一色+碰碰胡"等是同时选中两个牌型，但当前设计是单选
    // → 大牌组合暂不实现（等用户改设计）

    const totalFan = breakdown.reduce((s, x) => s + x.fan, 0);
    const canHu = totalFan >= 2;
    const canHuText = canHu
      ? '✅ 可胡牌'
      : (totalFan === 0 ? '请选择基础牌型和胡牌方式' : '❌ 总番数不足2番');

    const amount = totalFan * (this.data.baseScore || 0);
    const canApply = canHu && !!this.data.targetId;

    this.setData({ fanBreakdown: breakdown, totalFan, canHu, canHuText, amount, canApply });
  },
});