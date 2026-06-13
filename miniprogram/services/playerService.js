const { callFunction } = require('./cloud');

// Lazy get db to avoid blocking at require time
function getDb() {
  const db = wx.cloud.database();
  return { db, _: db.command };
}

function getPlayers(roomId) {
  const { db } = getDb();
  return db.collection('players').where({ roomId }).get().then(r => r.data);
}

function watchPlayers(roomId, onChange) {
  const { db } = getDb();
  const watcher = db.collection('players').where({ roomId }).watch({
    onChange: (snapshot) => onChange(snapshot.docs),
    onError: (err) => console.error('watch players error:', err),
  });
  return () => watcher.close();
}

function updatePlayer({ roomId, playerId, nickname, avatarIndex }) {
  console.log('【playerService.updatePlayer】', { roomId, playerId, nickname, avatarIndex });
  return callFunction('updatePlayer', { roomId, playerId, nickname, avatarIndex });
}

module.exports = { getPlayers, watchPlayers, updatePlayer };
