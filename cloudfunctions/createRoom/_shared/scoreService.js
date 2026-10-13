const { WIN_TYPE, ZIMO_TYPES, DIANPAO_TYPES, GANG_TYPE, SEAT } = require('./constants');

/**
 * Calculate score changes for a single round (pure function).
 * @param {Object} rule
 * @param {Object} input - { winnerId, winType, loserId?, fan, gangEvents, maResults }
 * @param {Array} players - 4 players
 * @returns {{scoreChanges: Object, breakdown: Object, isBalanced: boolean}}
 */
function calculateRound(rule, input, players) {
  const { winnerId, winType, loserId, fan, gangEvents = [], maResults = [] } = input;
  const scoreChanges = {};
  players.forEach((p) => { scoreChanges[p._id] = 0; });

  const breakdown = { huScore: 0, gangDetails: [], maDetails: [] };

  // 1. Base hu score with max-fan cap
  const effectiveFan = rule.maxFan > 0 ? Math.min(fan, rule.maxFan) : fan;
  const huScore = rule.baseScore * effectiveFan;
  breakdown.huScore = huScore;

  if (ZIMO_TYPES.has(winType)) {
    applyZimo(players, winnerId, huScore, rule.zimoMul, scoreChanges);
  } else if (DIANPAO_TYPES.has(winType)) {
    applyDianpao(winnerId, loserId, huScore, rule.dianpaoMul, scoreChanges);
  }

  // 庄家倍数只应用于胡牌转移，避免将其他玩家杠分一起放大而破坏守恒。
  if (rule.dealerMul > 1) {
    applyDealerMul(players, winnerId, loserId, winType, rule.dealerMul, scoreChanges);
  }


  // 2. Gang events
  if (gangEvents && gangEvents.length > 0) {
    applyGangEvents(rule, gangEvents, players, scoreChanges, breakdown);
  }

  // 3. Ma (买马)
  if (rule.maCount > 0 && maResults && maResults.length > 0) {
    applyMa(rule, winnerId, maResults, players, scoreChanges, breakdown);
  }


  const isBalanced = Object.values(scoreChanges).reduce((a, b) => a + b, 0) === 0;

  return { scoreChanges, breakdown, isBalanced };
}

function applyZimo(players, winnerId, huScore, mul, scoreChanges) {
  const perLose = huScore * mul;
  const othersCount = Math.max(players.length - 1, 0);
  if (othersCount === 0) return; // N=1, no-op（守恒：没变化）
  players.forEach((p) => {
    if (p._id === winnerId) {
      scoreChanges[p._id] += perLose * othersCount;
    } else {
      scoreChanges[p._id] -= perLose;
    }
  });
}

function applyDianpao(winnerId, loserId, huScore, mul, scoreChanges) {
  const pay = huScore * mul;
  scoreChanges[winnerId] += pay;
  scoreChanges[loserId] -= pay;
}

function applyGangEvents(rule, gangEvents, players, scoreChanges, breakdown) {
  gangEvents.forEach((ev) => {
    const score = ev.type === GANG_TYPE.AN ? rule.anGangScore
                : ev.type === GANG_TYPE.BU ? rule.bugangScore
                : rule.mingGangScore;

    if (ev.type === GANG_TYPE.MING && ev.targetPlayerId) {
      // 被点杠：点杠者付分给杠牌者（杠牌者得、点杠者失）
      scoreChanges[ev.playerId] += score;
      scoreChanges[ev.targetPlayerId] -= score;
      breakdown.gangDetails.push({ type: 'ming点杠', playerId: ev.playerId, target: ev.targetPlayerId, score });
    } else {
      // 抓牌/暗/补杠：其他各家各付给杠牌者
      const othersCount = Math.max(players.length - 1, 0);
      if (othersCount === 0) return;
      players.forEach((p) => {
        if (p._id === ev.playerId) {
          scoreChanges[p._id] += score * othersCount;
        } else {
          scoreChanges[p._id] -= score;
        }
      });
      breakdown.gangDetails.push({ type: ev.type, playerId: ev.playerId, score, perLose: score });
    }
  });
}

function applyMa(rule, winnerId, maResults, players, scoreChanges, breakdown) {
  const hitCount = maResults.filter(Boolean).length;
  if (hitCount === 0) return;
  const total = hitCount * rule.baseScore;
  const othersCount = Math.max(players.length - 1, 0);
  if (othersCount === 0) return;
  const perLose = Math.ceil(total / othersCount);
  const winnerGain = perLose * othersCount;
  scoreChanges[winnerId] += winnerGain;
  players.forEach((p) => {
    if (p._id !== winnerId) {
      scoreChanges[p._id] -= perLose;
    }
  });
  breakdown.maDetails.push({ hitCount, total, perLose, winnerGain });
}

function applyDealerMul(players, winnerId, loserId, winType, dealerMul, scoreChanges) {
  const dealer = players.find((p) => p.seatIndex === SEAT.EAST);
  if (!dealer) return;
  const dealerId = dealer._id;

  if (ZIMO_TYPES.has(winType)) {
    if (winnerId === dealerId) {
      players.forEach(p => { scoreChanges[p._id] *= dealerMul; });
    }
    return; // 自摸不应使用残留的 loserId
  }
  if (!DIANPAO_TYPES.has(winType)) return;
  if (winnerId === dealerId || loserId === dealerId) {
    scoreChanges[winnerId] *= dealerMul;
    scoreChanges[loserId] *= dealerMul;
  }
}

module.exports = { calculateRound };
