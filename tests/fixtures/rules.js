function makeRule(overrides = {}) {
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
    ...overrides,
  };
}

function makePlayers(overrides = []) {
  const defaults = [
    { _id: 'p0', nickname: '东', seatIndex: 0 },
    { _id: 'p1', nickname: '南', seatIndex: 1 },
    { _id: 'p2', nickname: '西', seatIndex: 2 },
    { _id: 'p3', nickname: '北', seatIndex: 3 },
  ];
  return defaults.map((d, i) => ({ ...d, ...(overrides[i] || {}) }));
}

module.exports = { makeRule, makePlayers };
