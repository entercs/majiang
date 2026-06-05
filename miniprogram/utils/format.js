function formatScoreDelta(n) {
  if (n > 0) return `+${n} 分`;
  if (n < 0) return `${n} 分`; // negative sign is included
  return '0 分';
}

function formatTotalScore(n) {
  return `${n} 分`;
}

function formatTimestamp(ts) {
  const d = new Date(ts);
  const pad = (x) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

module.exports = { formatScoreDelta, formatTotalScore, formatTimestamp };
