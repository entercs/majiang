const roomStore = require('../../../stores/roomStore');
const roundService = require('../../../services/roundService');
const { handleError } = require('../../../services/errorHandler');
const { generateTempId } = require('../../../utils/cloud-id');

// ============== 玩法常量（黄梅麻将） ==============

const RULE_TYPES = ['黄梅麻将'];

// 牌型（原"基础牌型"），多选带互斥
const CARD_TYPES = [
  { key: 'pinghu', label: '平胡', fan: 1 },         // primary：与十五番互斥
  { key: 'qiyidui', label: '七对', fan: 15 },       // 十五番：与碰碰胡互斥
  { key: 'pengpenghu', label: '碰碰胡', fan: 15 },  // 十五番：与七对互斥
  { key: 'qingyise', label: '清一色', fan: 15 },     // 十五番：与混一色互斥
  { key: 'hunyise', label: '混一色', fan: 15 },     // 十五番：与清一色互斥
  { key: 'quanqiuren', label: '全求人', fan: 30 },   // 十五番：可与七对/清一色等共存
];

// 1番 primary 组（与十五番互斥）
const PRIMARY_CARDS = ['pinghu'];
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
  { key: 'kadang', label: '卡张', fan: 1 },
  { key: 'bianzhang', label: '边张', fan: 1 },
  { key: 'diandiao', label: '单吊', fan: 1 },
];

// 与"门前清"冲突的字牌选项（碰、明杠影响门前清；暗刻、暗杠不影响）
const HONOR_CONFLICTS_WITH_MENQING = ['peng', 'minggang'];

// （旧互斥常量已移除，规则统一在 _applyQmMutex 中实现）

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
    cardTypeSelected: { pinghu: true },

    winTypes: WIN_TYPES,
    winType: 'dianpao',

    facaiOptions: [
      { key: 1, label: '1张' },
      { key: 2, label: '2张' },
      { key: 3, label: '3张' },
      { key: 4, label: '4张' },
    ],
    facai: null,
    mingGangOptions: [
      { key: 1, label: '1组' },
      { key: 2, label: '2组' },
      { key: 3, label: '3组' },
    ],
    mingGang: null,
    anGangOptions: [
      { key: 1, label: '1组' },
      { key: 2, label: '2组' },
      { key: 3, label: '3组' },
    ],
    anGang: null,

    hongZhongOptions: HONGZHONG_OPTIONS.filter(o => o.key !== 'none'),
    hongZhong: null,

    baiBanOptions: BAIBAN_OPTIONS.filter(o => o.key !== 'none'),
    baiBan: null,

    qmOptions: QM_OPTIONS,
    qmType: null,
    qmDisabledMap: {},
    qmHint: '',

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

    // 构建选中映射表（WXML 不支持 indexOf，用属性访问代替）
    const cardTypeSelected = {};
    CARD_TYPES.forEach(t => { cardTypeSelected[t.key] = next.includes(t.key); });

    this.setData({ cardTypeKeys: next, cardTypeSelected });
    this._applyQmMutex();
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
    const newValue = (this.data.facai === value) ? null : value;
    this.setData({ facai: newValue });
    this._recompute();
  },

  onMingGangChange(e) {
    const value = Number(e.currentTarget.dataset.value);
    const newValue = (this.data.mingGang === value) ? null : value;
    this.setData({ mingGang: newValue });
    this._applyQmMutex();
    this._recompute();
  },

  onAnGangChange(e) {
    const value = Number(e.currentTarget.dataset.value);
    const newValue = (this.data.anGang === value) ? null : value;
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
        mingGang: null,
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
      cardTypeSelected: { pinghu: true },
      winType: 'dianpao',
      facai: null,
      mingGang: null,
      anGang: null,
      hongZhong: null,
      baiBan: null,
      qmType: null,
      qmDisabledMap: {},
      qmHint: '',
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
  //  七对、全求人 → 与所有门清听牌型绝对互斥
  //  碰碰胡       → 与卡张、边张互斥（门前清、单吊不互斥）
  //  清一色/混一色 → 本身不互斥，由其底层结构决定规则
  //  门前清       → 与碰红中/明杠红中/碰白板/明杠白板/明杠数牌≥1 互斥
  _applyQmMutex() {
    const keys = this.data.cardTypeKeys || [];
    const hasQiyidui = keys.includes('qiyidui');
    const hasPengpenghu = keys.includes('pengpenghu');
    const hasQuanqiuren = keys.includes('quanqiuren');

    // 门前清与字牌冲突（不变）
    const hzConflict = HONOR_CONFLICTS_WITH_MENQING.includes(this.data.hongZhong);
    const bbConflict = HONOR_CONFLICTS_WITH_MENQING.includes(this.data.baiBan);
    const mgConflict = this.data.mingGang != null;
    const honorConflict = hzConflict || bbConflict || mgConflict;

    const map = {};

    // 七对 / 全求人 → 禁用全部四个门清听牌型
    if (hasQiyidui || hasQuanqiuren) {
      QM_OPTIONS.forEach(o => { map[o.key] = true; });
    }

    // 碰碰胡（且不含七对/全求人） → 仅禁用卡张、边张
    if (hasPengpenghu && !hasQiyidui && !hasQuanqiuren) {
      map.kadang = true;
      map.bianzhang = true;
    }

    // 门前清被字牌冲突禁用（若未被上方覆盖）
    if (honorConflict) {
      map.menqianqing = true;
    }

    // 生成提示文字
    let qmHint = '';
    if (hasQiyidui || hasQuanqiuren) {
      qmHint = '七对/全求人状态下不可选门清听牌型';
    } else if (hasPengpenghu) {
      qmHint = '碰碰胡与卡张、边张互斥';
    }
    if (honorConflict) {
      const honorText = '门前清与所选冲突：碰/明杠 或 明杠数牌≥1';
      qmHint = qmHint ? qmHint + '；' + honorText : honorText;
    }

    // 若当前选中的被禁用，清空
    if (this.data.qmType && map[this.data.qmType]) {
      this.setData({ qmType: null, qmDisabledMap: map, qmHint });
    } else {
      this.setData({ qmDisabledMap: map, qmHint });
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
    if (this.data.facai != null) {
      const facaiFan = this.data.facai === 4 ? 8 : this.data.facai;
      breakdown.push({ name: `发财×${this.data.facai}`, fan: facaiFan });
    }

    // 4) 明杠 / 暗杠
    if (this.data.mingGang != null) {
      breakdown.push({ name: `明杠数牌×${this.data.mingGang}`, fan: this.data.mingGang });
    }
    if (this.data.anGang != null) {
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
