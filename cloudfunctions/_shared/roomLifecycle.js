const ONLINE_TTL_MS = 180 * 1000;
const EMPTY_TIMEOUT_MS = 5 * 60 * 1000;
const INACTIVE_TIMEOUT_MS = 30 * 60 * 1000;

function isOnline(player, now = Date.now()) {
  return player.isOnline === true && Number(player.lastSeenAt || 0) > now - ONLINE_TTL_MS;
}

function ownsPlayer(player, openid, clientId) {
  // 旧版本误读 OPENID，旧记录只能凭原设备 clientId 恢复；绑定后只认云端身份。
  return !!player && !!openid && (player.openid ? player.openid === openid :
    !!clientId && player.clientId === clientId);
}

function closeReason(room, players, now = Date.now()) {
  if (room.status !== 'active' || players.some(p => isOnline(p, now))) return null;
  const lastPresence = Math.max(Number(room.createdAt || 0), Number(room.lastActivityAt || 0),
    Number(room.presenceAt || 0), ...players.map(p => Number(p.lastSeenAt || 0)));
  const emptySince = room.emptyAt != null && Number(room.emptyAt) >= lastPresence
    ? Number(room.emptyAt) : lastPresence + ONLINE_TTL_MS;
  if (emptySince + EMPTY_TIMEOUT_MS <= now) return 'auto-empty';
  if (lastPresence + INACTIVE_TIMEOUT_MS <= now) return 'auto-timeout';
  return null;
}

// 使用确定顺序分页，避免云数据库单次查询上限截断数据。
async function getAll(query, pageSize = 100) {
  const rows = [];
  for (let offset = 0; ; offset += pageSize) {
    const page = await query.skip(offset).limit(pageSize).get();
    rows.push(...page.data);
    if (page.data.length < pageSize) return rows;
  }
}

module.exports = { ONLINE_TTL_MS, EMPTY_TIMEOUT_MS, INACTIVE_TIMEOUT_MS, isOnline, ownsPlayer, closeReason, getAll };
