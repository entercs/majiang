const roomStore = require('../../../stores/roomStore');
const roundService = require('../../../services/roundService');
const { handleError } = require('../../../services/errorHandler');
const { generateTempId } = require('../../../utils/cloud-id');

// ============== 玩法常量 ==============

// 玩法类型列表（支持切换）
const RULE_TYPES = [
  { key: 'huangmei', label: '黄梅麻将' },
  { key: 'sichuan',  label: '四川麻将' },
];

// ============== 黄梅麻将常量 ==============

const HM_CARD_TYPES = [
  { key: 'pinghu',      label: '平胡',      fan: 1 },
  { key: 'qiyidui',     label: '七对',      fan: 15 },
  { key: 'pengpenghu',  label: '碰碰胡',    fan: 15 },
  { key: 'qingyise',    label: '清一色',    fan: 15 },
  { key: 'hunyise',     label: '混一色',    fan: 15 },
  { key: 'quanqiuren',  label: '全求人',    fan: 30 },
];
const HM_PRIMARY_CARDS = ['pinghu'];
const HM_CARD_RIVAL = {
  qiyidui: 'pengpenghu', pengpenghu: 'qiyidui',
  qingyise: 'hunyise',   hunyise: 'qingyise',
};

const HM_WIN_TYPES = [
  { key: 'dianpao',   label: '点炮',   fan: 0 },
  { key: 'zimo',      label: '自摸',   fan: 1 },
  { key: 'caishang',  label: '财上开花', fan: 2 },
  { key: 'gangshang', label: '杠上开花', fan: 5 },
  { key: 'qianggang', label: '抢杠',   fan: 5 },
  { key: 'haidilao',  label: '海底捞月', fan: 5 },
];

const HONGZHONG_OPTIONS = [
  { key: 'none',    label: '无',     fan: 0 },
  { key: 'peng',    label: '碰',     fan: 1 },
  { key: 'anke',    label: '暗刻',   fan: 2 },
  { key: 'minggang', label: '明杠',  fan: 3 },
  { key: 'anggang',  label: '暗杠',  fan: 4 },
];
const BAIBAN_OPTIONS = [
  { key: 'none',    label: '无',     fan: 0 },
  { key: 'peng',    label: '碰',     fan: 1 },
  { key: 'anke',    label: '暗刻',   fan: 2 },
  { key: 'minggang', label: '明杠',  fan: 3 },
  { key: 'anggang',  label: '暗杠',  fan: 4 },
];

const QM_OPTIONS = [
  { key: 'menqianqing', label: '门前清', fan: 1 },
  { key: 'kadang',      label: '卡张',   fan: 1 },
  { key: 'bianzhang',   label: '边张',   fan: 1 },
  { key: 'diandiao',    label: '单吊',   fan: 1 },
];
const HONOR_CONFLICTS_WITH_MENQING = ['peng', 'minggang'];

// ============== 四川麻将常量 ==============

const SC_CARD_TYPES = [
  { key: 'pinghu',     label: '平胡',    fan: 1 },
  { key: 'duiduihu',   label: '对对胡',  fan: 2 },
  { key: 'qiyidui',    label: '七对',    fan: 3 },
  { key: 'qingyise',   label: '清一色',  fan: 3 },
  { key: 'longqidui',  label: '龙七对',  fan: 4 },
  { key: 'qingqidui',  label: '清七对',  fan: 4 },
  { key: 'qingdui',    label: '清对',    fan: 4 },
  { key: 'jiangdui',   label: '将对',    fan: 4 },
  { key: 'quanqiuren', label: '全求人',  fan: 2 },
];
const SC_CARD_RIVAL = {
  qiyidui: 'duiduihu', duiduihu: 'qiyidui',
};

const SC_SPECIAL_WIN_TYPES = [
  { key: 'zimo',         label: '自摸',      fan: 1 },
  { key: 'gangshanghua', label: '杠上花',    fan: 1 },
  { key: 'gangshangpao', label: '杠上炮',    fan: 1 },
  { key: 'qiangganghu',  label: '抢杠胡',    fan: 1 },
  { key: 'haidilaoyue',  label: '海底捞月',  fan: 1 },
  { key: 'haidipao',     label: '海底炮',    fan: 1 },
  { key: 'jinngoudiao',  label: '金钩钓',    fan: 1 },
];
const SC_MAX_FAN = 4; // 4番封顶

// ============== 辅助函数 ==============

const _find = (arr, key) => (arr || []).find(o => o.key === key);

// ============== 页面 ==============

Page({
  data: {
    // 当前玩法类型：'huangmei' | 'sichuan'
    ruleType: 'huangmei',

    // ---------- 共用 ----------
    baseScore: 1,
    totalFan: 0,
    cappedFan: 0,
    canHu: false,
    canHuText: '请选择牌型和胡牌方式',

    otherPlayers: [],
    targetId: '',
    targetName: '',

    fanBreakdown: [],
    amount: 0,
    canApply: false,

    // ---------- 黄梅麻将 ----------
    hmCardTypes: HM_CARD_TYPES,
    hmCardTypeKeys: ['pinghu'],
    hmCardTypeSelected: { pinghu: true },

    hmWinTypes: HM_WIN_TYPES,
    winType: 'dianpao',

    facaiOptions: [{ key: 1, label: '1张' }, { key: 2, label: '2张' }, { key: 3, label: '3张' }, { key: 4, label: '4张' }],
    facai: null,
    mingGangOptions: [{ key: 1, label: '1组' }, { key: 2, label: '2组' }, { key: 3, label: '3组' }],
    mingGang: null,
    anGangOptions: [{ key: 1, label: '1组' }, { key: 2, label: '2组' }, { key: 3, label: '3组' }],
    anGang: null,

    hongZhongOptions: HONGZHONG_OPTIONS.filter(o => o.key !== 'none'),
    hongZhong: null,
    baiBanOptions: BAIBAN_OPTIONS.filter(o => o.key !== 'none'),
    baiBan: null,

    gangDisabled: false,

    qmOptions: QM_OPTIONS,
    qmType: null,
    qmDisabledMap: {},
    qmHint: '',

    // ---------- 四川麻将 ----------
    scCardTypes: SC_CARD_TYPES,
    scCardType: 'pinghu',         // 单选

    scSpecialWinTypes: SC_SPECIAL_WIN_TYPES,
    specialWinTypes: [],           // 多选数组

    genCount: 0,                   // 根的数量（龙七对默认1）
    genCountLocked: false,        // 龙七对时锁住根数量
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
    const baseScore = roomStore.rule?.baseScore ?? 1;
    this.setData({ otherPlayers, baseScore });
    this._recompute();
  },

  // ============== 玩法切换 ==============

  onRuleTypeChange(e) {
    const idx = Number(e.detail.value);
    const ruleType = RULE_TYPES[idx].key;
    this.setData({ ruleTypeIndex: idx, ruleType });
    // 重置到各玩法的默认值
    if (ruleType === 'huangmei') {
      this.setData({
        hmCardTypeKeys: ['pinghu'],
        hmCardTypeSelected: { pinghu: true },
        winType: 'dianpao',
        facai: null, mingGang: null, anGang: null,
        hongZhong: null, baiBan: null,
        gangDisabled: false,
        qmType: null, qmDisabledMap: {}, qmHint: '',
        targetId: '', targetName: '',
      });
    } else {
      this.setData({
        scCardType: 'pinghu',
        specialWinTypes: [],
        genCount: 0,
        genCountLocked: false,
        targetId: '', targetName: '',
      });
    }
    this._recompute();
  },

  // ============== 黄梅麻将 — 牌型多选 ==============

  onCardTypeChange(e) {
    const value = e.currentTarget.dataset.value;
    const cur = this.data.hmCardTypeKeys || [];
    let next;
    if (cur.includes(value)) {
      next = cur.filter(k => k !== value);
    } else {
      next = [...cur, value];
      if (HM_PRIMARY_CARDS.includes(value)) {
        next = [value];
      } else {
        next = next.filter(k => !HM_PRIMARY_CARDS.includes(k));
        const rival = HM_CARD_RIVAL[value];
        if (rival && next.includes(rival)) {
          next = next.filter(k => k !== rival);
        }
      }
    }
    const hmCardTypeSelected = {};
    HM_CARD_TYPES.forEach(t => { hmCardTypeSelected[t.key] = next.includes(t.key); });
    this.setData({ hmCardTypeKeys: next, hmCardTypeSelected });
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
    if (this.data.gangDisabled && this.data.mingGang === null) return;
    const newValue = (this.data.mingGang === value) ? null : value;
    this.setData({ mingGang: newValue });
    this._applyGangDisabled();
    this._applyQmMutex();
    this._recompute();
  },

  onAnGangChange(e) {
    const value = Number(e.currentTarget.dataset.value);
    if (this.data.gangDisabled && this.data.anGang === null) return;
    const newValue = (this.data.anGang === value) ? null : value;
    this.setData({ anGang: newValue });
    this._applyGangDisabled();
    this._recompute();
  },

  onHongZhongChange(e) {
    const value = e.currentTarget.dataset.value;
    if (this.data.gangDisabled && this.data.hongZhong === null) return;
    const newValue = (this.data.hongZhong === value) ? null : value;
    this.setData({ hongZhong: newValue });
    this._applyGangDisabled();
    this._applyQmMutex();
    this._recompute();
  },

  onBaiBanChange(e) {
    const value = e.currentTarget.dataset.value;
    if (this.data.gangDisabled && this.data.baiBan === null) return;
    const newValue = (this.data.baiBan === value) ? null : value;
    this.setData({ baiBan: newValue });
    this._applyGangDisabled();
    this._applyQmMutex();
    this._recompute();
  },

  onQmChange(e) {
    const value = e.currentTarget.dataset.value;
    if (this.data.qmDisabledMap[value]) return;
    const cur = this.data.qmType;
    const newValue = (cur === value) ? null : value;
    let updates = { qmType: newValue };
    if (newValue === 'menqianqing') {
      updates = { ...updates, hongZhong: null, baiBan: null, mingGang: null };
    }
    this.setData(updates);
    this._applyGangDisabled();
    this._applyQmMutex();
    this._recompute();
  },

  // ============== 四川麻将 — 基础牌型单选 ==============

  onScCardTypeChange(e) {
    const value = e.currentTarget.dataset.value;
    let genCount = this.data.genCount;
    let genCountLocked = false;
    // 龙七对默认带1根，锁定
    if (value === 'longqidui') {
      genCount = 1;
      genCountLocked = true;
    } else if (this.data.genCountLocked) {
      genCount = 0;
      genCountLocked = false;
    }
    this.setData({ scCardType: value, genCount, genCountLocked });
    this._recompute();
  },

  // ============== 四川麻将 — 特殊加番项多选 ==============

  onSpecialWinTypeChange(e) {
    const value = e.currentTarget.dataset.value;
    const cur = this.data.specialWinTypes || [];
    let next;
    if (cur.includes(value)) {
      next = cur.filter(k => k !== value);
    } else {
      next = [...cur, value];
    }
    this.setData({ specialWinTypes: next });
    this._recompute();
  },

  // ============== 四川麻将 — 根数量 ==============

  onGenCountChange(e) {
    if (this.data.genCountLocked) return;
    const value = Number(e.currentTarget.dataset.value);
    this.setData({ genCount: value });
    this._recompute();
  },

  // ============== 共用 ==============

  onTargetChange(e) {
    const id = e.currentTarget.dataset.id;
    const target = this.data.otherPlayers.find(p => p._id === id);
    this.setData({ targetId: id, targetName: target ? target.nickname : '' });
    this._recompute();
  },

  onReset() {
    const ruleType = this.data.ruleType;
    if (ruleType === 'huangmei') {
      this.setData({
        hmCardTypeKeys: ['pinghu'],
        hmCardTypeSelected: { pinghu: true },
        winType: 'dianpao',
        facai: null, mingGang: null, anGang: null,
        hongZhong: null, baiBan: null,
        gangDisabled: false,
        qmType: null, qmDisabledMap: {}, qmHint: '',
        targetId: '', targetName: '',
      });
    } else {
      this.setData({
        scCardType: 'pinghu',
        specialWinTypes: [],
        genCount: 0,
        genCountLocked: false,
        targetId: '', targetName: '',
      });
    }
    this._recompute();
  },

  onApply() {
    if (!this.data.canApply) {
      const msg = this.data.canHu ? '请选付给谁' : '总番数不足，不能胡';
      wx.showToast({ title: msg, icon: 'none' });
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

  // ============== 黄梅麻将内部方法 ==============

  _getTotalGangGroups() {
    const mg = this.data.mingGang || 0;
    const ag = this.data.anGang || 0;
    const hz = (this.data.hongZhong && this.data.hongZhong !== 'none') ? 1 : 0;
    const bb = (this.data.baiBan && this.data.baiBan !== 'none') ? 1 : 0;
    return mg + ag + hz + bb;
  },

  _applyGangDisabled() {
    const total = this._getTotalGangGroups();
    this.setData({ gangDisabled: total >= 3 });
  },

  _applyQmMutex() {
    const keys = this.data.hmCardTypeKeys || [];
    const hasQiyidui = keys.includes('qiyidui');
    const hasPengpenghu = keys.includes('pengpenghu');
    const hasQuanqiuren = keys.includes('quanqiuren');

    const hzConflict = HONOR_CONFLICTS_WITH_MENQING.includes(this.data.hongZhong);
    const bbConflict = HONOR_CONFLICTS_WITH_MENQING.includes(this.data.baiBan);
    const mgConflict = this.data.mingGang != null;
    const honorConflict = hzConflict || bbConflict || mgConflict;

    const map = {};
    if (hasQiyidui || hasQuanqiuren) {
      QM_OPTIONS.forEach(o => { map[o.key] = true; });
    }
    if (hasPengpenghu && !hasQiyidui && !hasQuanqiuren) {
      map.kadang = true;
      map.bianzhang = true;
    }
    if (honorConflict) {
      map.menqianqing = true;
    }

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

    if (this.data.qmType && map[this.data.qmType]) {
      this.setData({ qmType: null, qmDisabledMap: map, qmHint });
    } else {
      this.setData({ qmDisabledMap: map, qmHint });
    }
  },

  // ============== 四川麻将计番 ==============

  _recomputeSc() {
    const breakdown = [];

    // 1) 基础番型（单选）
    const ct = _find(SC_CARD_TYPES, this.data.scCardType);
    if (ct && ct.fan > 0) {
      breakdown.push({ name: ct.label, fan: ct.fan });
    }

    // 2) 特殊加番项（每项+1番，可叠加）
    for (const key of (this.data.specialWinTypes || [])) {
      const sw = _find(SC_SPECIAL_WIN_TYPES, key);
      if (sw && sw.fan > 0) breakdown.push({ name: sw.label, fan: sw.fan });
    }

    // 3) 根（每组四张+1番，可叠加）
    if (this.data.genCount > 0) {
      breakdown.push({ name: `根×${this.data.genCount}`, fan: this.data.genCount });
    }

    let totalFan = breakdown.reduce((s, x) => s + x.fan, 0);
    const cappedFan = Math.min(totalFan, SC_MAX_FAN);
    const canHu = totalFan >= 1;

    // 倍数 = 2^封顶番数，封顶16
    const multiplier = Math.pow(2, cappedFan);
    const amount = multiplier * (this.data.baseScore || 0);
    const canApply = canHu && !!this.data.targetId;

    const canHuText = canHu
      ? `✅ 可胡（${cappedFan < totalFan ? `封顶${cappedFan}番` : `${totalFan}番`}）`
      : '❌ 不可胡（1番起胡）';

    // 构建 WXML 所需的选中映射（单选 + 多选）
    const scCardTypeSelected = {};
    SC_CARD_TYPES.forEach(t => { scCardTypeSelected[t.key] = this.data.scCardType === t.key; });

    const specialWinTypeSelected = {};
    SC_SPECIAL_WIN_TYPES.forEach(t => { specialWinTypeSelected[t.key] = (this.data.specialWinTypes || []).includes(t.key); });

    this.setData({
      fanBreakdown: breakdown,
      totalFan,
      cappedFan,
      canHu,
      canHuText,
      amount,
      multiplier,
      canApply,
      scCardTypeSelected,
      specialWinTypeSelected,
    });
  },

  // ============== 黄梅麻将计番 ==============

  _recomputeHm() {
    const breakdown = [];

    for (const key of (this.data.hmCardTypeKeys || [])) {
      const c = _find(HM_CARD_TYPES, key);
      if (c && c.fan > 0) breakdown.push({ name: c.label, fan: c.fan });
    }

    if (this.data.winType) {
      const win = _find(HM_WIN_TYPES, this.data.winType);
      if (win && win.fan > 0) breakdown.push({ name: win.label, fan: win.fan });
    }

    if (this.data.facai != null) {
      const facaiFan = this.data.facai === 4 ? 8 : this.data.facai;
      breakdown.push({ name: `发财×${this.data.facai}`, fan: facaiFan });
    }

    if (this.data.mingGang != null) {
      breakdown.push({ name: `明杠数牌×${this.data.mingGang}`, fan: this.data.mingGang });
    }
    if (this.data.anGang != null) {
      breakdown.push({ name: `暗杠数牌×${this.data.anGang}`, fan: this.data.anGang * 2 });
    }

    if (this.data.hongZhong) {
      const hz = _find(HONGZHONG_OPTIONS, this.data.hongZhong);
      if (hz && hz.fan > 0) breakdown.push({ name: `红中·${hz.label}`, fan: hz.fan });
    }
    if (this.data.baiBan) {
      const bb = _find(BAIBAN_OPTIONS, this.data.baiBan);
      if (bb && bb.fan > 0) breakdown.push({ name: `白板·${bb.label}`, fan: bb.fan });
    }

    if (this.data.qmType && !this.data.qmDisabledMap[this.data.qmType]) {
      const qm = _find(QM_OPTIONS, this.data.qmType);
      if (qm && qm.fan > 0) breakdown.push({ name: qm.label, fan: qm.fan });
    }

    const totalFan = breakdown.reduce((s, x) => s + x.fan, 0);
    const canHu = totalFan >= 2;
    const canHuText = canHu ? '✅ 可胡牌' : '❌ 不可胡牌（总番数不足2番）';

    const amount = totalFan * (this.data.baseScore || 0);
    const canApply = canHu && !!this.data.targetId;

    this.setData({
      fanBreakdown: breakdown,
      totalFan,
      canHu,
      canHuText,
      amount,
      canApply,
    });
  },

  // 路由到各玩法计番
  _recompute() {
    if (this.data.ruleType === 'sichuan') {
      this._recomputeSc();
    } else {
      this._recomputeHm();
    }
  },
});