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
    if (!Number.isFinite(rule[f]) || rule[f] < 0) return false;
  }
  if (!Number.isSafeInteger(rule.baseScore) || rule.baseScore < 1) return false;
  if (typeof rule.allowDianpao !== 'boolean') return false;

  // 可选字段：cardTypeFans / winTypeFans（存在时校验结构）
  if (rule.cardTypeFans != null) {
    if (typeof rule.cardTypeFans !== 'object' || Array.isArray(rule.cardTypeFans)) return false;
    for (const v of Object.values(rule.cardTypeFans)) {
      if (!Number.isFinite(v) || v < 0 || v > 100) return false;
    }
  }
  if (rule.winTypeFans != null) {
    if (typeof rule.winTypeFans !== 'object' || Array.isArray(rule.winTypeFans)) return false;
    for (const v of Object.values(rule.winTypeFans)) {
      if (!Number.isFinite(v) || v < 0 || v > 100) return false;
    }
  }

  return true;
}

module.exports = { getDefaultRule, validateRule };
