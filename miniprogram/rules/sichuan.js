// ============== 四川麻将（血战到底）规则配置 ==============

// 基础番型：单选，取最高，不叠加
// 番数：1/2/3/4（4番封顶）
const CARD_TYPES = [
  { key: 'pinghu',     label: '平胡',     fan: 1 },  // 1番：最基础胡牌型
  { key: 'duiduihu',   label: '对对胡',   fan: 2 },  // 2番：全部刻子+一对将
  { key: 'qiyidui',    label: '七对',     fan: 3 },  // 3番：7个对子
  { key: 'qingyise',   label: '清一色',   fan: 3 },  // 3番：同花色
  { key: 'longqidui',  label: '龙七对',   fan: 4 },  // 4番：七对含至少1组四张，自带1根
  { key: 'qingqidui',  label: '清七对',   fan: 4 },  // 4番：清一色+七对
  { key: 'qingdui',    label: '清对',     fan: 4 },  // 4番：清一色+对对胡
  { key: 'jiangdui',   label: '将对',     fan: 4 },  // 4番：2/5/8刻子+将
  { key: 'quanqiuren', label: '全求人',   fan: 2 },  // 金钩钓：碰杠+单吊，+1番可叠加
];

// 基础番型内部互斥（单选，取最高）
const CARD_RIVAL = {
  qiyidui: 'duiduihu',    // 七对 ↔ 对对胡
  duiduihu: 'qiyidui',   // 对对胡 ↔ 七对
  // 清一色/七对 与 平胡 不直接互斥，由 fan 大小决定取谁
};

// 特殊胡牌加番项：每项+1番，可叠加
const SPECIAL_WIN_TYPES = [
  { key: 'zimo',       label: '自摸',      fan: 1 },
  { key: 'gangshanghua', label: '杠上花',  fan: 1 },
  { key: 'gangshangpao', label: '杠上炮',  fan: 1 },
  { key: 'qiangganghu',  label: '抢杠胡',  fan: 1 },
  { key: 'haidilaoyue',  label: '海底捞月', fan: 1 },
  { key: 'haidipao',     label: '海底炮',  fan: 1 },
  { key: 'jinngoudiao',  label: '金钩钓',  fan: 1 }, // 全求人的加番部分独立计算
];

// 四川麻将无字牌，无发财/红中/白板/明杠/暗杠等字牌选项
// 杠牌（刮风下雨）独立即时结算，不进番数，此处不设置杠选项

// 封顶番数
const MAX_FAN = 4; // 4番封顶（16倍底分）

// ========== 导出统一的配置对象 ==========
module.exports = {
  name: '四川麻将',
  canHuThreshold: 1,  // 1番起胡

  defaults: {
    cardTypeKeys: ['pinghu'],
    specialWinTypes: [],  // 多选
    genCount: 0,          // 根的数量（龙七对默认带1根，用户可调）
    winType: 'dianpao',   // 点炮（无加番）/ 自摸（+1番）归入 specialWinTypes
  },

  // --- 各区域的选项定义 ---
  sections: {
    cardTypes: CARD_TYPES,
    primaryCards: [],    // 四川麻将无 primary 组概念
    cardRival: CARD_RIVAL,
    specialWinTypes: SPECIAL_WIN_TYPES,
    maxFan: MAX_FAN,
  },

  /** 在数组中按 key 查找选项 */
  find(arr, key) {
    return arr.find(o => o.key === key);
  },

  /** 牌型单选：互斥处理（取最高 fan） */
  applyCardMutex(value, currentKeys) {
    // 四川麻将基础番型单选，取 fan 最高者
    const target = CARD_TYPES.find(t => t.key === value);
    if (!target) return currentKeys;

    // 如果选的是当前已有，直接返回（取消选中则清空）
    if (currentKeys.includes(value)) {
      return [];
    }

    // 否则选新的，旧的全清掉（单选）
    return [value];
  },

  /** 构建 cardTypeSelected 映射表 */
  buildCardTypeSelected(keys) {
    const map = {};
    CARD_TYPES.forEach(t => { map[t.key] = keys.includes(t.key); });
    return map;
  },

  /** 四川麻将无门清/听牌型 */
  applyQmMutex() {
    return { disabledMap: {}, hint: '' };
  },

  /**
   * 计算四川麻将番数明细
   * @param {string[]} cardTypeKeys - 基础牌型 key 列表（理论上只有1个）
   * @param {string[]} specialWinTypes - 特殊加番项 key 列表
   * @param {number} genCount - 根的数量
   * @returns {{ fanBreakdown: Array<{name, fan}>, totalFan: number, cappedFan: number }}
   */
  computeFanBreakdown(cardTypeKeys, specialWinTypes, genCount) {
    const find = (arr, k) => (arr || []).find(o => o.key === k);
    const breakdown = [];

    // 1) 基础番型（单选，取最高 fan）
    const baseType = (cardTypeKeys || [])[0];
    if (baseType) {
      const ct = find(CARD_TYPES, baseType);
      if (ct && ct.fan > 0) breakdown.push({ name: ct.label, fan: ct.fan });
    }

    // 2) 特殊加番项（每项+1番，可叠加）
    for (const key of (specialWinTypes || [])) {
      const sw = find(SPECIAL_WIN_TYPES, key);
      if (sw && sw.fan > 0) breakdown.push({ name: sw.label, fan: sw.fan });
    }

    // 3) 根（每组四张+1番，可叠加；龙七对默认带1根由调用方保证）
    if (genCount > 0) {
      breakdown.push({ name: `根×${genCount}`, fan: genCount });
    }

    // 4) 金钩钓（全求人）额外+1番（如果选了全求人的话）
    // 注意：全求人基础番型为2番，金钩钓加番在 specialWinTypes 里

    // 计算总番数（未封顶）
    let totalFan = breakdown.reduce((s, x) => s + x.fan, 0);

    // 封顶处理：超过4番按4番算
    const cappedFan = Math.min(totalFan, MAX_FAN);

    return { fanBreakdown: breakdown, totalFan, cappedFan };
  },

  /** 计算最终倍数（2^n，封顶16） */
  computeMultiplier(totalFan) {
    const capped = Math.min(totalFan, MAX_FAN);
    return Math.pow(2, capped);
  },
};