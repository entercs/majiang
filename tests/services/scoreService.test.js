const { calculateRound } = require('../../miniprogram/services/scoreService');
const { makeRule, makePlayers } = require('../fixtures/rules');
const { WIN_TYPE } = require('../../miniprogram/utils/constants');

describe('scoreService.calculateRound - 自摸 (zimo)', () => {
  test('底分1, 番1, 自摸倍数2 → 赢家+6, 其他各-2', () => {
    const rule = makeRule({ baseScore: 1, zimoMul: 2 });
    const players = makePlayers();
    const input = { winnerId: 'p0', winType: WIN_TYPE.ZIMO, fan: 1, gangEvents: [], maResults: [] };
    const result = calculateRound(rule, input, players);
    expect(result.scoreChanges).toEqual({ p0: 6, p1: -2, p2: -2, p3: -2 });
  });

  test('底分2, 番4, 自摸倍数1 → 赢家+24, 其他各-8', () => {
    const rule = makeRule({ baseScore: 2, zimoMul: 1 });
    const players = makePlayers();
    const input = { winnerId: 'p1', winType: WIN_TYPE.ZIMO, fan: 4, gangEvents: [], maResults: [] };
    const result = calculateRound(rule, input, players);
    // 2*4*1=8 perLose, 自摸赢3家 → p1+24, 其他各-8, 守恒: 24-8-8-8=0
    expect(result.scoreChanges).toEqual({ p0: -8, p1: 24, p2: -8, p3: -8 });
  });

  test('分数守恒：所有玩家变化之和 = 0', () => {
    const rule = makeRule();
    const players = makePlayers();
    const input = { winnerId: 'p0', winType: WIN_TYPE.ZIMO, fan: 3, gangEvents: [], maResults: [] };
    const result = calculateRound(rule, input, players);
    const sum = Object.values(result.scoreChanges).reduce((a, b) => a + b, 0);
    expect(sum).toBe(0);
  });
});

describe('scoreService.calculateRound - 点炮 (dianpao)', () => {
  test('底分1, 番2, 点炮倍数1 → 赢家+2, 点炮者-2, 其他0', () => {
    const rule = makeRule({ baseScore: 1, dianpaoMul: 1 });
    const players = makePlayers();
    const input = { winnerId: 'p1', loserId: 'p3', winType: WIN_TYPE.DIANPAO, fan: 2, gangEvents: [], maResults: [] };
    const result = calculateRound(rule, input, players);
    expect(result.scoreChanges).toEqual({ p0: 0, p1: 2, p2: 0, p3: -2 });
  });

  test('点炮倍数2 → 双方 ×2', () => {
    const rule = makeRule({ baseScore: 1, dianpaoMul: 2 });
    const players = makePlayers();
    const input = { winnerId: 'p0', loserId: 'p2', winType: WIN_TYPE.DIANPAO, fan: 1, gangEvents: [], maResults: [] };
    const result = calculateRound(rule, input, players);
    expect(result.scoreChanges).toEqual({ p0: 2, p1: 0, p2: -2, p3: 0 });
  });

  test('分数守恒', () => {
    const rule = makeRule();
    const players = makePlayers();
    const input = { winnerId: 'p0', loserId: 'p1', winType: WIN_TYPE.DIANPAO, fan: 5, gangEvents: [], maResults: [] };
    const result = calculateRound(rule, input, players);
    const sum = Object.values(result.scoreChanges).reduce((a, b) => a + b, 0);
    expect(sum).toBe(0);
  });
});

describe('scoreService.calculateRound - 封顶 (maxFan)', () => {
  test('maxFan=8, 输入番10 → 实际按8算', () => {
    const rule = makeRule({ baseScore: 1, zimoMul: 2, maxFan: 8 });
    const players = makePlayers();
    const input = { winnerId: 'p0', winType: WIN_TYPE.ZIMO, fan: 10, gangEvents: [], maResults: [] };
    const result = calculateRound(rule, input, players);
    // effectiveFan=8, huScore=8, perLose=16, 赢家+48, 其他各-16
    expect(result.scoreChanges).toEqual({ p0: 48, p1: -16, p2: -16, p3: -16 });
  });

  test('maxFan=0, 输入番100 → 不封顶', () => {
    const rule = makeRule({ baseScore: 1, zimoMul: 1, maxFan: 0 });
    const players = makePlayers();
    const input = { winnerId: 'p0', winType: WIN_TYPE.ZIMO, fan: 100, gangEvents: [], maResults: [] };
    const result = calculateRound(rule, input, players);
    // effectiveFan=100, huScore=100, perLose=100, 赢家+300, 其他各-100
    expect(result.scoreChanges).toEqual({ p0: 300, p1: -100, p2: -100, p3: -100 });
  });
});

describe('scoreService.calculateRound - 杠分', () => {
  test('明杠（抓牌）：杠牌者赢 3 家各 1 分', () => {
    const rule = makeRule({ mingGangScore: 1 });
    const players = makePlayers();
    const input = { winnerId: 'p0', winType: WIN_TYPE.ZIMO, fan: 0, gangEvents: [{ type: 'ming', playerId: 'p0' }], maResults: [] };
    const result = calculateRound(rule, input, players);
    // 杠牌者 +3，其他 -1
    expect(result.scoreChanges).toEqual({ p0: 3, p1: -1, p2: -1, p3: -1 });
  });

  test('暗杠：杠牌者赢 3 家各 2 分', () => {
    const rule = makeRule({ anGangScore: 2 });
    const players = makePlayers();
    const input = { winnerId: 'p0', winType: WIN_TYPE.ZIMO, fan: 0, gangEvents: [{ type: 'an', playerId: 'p1' }], maResults: [] };
    const result = calculateRound(rule, input, players);
    // p1 +6，其他 -2
    expect(result.scoreChanges).toEqual({ p0: -2, p1: 6, p2: -2, p3: -2 });
  });

  test('补杠：杠牌者赢 3 家各 1 分', () => {
    const rule = makeRule({ bugangScore: 1 });
    const players = makePlayers();
    const input = { winnerId: 'p0', winType: WIN_TYPE.ZIMO, fan: 0, gangEvents: [{ type: 'bu', playerId: 'p2' }], maResults: [] };
    const result = calculateRound(rule, input, players);
    expect(result.scoreChanges).toEqual({ p0: -1, p1: -1, p2: 3, p3: -1 });
  });

  test('明杠（被点杠）：被杠者得 1 分', () => {
    const rule = makeRule({ mingGangScore: 1 });
    const players = makePlayers();
    // p0 杠 p1 出的牌 → p0 +1, p1 -1
    const input = { winnerId: 'p0', winType: WIN_TYPE.ZIMO, fan: 0, gangEvents: [{ type: 'ming', playerId: 'p0', targetPlayerId: 'p1' }], maResults: [] };
    const result = calculateRound(rule, input, players);
    expect(result.scoreChanges).toEqual({ p0: 1, p1: -1, p2: 0, p3: 0 });
  });

  test('多根杠：2 根明杠 + 1 根暗杠（不同人）', () => {
    const rule = makeRule({ mingGangScore: 1, anGangScore: 2 });
    const players = makePlayers();
    const input = {
      winnerId: 'p0', winType: WIN_TYPE.ZIMO, fan: 0,
      gangEvents: [
        { type: 'ming', playerId: 'p0' },
        { type: 'ming', playerId: 'p0' },
        { type: 'an', playerId: 'p1' },
      ],
      maResults: []
    };
    const result = calculateRound(rule, input, players);
    // 2 ming (p0 抓牌, mingGangScore=1): p0 +3+3=+6, 其他各-1
    // 1 an (p1, anGangScore=2): p1 +6, 其他各-2
    // p0: 3+3-2 = +4
    // p1: -1-1+6 = +4
    // p2: -1-1-2 = -4
    // p3: -1-1-2 = -4
    // 守恒: 4+4-4-4 = 0
    expect(result.scoreChanges).toEqual({ p0: 4, p1: 4, p2: -4, p3: -4 });
  });

  test('分数守恒（带杠）', () => {
    const rule = makeRule();
    const players = makePlayers();
    const input = {
      winnerId: 'p0', winType: WIN_TYPE.DIANPAO, loserId: 'p3', fan: 2,
      gangEvents: [{ type: 'ming', playerId: 'p1' }, { type: 'an', playerId: 'p2' }],
      maResults: []
    };
    const result = calculateRound(rule, input, players);
    const sum = Object.values(result.scoreChanges).reduce((a, b) => a + b, 0);
    expect(sum).toBe(0);
  });
});

describe('scoreService.calculateRound - 买马', () => {
  test('maCount=2, 中 1 马 → 赢家独得 3 分（保守算法：3 家各付 ceil(1/3)=1）', () => {
    // 保守实现：perLose = ceil(total/3) = ceil(1/3) = 1
    // winner +3, 3 家各 -1
    // 守恒: 3 - 1 - 1 - 1 = 0 ✓
    // 注意：winnerGain=3 略大于实际 ma total=1，这是保守的"上取整"代价
    const rule = makeRule({ baseScore: 1, maCount: 2 });
    const players = makePlayers();
    const input = {
      winnerId: 'p0', winType: WIN_TYPE.ZIMO, fan: 0,
      gangEvents: [],
      maResults: [true, false], // 中 1 马
    };
    const result = calculateRound(rule, input, players);
    expect(result.scoreChanges).toEqual({ p0: 3, p1: -1, p2: -1, p3: -1 });
  });

  test('maCount=6, 中 3 马 → 赢家独得 3 分', () => {
    // hitCount=3, total=3, perLose=ceil(3/3)=1
    // 3 家各付 1，赢家得 3（3*1=3 == total，守恒严格相等）
    const rule = makeRule({ baseScore: 1, maCount: 6 });
    const players = makePlayers();
    const input = {
      winnerId: 'p0', winType: WIN_TYPE.ZIMO, fan: 0,
      gangEvents: [],
      maResults: [true, true, true, false, false, false],
    };
    const result = calculateRound(rule, input, players);
    expect(result.scoreChanges.p0).toBe(3);
  });
});

describe('scoreService.calculateRound - 庄家加成', () => {
  test('dealerMul=2, 庄家自摸 → 庄家净收入 ×2', () => {
    const rule = makeRule({ baseScore: 1, zimoMul: 1, dealerMul: 2 });
    const players = makePlayers(); // p0 是庄家
    const input = { winnerId: 'p0', winType: WIN_TYPE.ZIMO, fan: 1, gangEvents: [], maResults: [] };
    const result = calculateRound(rule, input, players);
    // 基础: p0+3, 其他-1
    // 加成: 庄家自摸时所有玩家都 ×2 → p0+6, 其他-2
    expect(result.scoreChanges).toEqual({ p0: 6, p1: -2, p2: -2, p3: -2 });
  });

  test('dealerMul=2, 闲家点炮给庄家 → 庄家净收入 ×2', () => {
    const rule = makeRule({ baseScore: 1, dianpaoMul: 1, dealerMul: 2 });
    const players = makePlayers(); // p0 是庄家
    const input = { winnerId: 'p0', loserId: 'p2', winType: WIN_TYPE.DIANPAO, fan: 1, gangEvents: [], maResults: [] };
    const result = calculateRound(rule, input, players);
    // 基础: p0+1, p2-1
    // 加成: 庄家点炮胡时, 庄家和点炮者都 ×2 → p0+2, p2-2
    expect(result.scoreChanges).toEqual({ p0: 2, p1: 0, p2: -2, p3: 0 });
  });

  test('dealerMul=1 → 不加成', () => {
    const rule = makeRule({ zimoMul: 1, dealerMul: 1 });
    const players = makePlayers();
    const input = { winnerId: 'p0', winType: WIN_TYPE.ZIMO, fan: 1, gangEvents: [], maResults: [] };
    const result = calculateRound(rule, input, players);
    expect(result.scoreChanges).toEqual({ p0: 3, p1: -1, p2: -1, p3: -1 });
  });
});
