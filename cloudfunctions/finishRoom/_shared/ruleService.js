function getDefaultRule() {
  return {
    baseScore: 1,
    zimoMul: 2,
    dianpaoMul: 1,
    mingGangScore: 1,
    anGangScore: 2,
    bugangScore: 1,
    maxFan: 0,
    maCount: 0,
    dealerMul: 1,
    allowDianpao: true,
  };
}

function validateRule(rule) {
  if (!rule || typeof rule !== 'object') return false;
  const fields = ['baseScore', 'zimoMul', 'dianpaoMul', 'mingGangScore', 'anGangScore', 'bugangScore', 'maxFan', 'maCount', 'dealerMul', 'allowDianpao'];
  for (const f of fields) {
    if (!(f in rule)) return false;
  }
  const numericFields = ['baseScore', 'zimoMul', 'dianpaoMul', 'mingGangScore', 'anGangScore', 'bugangScore', 'maxFan', 'maCount', 'dealerMul'];
  for (const f of numericFields) {
    if (typeof rule[f] !== 'number' || rule[f] < 0) return false;
  }
  if (typeof rule.allowDianpao !== 'boolean') return false;
  return true;
}

module.exports = { getDefaultRule, validateRule };
