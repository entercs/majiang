const fc = require('fast-check');
const { calculateRound } = require('../../miniprogram/services/scoreService');
const { makeRule, makePlayers } = require('../fixtures/rules');
const { WIN_TYPE, ZIMO_TYPES, DIANPAO_TYPES } = require('../../miniprogram/utils/constants');

const ruleArb = fc.record({
  baseScore: fc.integer({ min: 1, max: 5 }),
  zimoMul: fc.integer({ min: 1, max: 3 }),
  dianpaoMul: fc.integer({ min: 1, max: 3 }),
  mingGangScore: fc.integer({ min: 0, max: 3 }),
  anGangScore: fc.integer({ min: 0, max: 4 }),
  bugangScore: fc.integer({ min: 0, max: 3 }),
  maxFan: fc.integer({ min: 0, max: 16 }),
  maCount: fc.integer({ min: 0, max: 6 }),
  dealerMul: fc.integer({ min: 1, max: 2 }),
  allowDianpao: fc.boolean(),
});

const playerIdArb = fc.constantFrom('p0', 'p1', 'p2', 'p3');
const winTypeArb = fc.constantFrom(...Object.values(WIN_TYPE));

describe('scoreService - 不变式属性测试', () => {
  test('分数守恒：Σ scoreChanges === 0', () => {
    fc.assert(
      fc.property(
        ruleArb, winTypeArb, playerIdArb, playerIdArb,
        fc.integer({ min: 0, max: 20 }),
        (rule, winType, winnerId, loserId, fan) => {
          // 自摸型不需要 loserId
          const input = ZIMO_TYPES.has(winType)
            ? { winnerId, winType, fan, gangEvents: [], maResults: [] }
            : { winnerId, loserId: loserId === winnerId ? (winnerId === 'p1' ? 'p0' : 'p1') : loserId, winType, fan, gangEvents: [], maResults: [] };
          if (DIANPAO_TYPES.has(winType) && !rule.allowDianpao) return true; // skip illegal combos
          const players = makePlayers();
          const result = calculateRound(rule, input, players);
          const sum = Object.values(result.scoreChanges).reduce((a, b) => a + b, 0);
          return sum === 0;
        }
      ),
      { numRuns: 500 }
    );
  });
});


test('1-7 人、买马、杠分与庄家倍数混合时分数守恒', () => {
  fc.assert(fc.property(ruleArb, fc.integer({ min: 1, max: 7 }),
    fc.integer({ min: 0, max: 6 }), fc.integer({ min: 0, max: 6 }),
    fc.array(fc.boolean(), { maxLength: 6 }),
    fc.array(fc.record({ type: fc.constantFrom('ming', 'an', 'bu'),
      index: fc.integer({ min: 0, max: 6 }) }), { maxLength: 5 }),
    (rule, count, winnerIndex, loserIndex, maResults, events) => {
      const players = Array.from({ length: count }, (_, i) => ({ _id: 'p' + i, seatIndex: i }));
      const winner = winnerIndex % count;
      let loser = loserIndex % count;
      if (loser === winner) loser = (winner + 1) % count;
      const input = { winnerId: 'p' + winner, loserId: 'p' + loser,
        winType: count > 1 && rule.allowDianpao ? WIN_TYPE.DIANPAO : WIN_TYPE.ZIMO,
        fan: 2, maResults, gangEvents: events.map(e => ({ type: e.type, playerId: 'p' + e.index % count })) };
      const result = calculateRound(rule, input, players);
      expect(result.isBalanced).toBe(true);
      expect(Object.values(result.scoreChanges).every(Number.isFinite)).toBe(true);
    }), { numRuns: 1000, seed: 20261012 });
});
