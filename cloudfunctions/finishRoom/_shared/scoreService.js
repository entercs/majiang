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

  // 2. Gang events
  if (gangEvents && gangEvents.length > 0) {
    applyGangEvents(rule, gangEvents, players, scoreChanges, breakdown);
  }

  // 3. Ma (买马)
  if (rule.maCount > 0 && maResults && maResults.length > 0) {
    applyMa(rule, winnerId, maResults, players, scoreChanges, breakdown);
  }

  // 4. Dealer multiplier
  if (rule.dealerMul > 1) {
    applyDealerMul(players, winnerId, loserId, winType, rule.dealerMul, scoreChanges);
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
  scoreChanges[winnerId] = (scoreChanges[winnerId] || 0) + pay;
  scoreChanges[loserId] = (scoreChanges[loserId] || 0) - pay;
}

function applyGangEvents(rule, gangEvents, players, scoreChanges, breakdown) {
  gangEvents.forEach((ev) => {
    const score = ev.type === GANG_TYPE.AN ? rule.anGangScore
                : ev.type === GANG_TYPE.BU ? rule.bugangScore
                : rule.mingGangScore;

    if (ev.type === GANG_TYPE.MING && ev.targetPlayerId) {
      // 被点杠：点杠者付分给杠牌者（杠牌者得、点杠者失）
      scoreChanges[ev.playerId] = (scoreChanges[ev.playerId] || 0) + score;
      scoreChanges[ev.targetPlayerId] = (scoreChanges[ev.targetPlayerId] || 0) - score;
      breakdown.gangDetails.push({ type: 'ming点杠', playerId: ev.playerId, target: ev.targetPlayerId, score });
    } else {
      // 抓牌/暗/补杠：其他各家各付给杠牌者
      const othersCount = Math.max(players.length - 1, 0);
      if (othersCount === 0) return;
      players.forEach((p) => {
        if (p._id === ev.playerId) {
          scoreChanges[p._id] = (scoreChanges[p._id] || 0) + score * othersCount;
        } else {
          scoreChanges[p._id] = (scoreChanges[p._id] || 0) - score;
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
  // 守恒分配：3 家各付 ceil(total/3)，胡牌者独得 (perLose * 3) 分
  // 余数 (perLose*3 - total) 归胡牌者 → 守恒: 3*perLose - perLose*3 = 0
  const perLose = Math.ceil(total / 3);
  const winnerGain = perLose * 3;
  scoreChanges[winnerId] = (scoreChanges[winnerId] || 0) + winnerGain;
  players.forEach((p) => {
    if (p._id !== winnerId) {
      scoreChanges[p._id] = (scoreChanges[p._id] || 0) - perLose;
    }
  });
  breakdown.maDetails.push({ hitCount, total, perLose, winnerGain });
}

function applyDealerMul(players, winnerId, loserId, winType, dealerMul, scoreChanges) {
  const dealer = players.find((p) => p.seatIndex === SEAT.EAST);
  if (!dealer) return;
  const dealerId = dealer._id;

  if (ZIMO_TYPES.has(winType) && winnerId === dealerId) {
    // 庄家自摸：所有玩家都 × dealerMul
    players.forEach((p) => {
      scoreChanges[p._id] = scoreChanges[p._id] * dealerMul;
    });
  } else if (winnerId === dealerId) {
    // 庄家胡（点炮）：庄家和点炮者都 × dealerMul
    scoreChanges[dealerId] = scoreChanges[dealerId] * dealerMul;
    if (loserId) {
      scoreChanges[loserId] = scoreChanges[loserId] * dealerMul;
    }
  } else if (loserId === dealerId) {
    // 庄家点炮：庄家和胡牌者都 × dealerMul
    scoreChanges[dealerId] = scoreChanges[dealerId] * dealerMul;
    if (winnerId) {
      scoreChanges[winnerId] = scoreChanges[winnerId] * dealerMul;
    }
  }
}

module.exports = { calculateRound };
