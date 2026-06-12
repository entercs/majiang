// ============== 四川麻将（血战到底）规则配置 ==============
// 注意：四川麻将各地规则有差异，以下为常见规则，
// 不确定处用 ??? 标注，等待用户确认

const CARD_TYPES = [
  { key: 'pinghu', label: '平胡', fan: 1 },
  { key: 'duiduihu', label: '对对胡', fan: 2 },     // 碰碰胡
  { key: 'qingyise', label: '清一色', fan: 2 },
  { key: 'qiyidui', label: '七对', fan: 2 },
  { key: 'quanqiuren', label: '全求人', fan: 2 },   // 金钩钓
  // ??? 是否需要加混一色？（川麻无字牌，混一色和清一色有区别但较少见）
  // ??? 是否需要加带幺/幺九？
];

const PRIMARY_CARDS = ['pinghu'];
const CARD_RIVAL = {
  duiduiihu: 'qiyidui',    // ??? 核对互斥关系
  qiyidui: 'duiduihu',
  // ??? 清一色是否与其他牌型互斥？
};

// ??? 四川麻将是否有组合番？如清一色+对对胡额外加番？
// ??? 是否有"根"（四张相同牌）的番数？

const WIN_TYPES = [
  { key: 'dianpao', label: '点炮', fan: 0 },
  { key: 'zimo', label: '自摸', fan: 1 },
  // ??? 杠上花、抢杠、海底捞月是否作为胡牌方式？
  // 有些版本把它们作为独立番型而非胡牌方式选项
];

// ??? 四川麻将没有字牌（无东南西北中发白），所以：
// - 发财 → 不需要
// - 红中 → 有时候有"红中麻将"变种，标准川麻没有
// - 明杠/暗杠 → 有时会计番（明杠1番/暗杠2番），但更常见的是直接加底分
// 下面暂时留空，等待用户确认

// ??? 四川麻将通常没有门清与听牌型作为单独选项
// （门清本身可以计番，卡张/边张/单吊通常不计番或作为听牌标记）
const QM_OPTIONS = [
  // { key: 'menqianqing', label: '门前清', fan: 1 },
  // { key: 'kadang', label: '卡张', fan: 1 },
];

// ??? 互斥规则需要确认

module.exports = {
  name: '四川麻将',
  canHuThreshold: 1,  // 四川麻将通常1番起胡
  defaults: {
    cardTypeKeys: ['pinghu'],
    winType: 'dianpao',
    honor: {
      // ??? 待确认
    },
    qmType: null,
  },

  sections: {
    cardTypes: CARD_TYPES,
    primaryCards: PRIMARY_CARDS,
    cardRival: CARD_RIVAL,
    winTypes: WIN_TYPES,
    qmOptions: QM_OPTIONS,
    honorConflictsWithMenqing: [],
    honorSections: [
      // ??? 待确认
    ],
  },

  find(arr, key) {
    return arr.find(o => o.key === key);
  },

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

  buildCardTypeSelected(keys) {
    const map = {};
    CARD_TYPES.forEach(t => { map[t.key] = keys.includes(t.key); });
    return map;
  },

  applyQmMutex(cardTypeKeys, honorValues) {
    return { disabledMap: {}, hint: '' };
  },

  computeFanBreakdown(cardTypeKeys, winType, honorValues, qmType, qmDisabledMap) {
    const find = (arr, k) => (arr || []).find(o => o.key === k);
    const breakdown = [];

    for (const key of (cardTypeKeys || [])) {
      const c = find(CARD_TYPES, key);
      if (c && c.fan > 0) breakdown.push({ name: c.label, fan: c.fan });
    }

    if (winType) {
      const win = find(WIN_TYPES, winType);
      if (win && win.fan > 0) breakdown.push({ name: win.label, fan: win.fan });
    }

    // ??? 杠牌处理待确认
    // if (honorValues.mingGang != null) ...
    // if (honorValues.anGang != null) ...

    if (qmType && !qmDisabledMap[qmType]) {
      const qm = find(QM_OPTIONS, qmType);
      if (qm && qm.fan > 0) breakdown.push({ name: qm.label, fan: qm.fan });
    }

    const totalFan = breakdown.reduce((s, x) => s + x.fan, 0);
    return { fanBreakdown: breakdown, totalFan };
  },
};
