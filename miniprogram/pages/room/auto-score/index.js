const roomStore = require('../../../stores/roomStore');
const roundService = require('../../../services/roundService');
const { handleError } = require('../../../services/errorHandler');
const { generateTempId } = require('../../../utils/cloud-id');

// ============== 玩法常量（黄梅麻将） ==============

const RULE_TYPES = ['黄梅麻将'];

const BASIC_TYPES = [
  { key: 'pinghu', label: '平胡', fan: 1 },
  { key: 'qiyidui', label: '七对', fan: 15 },
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

// 与"门前清"冲突的字牌选项（碰、明杠影响门前清；暗刻、暗杠不影响）
const HONOR_CONFLICTS_WITH_MENQING = ['peng', 'minggang'];

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

    facaiOptions: [
      { key: 0, label: '0张' },
      { key: 1, label: '1张' },
      { key: 2, label: '2张' },
      { key: 3, label: '3张' },
      { key: 4, label: '4张' },
    ],
    facai: 0,
    mingGangOptions: [
      { key: 0, label: '0张' },
      { key: 1, label: '1张' },
      { key: 2, label: '2张' },
      { key: 3, label: '3张' },
    ],
    mingGang: 0,
    anGangOptions: [
      { key: 0, label: '0张' },
      { key: 1, label: '1张' },
      { key: 2, label: '2张' },
      { key: 3, label: '3张' },
    ],
    anGang: 0,

    hongZhongOptions: HONGZHONG_OPTIONS.filter(o => o.key !== 'none'),
    hongZhong: null,

    baiBanOptions: BAIBAN_OPTIONS.filter(o => o.key !== 'none'),
    baiBan: null,

    menqingOptions: MENQING_OPTIONS.filter(o => o.key !== 'none'),
    menqing: null,
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
    const value = e.currentTarget.dataset.value;
    const newType = (this.data.basicType === value) ? null : value;  // 再次点击取消
    // 互斥：七一对/全求人 → 清空门清 + 禁用
    if (newType && DISABLE_MENQING_BASIC.includes(newType)) {
      this.setData({ basicType: newType, menqing: null, menqingDisabled: true });
    } else {
      this.setData({ basicType: newType, menqingDisabled: false });
    }
    this._recompute();
  },

  onWinTypeChange(e) {
    const value = e.currentTarget.dataset.value;
    const newValue = (this.data.winType === value) ? null : value;  // 再次点击取消
    this.setData({ winType: newValue });
    this._recompute();
  },

  onFacaiChange(e) {
    const value = Number(e.currentTarget.dataset.value);
    const newValue = (this.data.facai === value) ? 0 : value;  // 再次点击同值归 0
    this.setData({ facai: newValue });
    this._recompute();
  },

  onMingGangChange(e) {
    const value = Number(e.currentTarget.dataset.value);
    const newValue = (this.data.mingGang === value) ? 0 : value;
    this.setData({ mingGang: newValue });
    this._applyMenqingMutex();
    this._recompute();
  },

  onAnGangChange(e) {
    const value = Number(e.currentTarget.dataset.value);
    const newValue = (this.data.anGang === value) ? 0 : value;
    this.setData({ anGang: newValue });
    this._recompute();
  },

  onHongZhongChange(e) {
    const value = e.currentTarget.dataset.value;
    const newValue = (this.data.hongZhong === value) ? null : value;  // 再次点击取消
    this.setData({ hongZhong: newValue });
    this._applyMenqingMutex();
    this._recompute();
  },

  onBaiBanChange(e) {
    const value = e.currentTarget.dataset.value;
    const newValue = (this.data.baiBan === value) ? null : value;  // 再次点击取消
    this.setData({ baiBan: newValue });
    this._applyMenqingMutex();
    this._recompute();
  },

  onMenqingChange(e) {
    if (this.data.menqingDisabled) return;
    const value = e.currentTarget.dataset.value;
    const newValue = (this.data.menqing === value) ? null : value;  // 再次点击取消
    if (newValue) {
      // 选 menqing → 重置冲突项
      this.setData({
        menqing: newValue,
        hongZhong: null,
        baiBan: null,
        mingGangCount: 0,
      });
      this._applyMenqingMutex();  // menqingDisabled 应回到 false
    } else {
      this.setData({ menqing: null });
    }
    this._recompute();
  },

  onTargetChange(e) {
    const id = e.currentTarget.dataset.id;
    const target = this.data.otherPlayers.find(p => p._id === id);
    this.setData({ targetId: id, targetName: target ? target.nickname : '' });
    this._recompute();
  },

  // 门前清互斥：碰红中/明杠红中/碰白板/明杠白板/明杠数牌≥1 → 禁用门前清
  _applyMenqingMutex() {
    const hzConflicts = HONOR_CONFLICTS_WITH_MENQING.includes(this.data.hongZhong);
    const bbConflicts = HONOR_CONFLICTS_WITH_MENQING.includes(this.data.baiBan);
    const mgConflicts = this.data.mingGang >= 1;
    const shouldDisable = hzConflicts || bbConflicts || mgConflicts;
    if (shouldDisable) {
      if (!this.data.menqingDisabled || this.data.menqing !== null) {
        this.setData({ menqingDisabled: true, menqing: null });
      }
    } else {
      if (this.data.menqingDisabled) {
        this.setData({ menqingDisabled: false });
      }
    }
  },

  onReset() {
    this.setData({
      baseScore: 1,
      basicType: 'pinghu',
      winType: 'dianpao',
      facai: 0,
      mingGang: 0,
      anGang: 0,
      hongZhong: null,
      baiBan: null,
      menqing: null,
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
    if (this.data.facai > 0) {
      const facaiFan = this.data.facai === 4 ? 8 : this.data.facai;
      breakdown.push({ name: `发财×${this.data.facai}`, fan: facaiFan });
    }

    // 4) 明杠 / 暗杠
    if (this.data.mingGang > 0) {
      breakdown.push({ name: `明杠数牌×${this.data.mingGang}`, fan: this.data.mingGang });
    }
    if (this.data.anGang > 0) {
      breakdown.push({ name: `暗杠数牌×${this.data.anGang}`, fan: this.data.anGang * 2 });
    }

    // 5) 红中 / 白板
    if (this.data.hongZhong) {
      const hz = _find(HONGZHONG_OPTIONS, this.data.hongZhong);
      if (hz && hz.fan > 0) breakdown.push({ name: hz.label, fan: hz.fan });
    }
    if (this.data.baiBan) {
      const bb = _find(BAIBAN_OPTIONS, this.data.baiBan);
      if (bb && bb.fan > 0) breakdown.push({ name: bb.label, fan: bb.fan });
    }

    // 6) 门清与听牌型
    if (!this.data.menqingDisabled && this.data.menqing) {
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