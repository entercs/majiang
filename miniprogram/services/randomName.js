/**
 * 麻将术语风随机昵称生成
 * 一万、二条、三筒、东风、红中、发财 等
 */

const MAHJONG_NAMES = [
  // 风牌
  '东风', '南风', '西风', '北风',
  // 三元牌
  '红中', '发财', '白板',
  // 万子
  '一万', '二万', '三万', '四万', '五万', '六万', '七万', '八万', '九万',
  // 筒子
  '一筒', '二筒', '三筒', '四筒', '五筒', '六筒', '七筒', '八筒', '九筒',
  // 索子
  '一条', '二条', '三条', '四条', '五条', '六条', '七条', '八条', '九条',
  // 花牌
  '梅', '兰', '竹', '菊', '春', '夏', '秋', '冬',
];

/**
 * 随机抽取一个麻将名字
 */
function pickRandomName() {
  return MAHJONG_NAMES[Math.floor(Math.random() * MAHJONG_NAMES.length)];
}

module.exports = {
  MAHJONG_NAMES,
  pickRandomName,
};
