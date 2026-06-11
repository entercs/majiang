const roomStore = require('../../../stores/roomStore');
const roundService = require('../../../services/roundService');
const { handleError } = require('../../../services/errorHandler');
const { generateTempId } = require('../../../utils/cloud-id');

// ============== 玩法常量（黄梅麻将） ==============

const RULE_TYPES = ['黄梅麻将'];

// 牌型（原"基础牌型"），多选带互斥
const CARD_TYPES = [
  { key: 'pinghu', label: '平胡', fan: 1 },         // primary：与十五番互斥
  { key: 'buqiuren', label: '不求人', fan: 1 },     // primary：与十五番互斥
  { key: 'qiyidui', label: '七对', fan: 15 },       // 十五番：与碰碰胡互斥
  { key: 'pengpenghu', label: '碰碰胡', fan: 15 },  // 十五番：与七对互斥
  { key: 'qingyise', label: '清一色', fan: 15 },     // 十五番：与混一色互斥
  { key: 'hunyise', label: '混一色', fan: 15 },     // 十五番：与清一色互斥
  { key: 'quanqiuren', label: '全求人', fan: 30 },   // 十五番：可与七对/清一色等共存
];

// 1番 primary 组（与十五番互斥）
const PRIMARY_CARDS = ['pinghu', 'buqiuren'];
// 十五番内部互斥对
const CARD_RIVAL = {
  qiyidui: 'pengpenghu',
  pengpenghu: 'qiyidui',
  qingyise: 'hunyise',
  hunyise: 'qingyise',
};

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
  { key: 'peng', label: '碰', fan: 1 },
  { key: 'anke', label: '暗刻', fan: 2 },
  { key: 'minggang', label: '明杠', fan: 3 },
  { key: 'anggang', label: '暗杠', fan: 4 },
];

const BAIBAN_OPTIONS = [
  { key: 'none', label: '无', fan: 0 },
  { key: 'peng', label: '碰', fan: 1 },
  { key: 'anke', label: '暗刻', fan: 2 },
  { key: 'minggang', label: '明杠', fan: 3 },
  { key: 'anggang', label: '暗杠', fan: 4 },
];

// 门清与听牌型（合并：4 个选项单选；各自有不同互斥）
const QM_OPTIONS = [
  { key: 'menqianqing', label: '门前清', fan: 1 },
  { key: 'kadang', label: '卡当', fan: 1 },
  { key: 'bianzhang', label: '边张', fan: 1 },
  { key: 'diandiao', label: '单吊', fan: 1 },
];

// 与"门前清"冲突的字牌选项（碰、明杠影响门前清；暗刻、暗杠不影响）
const HONOR_CONFLICTS_WITH_MENQING = ['peng', 'minggang'];

// "卡当/边张/单吊"组中受"全求人"影响禁用单吊
const DISABLED_BY_QUANQIUREN = ['diandiao'];
// "卡当/边张/单吊"组中受"七对"影响全部禁用
const DISABLED_BY_QIYIDUI = ['kadang', 'bianzhang', 'diandiao'];
// "门前清"受字牌影响禁用
const DISABLED_BY_HONOR = ['menqianqing'];

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
    canHuText: '请选择牌型和胡牌方式',

    cardTypes: CARD_TYPES,
    cardTypeKeys: ['pinghu'],   // 多选：默认平胡

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

    qmOptions: QM_OPTIONS,
    qmType: null,
    qmDisabledMap: {},

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
  },

  onBaseScoreChange(e) {
    const n = Number(e.detail.value);
    if (Number.isFinite(n) && n >= 0) {
      this.setData({ baseScore: n });
      this._recompute();
    }
  },

  // 牌型多选 + 互斥
  onCardTypeChange(e) {
    const value = e.currentTarget.dataset.value;
    const cur = this.data.cardTypeKeys || [];
    let next;
    if (cur.includes(value)) {
      // 取消选中
      next = cur.filter(k => k !== value);
    } else {
      // 选中
      next = [...cur, value];
      if (PRIMARY_CARDS.includes(value)) {
        // 选 1番 primary → 只保留这一个
        next = [value];
      } else {
        // 选 15+番 → 清掉所有 primary
        next = next.filter(k => !PRIMARY_CARDS.includes(k));
        // 七对↔碰碰胡、清↔混 互斥
        const rival = CARD_RIVAL[value];
        if (rival && next.includes(rival)) {
          next = next.filter(k => k !== rival);
        }
      }
    }

    // 处理听牌型互斥（七对 → 清空+禁用；全求人 → 若单吊则清空）
    let tingpai = this.data.tingpaiType;
    let tingpaiDisabled = false;
    if (next.includes('qiyidui')) {
      tingpai = null;
      tingpaiDisabled = true;
    } else if (next.includes('quanqiuren') && tingpai === 'diandiao') {
      tingpai = null;
    }

    this.setData({ cardTypeKeys: next, tingpai, tingpaiDisabled });
    this._recompute();
  },

  onWinTypeChange(e) {
    const value = e.currentTarget.dataset.value;
    const newValue = (this.data.winType === value) ? null : value;
    this.setData({ winType: newValue });
    this._recompute();
  },

  onFacaiChange(e) {
    const value = Number(e.currentTarget.dataset.value);
    const newValue = (this.data.facai === value) ? 0 : value;
    this.setData({ facai: newValue });
    this._recompute();
  },

  onMingGangChange(e) {
    const value = Number(e.currentTarget.dataset.value);
    const newValue = (this.data.mingGang === value) ? 0 : value;
    this.setData({ mingGang: newValue });
    this._applyQmMutex();
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
    const newValue = (this.data.hongZhong === value) ? null : value;
    this.setData({ hongZhong: newValue });
    this._applyQmMutex();
    this._recompute();
  },

  onBaiBanChange(e) {
    const value = e.currentTarget.dataset.value;
    const newValue = (this.data.baiBan === value) ? null : value;
    this.setData({ baiBan: newValue });
    this._applyQmMutex();
    this._recompute();
  },

  onQmChange(e) {
    const value = e.currentTarget.dataset.value;
    if (this.data.qmDisabledMap[value]) return;
    const cur = this.data.qmType;
    const newValue = (cur === value) ? null : value;
    let updates = { qmType: newValue };
    // 选门清时清掉冲突项
    if (newValue === 'menqianqing') {
      updates = {
        ...updates,
        hongZhong: null,
        baiBan: null,
        mingGang: 0,
      };
    }
    this.setData(updates);
    this._applyQmMutex();
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
      cardTypeKeys: ['pinghu'],
      winType: 'dianpao',
      facai: 0,
      mingGang: 0,
      anGang: 0,
      hongZhong: null,
      baiBan: null,
      qmType: null,
      qmDisabledMap: {},
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

  // 门清与听牌型互斥（按 key 单独禁用）：
  //  - 门前清 ↔ 碰红中/明杠红中/碰白板/明杠白板/明杠数牌≥1
  //  - 卡当/边张/单吊 ↔ 七对
  //  - 单吊 ↔ 全求人
  _applyQmMutex() {
    const keys = this.data.cardTypeKeys || [];
    const isQiyidui = keys.includes('qiyidui');
    const isQuanqiuren = keys.includes('quanqiuren');
    const hzConflict = HONOR_CONFLICTS_WITH_MENQING.includes(this.data.hongZhong);
    const bbConflict = HONOR_CONFLICTS_WITH_MENQING.includes(this.data.baiBan);
    const mgConflict = this.data.mingGang >= 1;
    const honorConflict = hzConflict || bbConflict || mgConflict;

    const map = {};
    if (honorConflict) {
      DISABLED_BY_HONOR.forEach(k => { map[k] = true; });
    }
    if (isQiyidui) {
      DISABLED_BY_QIYIDUI.forEach(k => { map[k] = true; });
    }
    if (isQuanqiuren) {
      DISABLED_BY_QUANQIUREN.forEach(k => { map[k] = true; });
    }

    // 若当前选中的被禁用，清空
    if (this.data.qmType && map[this.data.qmType]) {
      this.setData({ qmType: null, qmDisabledMap: map });
    } else {
      this.setData({ qmDisabledMap: map });
    }
  },

  // 计算番数 + 金额 + 可胡 + 可应用
  _recompute() {
    const breakdown = [];

    // 1) 牌型（多选）
    for (const key of (this.data.cardTypeKeys || [])) {
      const c = _find(CARD_TYPES, key);
      if (c && c.fan > 0) breakdown.push({ name: c.label, fan: c.fan });
    }

    // 2) 胡牌方式
    if (this.data.winType) {
      const win = _find(WIN_TYPES, this.data.winType);
      if (win && win.fan > 0) breakdown.push({ name: win.label, fan: win.fan });
    }

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
      if (hz && hz.fan > 0) breakdown.push({ name: `红中·${hz.label}`, fan: hz.fan });
    }
    if (this.data.baiBan) {
      const bb = _find(BAIBAN_OPTIONS, this.data.baiBan);
      if (bb && bb.fan > 0) breakdown.push({ name: `白板·${bb.label}`, fan: bb.fan });
    }

    // 6) 门清与听牌型（合并）
    if (this.data.qmType && !this.data.qmDisabledMap[this.data.qmType]) {
      const qm = _find(QM_OPTIONS, this.data.qmType);
      if (qm && qm.fan > 0) breakdown.push({ name: qm.label, fan: qm.fan });
    }

    const totalFan = breakdown.reduce((s, x) => s + x.fan, 0);
    const canHu = totalFan >= 2;
    const canHuText = canHu ? '✅ 可胡牌' : '❌ 不可胡牌（总番数不足2番）';

    const amount = totalFan * (this.data.baseScore || 0);
    const canApply = canHu && !!this.data.targetId;

    this.setData({ fanBreakdown: breakdown, totalFan, canHu, canHuText, amount, canApply });
  },
});
