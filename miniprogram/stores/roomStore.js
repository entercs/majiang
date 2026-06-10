const { observable } = require('./observable');

const store = observable({
  roomId: '',
  roomCode: '',
  rule: null,
  players: [],
  rounds: [],
  isOwner: false,
  currentPlayerId: '',
  roomStatus: 'active',  // 'active' | 'finished'；history 用它判断"进行中"标签
  _stopWatchPlayers: null,
  _stopWatchRounds: null,
  _stopWatchRule: null,

  reset() {
    this._cleanup();
    this.roomId = '';
    this.roomCode = '';
    this.rule = null;
    this.players = [];
    this.rounds = [];
    this.isOwner = false;
    this.currentPlayerId = '';
    this.roomStatus = 'active';
  },

  setRoom({ roomId, roomCode, rule, players, isOwner, currentPlayerId, status }) {
    this.roomId = roomId;
    this.roomCode = roomCode;
    this.rule = rule;
    this.players = players;
    this.isOwner = isOwner;
    this.currentPlayerId = currentPlayerId;
    if (status) this.roomStatus = status;
  },

  setRule(rule) { this.rule = rule; },
  setPlayers(players) { this.players = players; },
  setRounds(rounds) { this.rounds = rounds; },

  addRound(round) {
    const idx = this.rounds.findIndex(r => r._id === round._id);
    if (idx >= 0) this.rounds[idx] = round;
    else this.rounds.push(round);
  },

  /**
   * 原子替换 tempRound → realRound（避免分步操作引发闪烁）
   * @param {string} tempId - tempRound._id（= clientId）
   * @param {Object} realRound - 云端返回的完整真实 round
   */
  replaceRound(tempId, realRound) {
    const idx = this.rounds.findIndex(r => r._id === tempId);
    if (idx >= 0) {
      this.rounds[idx] = { ...realRound, clientId: tempId };
    } else {
      this.rounds.push({ ...realRound, clientId: tempId });
    }
  },

  getTotalScores() {
    const totals = {};
    this.players.forEach(p => { totals[p._id] = 0; });
    this.rounds.forEach(r => {
      Object.entries(r.scoreChanges).forEach(([pid, delta]) => {
        totals[pid] = (totals[pid] || 0) + delta;
      });
    });
    return totals;
  },

  _cleanup() {
    if (this._stopWatchPlayers) { this._stopWatchPlayers(); this._stopWatchPlayers = null; }
    if (this._stopWatchRounds) { this._stopWatchRounds(); this._stopWatchRounds = null; }
    if (this._stopWatchRule) { this._stopWatchRule(); this._stopWatchRule = null; }
  },
});

module.exports = store;
