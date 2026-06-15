// ============== 黄梅麻将 规则配置 ==============

const CARD_TYPES = [
  { key: 'pinghu', label: '平胡', fan: 1 },
  { key: 'qiyidui', label: '七对', fan: 15 },
  { key: 'pengpenghu', label: '碰碰胡', fan: 15 },
  { key: 'qingyise', label: '清一色', fan: 15 },
  { key: 'hunyise', label: '混一色', fan: 15 },
  { key: 'quanqiuren', label: '全求人', fan: 30 },
];

const PRIMARY_CARDS = ['pinghu'];
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

const QM_OPTIONS = [
  { key: 'menqianqing', label: '门前清', fan: 1 },
  { key: 'kadang', label: '卡张', fan: 1 },
  { key: 'bianzhang', label: '边张', fan: 1 },
  { key: 'diandiao', label: '单吊', fan: 1 },
];

const HONOR_CONFLICTS_WITH_MENQING = ['peng', 'minggang'];

// ========== 导出统一的配置对象 ==========

module.exports = {
  name: '黄梅麻将',
  canHuThreshold: 2,
  defaults: {
    cardTypeKeys: ['pinghu'],
    winType: 'dianpao',
    honor: {
      facai: null,
      mingGang: null,
      anGang: null,
      hongZhong: null,
      baiBan: null,
    },
    qmType: null,
  },

  // --- 各区域的选项定义 ---
  sections: {
    cardTypes: CARD_TYPES,
    primaryCards: PRIMARY_CARDS,
    cardRival: CARD_RIVAL,
    winTypes: WIN_TYPES,
    qmOptions: QM_OPTIONS,
    honorConflictsWithMenqing: HONOR_CONFLICTS_WITH_MENQING,
    honorSections: [
      {
        key: 'facai', label: '发财', type: 'quantity',
        options: [
          { key: 1, label: '1张' },
          { key: 2, label: '2张' },
          { key: 3, label: '3张' },
          { key: 4, label: '4张' },
        ],
      },
      {
        key: 'mingGang', label: '明杠数牌', type: 'quantity',
        options: [
          { key: 1, label: '1组' },
          { key: 2, label: '2组' },
          { key: 3, label: '3组' },
        ],
      },
      {
        key: 'anGang', label: '暗杠数牌', type: 'quantity',
        options: [
          { key: 1, label: '1组' },
          { key: 2, label: '2组' },
          { key: 3, label: '3组' },
        ],
      },
      {
        key: 'hongZhong', label: '红中', type: 'exclusive',
        options: HONGZHONG_OPTIONS,
      },
      {
        key: 'baiBan', label: '白板', type: 'exclusive',
        options: BAIBAN_OPTIONS,
      },
    ],
  },

  // --- 可配置炮数查表函数 ---

  /**
   * 获取牌型的炮数
   * @param {string} key - 牌型 key
   * @param {Object} rule - 房间规则对象（可选）
   * @returns {number} 炮数
   */
  getCardTypeFan(key, rule) {
    if (rule && rule.cardTypeFans && rule.cardTypeFans[key] != null) {
      return rule.cardTypeFans[key];
    }
    const found = CARD_TYPES.find(c => c.key === key);
    return found ? found.fan : 0;
  },

  /**
   * 获取胡牌方式的炮数
   * @param {string} key - 胡牌方式 key
   * @param {Object} rule - 房间规则对象（可选）
   * @returns {number} 炮数
   */
  getWinTypeFan(key, rule) {
    if (rule && rule.winTypeFans && rule.winTypeFans[key] != null) {
      return rule.winTypeFans[key];
    }
    const found = WIN_TYPES.find(w => w.key === key);
    return found ? found.fan : 0;
  },

  /** 辅助：在数组中按 key 查找选项 */
  find(arr, key) {
    return arr.find(o => o.key === key);
  },

  /** 牌型互斥：给定当前选中，返回新的选中列表 */
  applyCardMutex(value, currentKeys) {
    let next;
    if (currentKeys.includes(value)) {
      next = currentKeys.filter(k => k !== value);
    } else {
      next = [...currentKeys, value];
      if (PRIMARY_CARDS.includes(value)) {
        next = [value];
      } else {
        next = next.filter(k => !PRIMARY_CARDS.includes(k));
        const rival = CARD_RIVAL[value];
        if (rival && next.includes(rival)) {
          next = next.filter(k => k !== rival);
        }
      }
    }
    return next;
  },

  /** 构建 cardTypeSelected 映射表 */
  buildCardTypeSelected(keys) {
    const map = {};
    CARD_TYPES.forEach(t => { map[t.key] = keys.includes(t.key); });
    return map;
  },

  /** 门清与听牌型互斥：返回 { disabledMap, hint } */
  applyQmMutex(cardTypeKeys, honorValues) {
    const hasQiyidui = cardTypeKeys.includes('qiyidui');
    const hasPengpenghu = cardTypeKeys.includes('pengpenghu');
    const hasQuanqiuren = cardTypeKeys.includes('quanqiuren');

    const hzConflict = HONOR_CONFLICTS_WITH_MENQING.includes(honorValues.hongZhong);
    const bbConflict = HONOR_CONFLICTS_WITH_MENQING.includes(honorValues.baiBan);
    const mgConflict = honorValues.mingGang != null;
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

    let hint = '';
    if (hasQiyidui || hasQuanqiuren) {
      hint = '七对/全求人状态下不可选门清听牌型';
    } else if (hasPengpenghu) {
      hint = '碰碰胡与卡张、边张互斥';
    }
    if (honorConflict) {
      const honorText = '门前清与所选冲突：碰/明杠 或 明杠数牌≥1';
      hint = hint ? hint + '；' + honorText : honorText;
    }

    return { disabledMap: map, hint };
  },

  /** 计算番数明细 + 总番 + 是否可胡 */
  computeFanBreakdown(cardTypeKeys, winType, honorValues, qmType, qmDisabledMap) {
    const find = (arr, k) => (arr || []).find(o => o.key === k);
    const breakdown = [];

    // 1) 牌型
    for (const key of (cardTypeKeys || [])) {
      const c = find(CARD_TYPES, key);
      if (c && c.fan > 0) breakdown.push({ name: c.label, fan: c.fan });
    }

    // 2) 胡牌方式
    if (winType) {
      const win = find(WIN_TYPES, winType);
      if (win && win.fan > 0) breakdown.push({ name: win.label, fan: win.fan });
    }

    // 3) 发财
    if (honorValues.facai != null) {
      const fan = honorValues.facai === 4 ? 8 : honorValues.facai;
      breakdown.push({ name: `发财×${honorValues.facai}`, fan });
    }

    // 4) 明杠 / 暗杠
    if (honorValues.mingGang != null) {
      breakdown.push({ name: `明杠数牌×${honorValues.mingGang}`, fan: honorValues.mingGang });
    }
    if (honorValues.anGang != null) {
      breakdown.push({ name: `暗杠数牌×${honorValues.anGang}`, fan: honorValues.anGang * 2 });
    }

    // 5) 红中 / 白板
    if (honorValues.hongZhong) {
      const hz = find(HONGZHONG_OPTIONS, honorValues.hongZhong);
      if (hz && hz.fan > 0) breakdown.push({ name: `红中·${hz.label}`, fan: hz.fan });
    }
    if (honorValues.baiBan) {
      const bb = find(BAIBAN_OPTIONS, honorValues.baiBan);
      if (bb && bb.fan > 0) breakdown.push({ name: `白板·${bb.label}`, fan: bb.fan });
    }

    // 6) 门清与听牌型
    if (qmType && !qmDisabledMap[qmType]) {
      const qm = find(QM_OPTIONS, qmType);
      if (qm && qm.fan > 0) breakdown.push({ name: qm.label, fan: qm.fan });
    }

    const totalFan = breakdown.reduce((s, x) => s + x.fan, 0);
    return { fanBreakdown: breakdown, totalFan };
  },
};
