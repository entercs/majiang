/**
 * 计分记录分组：从每组首笔起算，60 秒内归为同一组。
 */

const DEFAULT_WINDOW_MS = 60 * 1000;

/**
 * @param {Array} rounds - rounds 数组
 * @param {number} windowMs - 首笔起算的分组窗口（默认 60 秒）
 * @returns {Array<{startTime, endTime, items}>} - 每组包含 startTime、endTime、记录列表
 */
function groupRoundsBySession(rounds, windowMs = DEFAULT_WINDOW_MS) {
  if (!rounds || rounds.length === 0) return [];
  const sorted = [...rounds].sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  const groups = [];
  let current = null;

  for (const r of sorted) {
    const t = r.createdAt || 0;
    if (!current || t - current.startTime > windowMs) {
      if (current) groups.push(current);
      current = { startTime: t, endTime: t, items: [] };
    } else {
      current.endTime = t;
    }
    current.items.push(r);
  }
  if (current) groups.push(current);
  return groups;
}

/**
 * 判断最后一组是否仍在首笔起算的时间窗口内
 */
function isOngoing(groups, now = Date.now(), windowMs = DEFAULT_WINDOW_MS) {
  if (!groups || groups.length === 0) return false;
  const last = groups[groups.length - 1];
  return now >= last.startTime && now - last.startTime <= windowMs;
}

/**
 * 格式化时间戳为 HH:MM:SS
 */
function formatTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const pad = (x) => String(x).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/**
 * 格式化时间戳为 MM-DD HH:MM
 */
function formatDateTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const pad = (x) => String(x).padStart(2, '0');
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * 把一条 round 转换为"给方 → 收方 +N"的展示列表
 * 找出 scoreChanges 中 delta < 0 的玩家（出分方）和 delta > 0 的玩家（收分方）
 * 自摸场景（多对 1）：3 个 -2 vs 1 个 +6 → 拆成 3 条 "A→D 2, B→D 2, C→D 2"
 * @param {Object} round
 * @param {Function} getPlayerName - (playerId) => string
 * @returns {Array<{from: string, to: string, value: number}>}
 */
function roundToTransfers(round, getPlayerName) {
  if (!round || !round.scoreChanges) return [];
  const entries = Object.entries(round.scoreChanges);
  // 出分方：delta < 0，金额取绝对值
  const negatives = entries
    .filter(([_, d]) => Number(d) < 0)
    .map(([id, d]) => ({ id, delta: -Number(d) }))
    .sort((a, b) => b.delta - a.delta);  // 大的先配对
  // 收分方：delta > 0
  const positives = entries
    .filter(([_, d]) => Number(d) > 0)
    .map(([id, d]) => ({ id, delta: Number(d), remaining: Number(d) }))
    .sort((a, b) => b.delta - a.delta);

  const transfers = [];
  for (const neg of negatives) {
    let remaining = neg.delta;
    for (const pos of positives) {
      if (remaining <= 0) break;
      if (pos.remaining <= 0) continue;
      const give = Math.min(remaining, pos.remaining);
      transfers.push({
        from: getPlayerName(neg.id),
        to: getPlayerName(pos.id),
        value: give,
      });
      remaining -= give;
      pos.remaining -= give;
    }
  }
  return transfers;
}

module.exports = {
  DEFAULT_WINDOW_MS,
  groupRoundsBySession,
  isOngoing,
  formatTime,
  formatDateTime,
  roundToTransfers,
};
