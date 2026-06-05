const { getDefaultRule, validateRule } = require('../../miniprogram/services/ruleService');

describe('ruleService', () => {
  test('getDefaultRule returns complete rule', () => {
    const r = getDefaultRule();
    expect(r).toHaveProperty('baseScore');
    expect(r).toHaveProperty('zimoMul');
    expect(r).toHaveProperty('dianpaoMul');
    expect(r).toHaveProperty('mingGangScore');
    expect(r).toHaveProperty('anGangScore');
    expect(r).toHaveProperty('bugangScore');
    expect(r).toHaveProperty('maxFan');
    expect(r).toHaveProperty('maCount');
    expect(r).toHaveProperty('dealerMul');
    expect(r).toHaveProperty('allowDianpao');
  });
  test('validateRule accepts default', () => {
    expect(validateRule(getDefaultRule())).toBe(true);
  });
  test('validateRule rejects missing field', () => {
    const r = getDefaultRule();
    delete r.baseScore;
    expect(validateRule(r)).toBe(false);
  });
  test('validateRule rejects negative', () => {
    const r = { ...getDefaultRule(), baseScore: -1 };
    expect(validateRule(r)).toBe(false);
  });
});
