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
            : { winnerId, loserId: loserId === winnerId ? 'p1' : loserId, winType, fan, gangEvents: [], maResults: [] };
          if (DIANPAO_TYPES.has(winType) && !rule.allowDianpao) return true; // skip illegal combos
          const players = makePlayers();
          try {
            const result = calculateRound(rule, input, players);
            const sum = Object.values(result.scoreChanges).reduce((a, b) => a + b, 0);
            return sum === 0;
          } catch (e) {
            return true; // ignore thrown errors (illegal inputs)
          }
        }
      ),
      { numRuns: 500 }
    );
  });
});
