const roomStore = require('../../../stores/roomStore');
const appStore = require('../../../stores/appStore');
const roomService = require('../../../services/roomService');
const playerService = require('../../../services/playerService');
const roundService = require('../../../services/roundService');
const { handleError } = require('../../../services/errorHandler');
const qrCodeService = require('../../../services/qrCodeService');
const { generateTempId } = require('../../../utils/cloud-id');

Page({
  data: {
    roomCode: '',
    playersRow: [],
    rankList: [],
    isOwner: false,
    currentPlayerId: '',
    baseScore: 1,
    baseScorePopupVisible: false,
    syncStatus: 'connecting',
    syncText: '同步中...',
    scorePending: false,
    popupVisible: false,
    popupTarget: null,
    selfPopupVisible: false,
    selfPopupTarget: null,
    sharePopupVisible: false,
    shareQrCodeFileID: '',
    shareQrCodeSrc: '',
    shareQrCodeReady: false,
    shareQrCodeLoading: false,
  },

  onLoad(query = {}) {
    this._openInviteOnLoad = query.invite === '1';
    if (query.roomId && query.roomId !== roomStore.roomId) roomStore.reset();
    const invite = roomStore.createdInvite;
    if (this._openInviteOnLoad && invite && invite.roomId === (query.roomId || roomStore.roomId)) {
      this._openInviteOnLoad = false;
      roomStore.createdInvite = null;
      this.setData({ shareQrCodeFileID: invite.fileID, shareQrCodeSrc: invite.src || '',
        shareQrCodeReady: false, shareQrCodeLoading: true });
      this.onOpenSharePopup();
    }
    this._init(query.roomId);
  },

  onShow() {
    // 隐藏 WeChat 首页按钮（圈圈）—— 防止点 home 跳出后再被自动跳回造成死循环
    if (wx.hideHomeButton) wx.hideHomeButton();
    this._render();
    // 每秒重渲染（让 30 秒时间窗口自动清零）
    if (this._renderTimer) clearInterval(this._renderTimer);
    this._renderTimer = setInterval(() => this._render(), 1000);
  },

  onHide() {
    if (this._renderTimer) { clearInterval(this._renderTimer); this._renderTimer = null; }
  },

  onUnload() {
    this._unloaded = true;
    this.onCloseSharePopup();
    if (this._renderTimer) { clearInterval(this._renderTimer); this._renderTimer = null; }
    const syncWatcher = require('../../../stores/syncWatcher');
    syncWatcher.stop();
  },

  onShareAppMessage() {
    const roomCode = roomStore.roomCode || '';
    return {
      title: roomCode ? `${roomCode} · 来一起打麻将` : '胡了么 · 打麻将记分神器',
      path: roomCode ? `/pages/home/index?joinCode=${roomCode}` : '/pages/home/index',
    };
  },

  _init(roomId) {
    if (!roomId) roomId = roomStore.roomId;
    if (!roomId) {
      wx.navigateBack({ delta: 1, fail: () => wx.reLaunch({ url: '/pages/home/index' }) });
      return;
    }
    this._unloaded = false;
    roomService.getRoomState(roomId, { heartbeat: true, subscribe: true }).then((snapshot) => {
      if (this._unloaded) return;
      const { room, players, rule, rounds, currentPlayerId } = snapshot;
      const myPlayer = players.find(p => p._id === currentPlayerId);
      if (!myPlayer) throw { code: 'NOT_IN_ROOM', message: '请重新加入房间' };
      roomStore.setRoom({ roomId, roomCode: room.roomCode, rule, players,
        isOwner: !!myPlayer.isOwner, currentPlayerId, status: room.status });
      roomStore.setRounds(rounds);
      roomStore.setServerTotals(snapshot.scoreTotals, snapshot.totalsThrough);
      roomStore.syncCursor = snapshot.throughRoundIndex;
      roomStore.revision = snapshot.revision;
      roomStore.historyComplete = snapshot.protocol !== 2 || !!snapshot.historyComplete;
      if (!this.data.shareQrCodeFileID) this.setData({ shareQrCodeFileID: room.qrCodeFileID || '' });
      this._initialSnapshot = snapshot;
      this._startSync();
      this._render();
      const openInvite = this._openInviteOnLoad;
      this._openInviteOnLoad = false;
      if (openInvite && room.status === 'active') this.onOpenSharePopup();
    }).catch(err => { if (!this._unloaded) handleError(err, this); });
  },

  _startSync() {
    const syncWatcher = require('../../../stores/syncWatcher');
    syncWatcher.start(roomStore.roomId, {
      onSyncStatus: (status) => {
        const text = status === 'connected' ? '' : status === 'connecting' ? '同步中...'
          : status === 'unavailable' ? '无法同步，请退出后重新加入' : '正在重连...';
        this.setData({ syncStatus: status, syncText: text });
      },
      onPlayersChange: (players) => { roomStore.setPlayers(players); this._render(); },
      onRoundsChange: (rounds) => { roomStore.setRounds(rounds); this._render(); },
      onRuleChange: () => { this._render(); },
      onRoomClosed: () => {
        wx.showModal({
          title: '房间已结束',
          content: '本局已结束，点击确定查看总结算。',
          showCancel: false,
          success: () => wx.redirectTo({ url: '/pages/room/summary/index' }),
        });
      },
    }, this._initialSnapshot);
    this._initialSnapshot = null;
  },

  _render() {
    const totals = roomStore.getTotalScores();
    const sorted = roomStore.players.slice().sort((a, b) => a.seatIndex - b.seatIndex);
    const playersRow = sorted.map(p => ({
      ...p,
      totalScore: totals[p._id] || 0,
    }));
    // 变化量窗口：30 秒
    // 规则：以"最后一笔 round 的 createdAt"为锚点，向前 30s 内的 round 都计入；
    //       锚点 + 30s 后整组一起过期清零。新一笔 round 会重置锚点 → 自动重新计时。
    const WINDOW_MS = 30 * 1000;
    const now = Date.now();
    const windowDelta = {};
    if (roomStore.rounds.length > 0) {
      const lastTime = Math.max(...roomStore.rounds.map(r => r.createdAt || 0));
      const windowStart = lastTime - WINDOW_MS;
      const windowEnd = lastTime + WINDOW_MS;
      // 只有 now <= windowEnd 时才显示（now > windowEnd → 整组过期）
      if (now <= windowEnd) {
        for (const r of roomStore.rounds) {
          if ((r.createdAt || 0) >= windowStart) {
            Object.entries(r.scoreChanges || {}).forEach(([pid, delta]) => {
              windowDelta[pid] = (windowDelta[pid] || 0) + Number(delta || 0);
            });
          }
        }
      }
    }
    const rankList = playersRow
      .map(p => ({ ...p, lastDelta: windowDelta[p._id] || 0 }))
      .sort((a, b) => b.totalScore - a.totalScore);
    this.setData({
      roomCode: roomStore.roomCode,
      playersRow,
      rankList,
      isOwner: roomStore.isOwner,
      currentPlayerId: roomStore.currentPlayerId,
      baseScore: roomStore.rule?.baseScore ?? 1,
      scorePending: roundService.hasPending ? roundService.hasPending(roomStore.roomId) : false,
    });
  },

  onCopyCode() {
    wx.setClipboardData({ data: this.data.roomCode });
  },

  // === 邀请二维码弹窗 ===
  onOpenSharePopup() {
    this._inviteEpoch = (this._inviteEpoch || 0) + 1;
    this._qrRetries = 0;
    this.setData({ sharePopupVisible: true, shareQrCodeLoading: true });
    this._loadQRCode();
  },

  _loadQRCode() {
    const epoch = this._inviteEpoch;
    if (this._qrRequest && this._qrRequest.epoch === epoch) return this._qrRequest.promise;
    const roomCode = roomStore.roomCode;
    if (!roomCode) return Promise.resolve();
    const valid = () => !this._unloaded && this.data.sharePopupVisible && epoch === this._inviteEpoch;
    this.setData({ shareQrCodeLoading: true, shareQrCodeReady: false });
    const promise = (async () => {
      let fileID = this.data.shareQrCodeFileID;
      if (!fileID) fileID = (await roomService.getRoomQRCode({ roomCode })).data.fileID;
      const src = await qrCodeService.preload(fileID);
      if (!valid()) return;
      this.setData({ shareQrCodeFileID: fileID, shareQrCodeSrc: src, shareQrCodeLoading: true });
    })().catch(() => { if (valid()) this._retryQRImage(); })
      .finally(() => { if (this._qrRequest && this._qrRequest.epoch === epoch) this._qrRequest = null; });
    this._qrRequest = { epoch, promise };
    return promise;
  },

  _retryQRImage() {
    if (!this.data.sharePopupVisible || this._unloaded) return;
    qrCodeService.invalidate(this.data.shareQrCodeFileID);
    this.setData({ shareQrCodeSrc: '', shareQrCodeReady: false });
    if ((this._qrRetries || 0) >= 1) {
      this.setData({ shareQrCodeLoading: false });
      return;
    }
    this._qrRetries = (this._qrRetries || 0) + 1;
    this.setData({ shareQrCodeLoading: true });
    clearTimeout(this._qrRetryTimer);
    this._qrRetryTimer = setTimeout(() => this._loadQRCode(), 1000);
  },

  onQrCodeLoaded() {
    if (this.data.sharePopupVisible) this.setData({ shareQrCodeReady: true, shareQrCodeLoading: false });
  },

  onRetryQRCode() {
    clearTimeout(this._qrRetryTimer);
    this._qrRetries = 0;
    return this._loadQRCode();
  },

  onCloseSharePopup() {
    this._inviteEpoch = (this._inviteEpoch || 0) + 1;
    clearTimeout(this._qrRetryTimer);
    this.setData({ sharePopupVisible: false, shareQrCodeLoading: false });
  },

  onQrCodeImageError() { this._retryQRImage(); },

  noop() {},

  // 点玩家头像/昵称（玩家行 + 排行榜都走这里）：自己→self 弹窗；别人→加分弹窗
  onTapPlayer(e) {
    const id = e.currentTarget.dataset.id;
    const isSelf = e.currentTarget.dataset.self;
    const player = roomStore.players.find(p => p._id === id);
    if (!player) return;

    if (isSelf) {
      const totals = roomStore.getTotalScores();
      this.setData({
        selfPopupVisible: true,
        selfPopupTarget: { ...player, totalScore: totals[id] || 0 },
      });
    } else {
      this.setData({
        popupVisible: true,
        popupTarget: player,
      });
    }
  },

  // 弹窗确认（点别人头像加 X 分）
  onPopupConfirm(e) {
    const { value } = e.detail; // 正数：我给他加 value 分
    const target = this.data.popupTarget;
    if (!target || this._submitting) return;

    const me = roomStore.players.find(p => p._id === roomStore.currentPlayerId);
    if (!me) {
      this.setData({ popupVisible: false });
      return;
    }

    if (target._id === me._id) return;
    const num = Number(value);
    if (!Number.isSafeInteger(num) || num <= 0) {
      // 静默关闭弹窗，不弹提示
      this.setData({ popupVisible: false });
      return;
    }

    // 正数：我 -X，目标 +X
    const scoreChanges = {
      [me._id]: -num,
      [target._id]: num,
    };
    this._submitting = true;
    const submittedRoomId = roomStore.roomId;
    const clientId = 'manual_' + generateTempId();
    const tempRound = {
      _id: clientId,
      isOptimistic: true,  // 标记乐观更新（merge 用此字段识别，不再用 _id 前缀）
      roomId: roomStore.roomId,
      type: 'manual',
      roundIndex: (roomStore.rounds[roomStore.rounds.length - 1]?.roundIndex || 0) + 1,
      scoreChanges,
      createdBy: me._id,
      createdAt: Date.now(),
    };
    roomStore.addRound(tempRound);
    this.setData({ popupVisible: false });
    this._render();

    roundService.submitRound({
      roomId: roomStore.roomId,
      clientId,
      playerId: me._id,
      type: 'manual',
      scoreChanges,
    }).then((res) => {
      if (roomStore.roomId !== submittedRoomId || this._unloaded) return;
      if (res.code === 'OK') {
        // 原子替换 tempRound → realRound（避免中间状态）
        roomStore.acceptRound(clientId, res);
        this._render();
        wx.showToast({ title: '给分成功', icon: 'success', duration: 1200 });
      } else {
        // 失败：回滚（删除 tempRound）
        roomStore.rounds = roomStore.rounds.filter(r => r._id !== clientId);
        this._render();
        handleError({ code: res.code, message: res.message }, this);
      }
    }).catch((err) => {
      if (roomStore.roomId !== submittedRoomId || this._unloaded) return;
      roomStore.rounds = roomStore.rounds.filter(r => r._id !== clientId);
      this._render();
      handleError(err, this);
    }).finally(() => { this._submitting = false; });
  },

  async onReconcileScore() {
    if (this._checkingScore) return;
    this._checkingScore = true;
    const roomId = roomStore.roomId;
    try {
      const results = await roundService.reconcilePending(roomId, true);
      if (this._unloaded || roomStore.roomId !== roomId) return;
      for (const result of results) roomStore.acceptRound(result.data.clientId, result);
      this._render();
      wx.showToast({ title: roundService.hasPending(roomId) ? '暂未确认，请稍后重试' : '核对完成', icon: 'none' });
    } finally { this._checkingScore = false; }
  },

  onPopupCancel() {
    this.setData({ popupVisible: false });
  },

  // ====== 退出房间（从头部"退出"按钮或系统返回键） ======

  onLeaveRoom() {
    wx.showModal({
      title: '退出房间',
      content: '确定要退出吗？你可以稍后从首页「进行中」回到房间。',
      success: (modal) => {
        if (modal.confirm) {
          this._doLeaveRoom();
        }
      },
    });
  },

  _doLeaveRoom() {
    const me = roomStore.players.find(p => p._id === roomStore.currentPlayerId);
    if (!me) {
      // 拿不到身份（页面被异常打开），直接回首页
      try { wx.removeStorageSync('myRooms'); } catch (e) {}
      wx.reLaunch({ url: '/pages/home/index' });
      return;
    }
    roomService.leaveRoom({
      roomId: roomStore.roomId,
      playerId: me._id,
      clientId: appStore.clientId,
    }).then((res) => {
      // 清掉首页的 myRooms 缓存
      try { wx.removeStorageSync('myRooms'); } catch (e) {}
      wx.reLaunch({ url: '/pages/home/index' });
    }).catch(() => {
      // 即使云函数失败也回首页（让用户能重试）
      try { wx.removeStorageSync('myRooms'); } catch (e) {}
      wx.reLaunch({ url: '/pages/home/index' });
    });
  },

  // 拦截系统左上角返回按钮：必须先"退出房间"才能离开
  onBackPress() {
    this.onLeaveRoom();
    return true; // 阻止默认返回
  },

  onAutoScore() {
    wx.navigateTo({ url: '/pages/room/auto-score/index' });
  },

  onShowHistory() {
    wx.navigateTo({ url: '/pages/room/history/index' });
  },

  onTapBaseScore() {
    if (!roomStore.isOwner) return;
    this.setData({ baseScorePopupVisible: true });
  },

  onBaseScoreConfirm(e) {
    const baseScore = e.detail.value;
    if (!roomStore.isOwner) return;
    const { _id, roomId, createdAt, updatedAt, ...ruleFields } = roomStore.rule || {};
    const newRule = { ...ruleFields, baseScore };
    this.setData({ baseScorePopupVisible: false });
    roomService.updateRule({ roomId: roomStore.roomId, rule: newRule })
      .then((r) => {
        if (r.code === 'OK') {
          roomStore.setRule(newRule);
          wx.showToast({ title: '已更新', icon: 'success', duration: 1000 });
        } else {
          handleError({ code: r.code, message: r.message }, this);
        }
      })
      .catch(err => handleError(err, this));
  },

  onBaseScoreCancel() {
    this.setData({ baseScorePopupVisible: false });
  },

  // ====== self 弹窗回调 ======

  onSelfPopupClose() {
    this.setData({ selfPopupVisible: false });
  },

  onSelfEditNick() {
    this.setData({ selfPopupVisible: false });
    const me = roomStore.players.find(p => p._id === roomStore.currentPlayerId);
    if (!me) {
      wx.showToast({ title: '无法识别你的玩家身份', icon: 'none' });
      return;
    }
    wx.showModal({
      title: '修改昵称',
      editable: true,
      placeholderText: '1-8 个字符',
      content: me.nickname || '',
      success: (modal) => {
        if (modal.confirm && modal.content) {
          const name = modal.content.trim();
          if (!name || name.length > 8) return;
          playerService.updatePlayer({
            roomId: roomStore.roomId,
            playerId: me._id,
            nickname: name,
            avatarIndex: me.avatarIndex,
          }).then(() => {
            roomStore.players = roomStore.players.map(p =>
              p._id === me._id ? { ...p, nickname: name } : p
            );
            appStore.setNickname(name);
            this._render();
            wx.showToast({ title: '已保存', icon: 'success', duration: 1200 });
          }).catch(err => handleError(err, this));
        }
      },
    });
  },

  onSelfPopupConfirm(e) {
    const { nickname, avatarIndex, selectedNicknameType } = e.detail;
    console.log('【room onSelfPopupConfirm】received', { nickname, avatarIndex, selectedNicknameType });
    const me = roomStore.players.find(p => p._id === roomStore.currentPlayerId);
    if (!me) return;
    // 调用云端更新
    playerService.updatePlayer({
      roomId: roomStore.roomId,
      playerId: me._id,
      nickname,
      avatarIndex,
    }).then(() => {
      // 更新本地玩家对象
      roomStore.players = roomStore.players.map(p =>
        p._id === me._id ? { ...p, nickname, avatarIndex } : p
      );
      // 如果选择了自定义昵称，保存到本地存储
      if (selectedNicknameType === 'custom') {
        wx.setStorageSync('customNickname', nickname);
        appStore.setNickname(nickname);
      }
      this.setData({ selfPopupVisible: false });
      this._render();
      wx.showToast({ title: '已保存', icon: 'success', duration: 1200 });
    }).catch(err => handleError(err, this));
  },

});
