const { observable } = require('./observable');

const store = observable({
  roomId: '',
  roomCode: '',
  rule: null,
  players: [],
  rounds: [],
  isOwner: false,
  currentPlayerId: '',
  scoreTotals: null,
  totalsThrough: 0,
  syncCursor: undefined,
  revision: undefined,
  historyComplete: false,
  createdInvite: null,
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
    this.scoreTotals = null;
    this.totalsThrough = 0;
    this.syncCursor = undefined;
    this.revision = undefined;
    this.historyComplete = false;
    this.createdInvite = null;
    this.isOwner = false;
    this.currentPlayerId = '';
    this.roomStatus = 'active';
  },

  setRoom({ roomId, roomCode, rule, players, isOwner, currentPlayerId, status }) {
    if (this.roomId !== roomId) { this.rounds = []; this.scoreTotals = null; this.totalsThrough = 0;
      this.syncCursor = undefined; this.revision = undefined; this.historyComplete = false; this.createdInvite = null; }
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
    this.rounds = this.rounds.filter(r => r._id !== tempId && r._id !== realRound._id);
    this.rounds.push({ ...realRound, clientId: tempId });
    this.rounds.sort((a, b) => a.roundIndex - b.roundIndex);
  },

  setServerTotals(totals, through) {
    if (totals && Number.isSafeInteger(through) && through >= this.totalsThrough) {
      this.scoreTotals = { ...totals };
      this.totalsThrough = through;
    }
  },

  acceptRound(tempId, response) {
    this.replaceRound(tempId, response.data);
    if (response.meta) this.setServerTotals(response.meta.scoreTotals, response.meta.throughRoundIndex);
  },

  mergeRounds(rounds) {
    const map = new Map(this.rounds.map(r => [r._id, r]));
    for (const r of rounds) {
      if (r.clientId) map.delete(r.clientId);
      map.set(r._id, r);
    }
    this.setRounds([...map.values()].sort((a, b) => a.roundIndex - b.roundIndex));
  },

  getTotalScores() {
    const totals = { ...(this.scoreTotals || {}) };
    this.players.forEach(p => { if (!(p._id in totals)) totals[p._id] = 0; });
    this.rounds.forEach(r => {
      if (this.scoreTotals && (r.isOptimistic || r.roundIndex <= this.totalsThrough)) return;
      Object.entries(r.scoreChanges || {}).forEach(([pid, delta]) => {
        totals[pid] = (totals[pid] || 0) + Number(delta || 0);
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
