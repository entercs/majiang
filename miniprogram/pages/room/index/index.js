const roomStore = require('../../../stores/roomStore');
const appStore = require('../../../stores/appStore');
const roomService = require('../../../services/roomService');
const playerService = require('../../../services/playerService');
const roundService = require('../../../services/roundService');
const { handleError } = require('../../../services/errorHandler');
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
    popupVisible: false,
    popupTarget: null,
    selfPopupVisible: false,
    selfPopupTarget: null,
    sharePopupVisible: false,
    shareQrCodeFileID: '',
    shareQrCodeLoading: false,
  },

  onLoad(query) {
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
    roomStore.roomId = roomId;

    Promise.all([
      roomService.getRoom(roomId),
      playerService.getPlayers(roomId),
    ]).then(([room, players]) => {
      if (!room) throw { code: 'ROOM_NOT_FOUND', message: '房间不存在' };
      const db = wx.cloud.database();
      return db.collection('rules').doc(room.ruleId).get().then((ruleRes) => {
        const rule = ruleRes.data;
        const myPlayer = players.find(p =>
          (p.openid && p.openid === appStore.openid) ||
          (p.clientId && p.clientId === appStore.clientId)
        ) || players[0]; // fallback: 暂时用第一个玩家
        roomStore.setRoom({
          roomId,
          roomCode: room.roomCode,
          rule,
          players,
          isOwner: !!myPlayer?.isOwner,
          currentPlayerId: myPlayer?._id,
          status: room.status,
        });
        // 捕获 QR code fileID（createRoom 时已写入；老房间可能为空）
        this.setData({ shareQrCodeFileID: room.qrCodeFileID || '' });
        this._startSync();
        this._render();
      });
    }).catch(err => handleError(err, this));
  },

  _startSync() {
    const syncWatcher = require('../../../stores/syncWatcher');
    syncWatcher.start(roomStore.roomId, {
      onSyncStatus: (status) => {
        const text = status === 'connected' ? '' : status === 'connecting' ? '同步中...' : '正在重连...';
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
    });
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
    });
  },

  onCopyCode() {
    wx.setClipboardData({ data: this.data.roomCode });
  },

  // === 分享二维码弹窗 ===
  onOpenSharePopup() {
    this.setData({ sharePopupVisible: true });
    if (this.data.shareQrCodeFileID) return;  // 秒开路径：fileID 已知
    this._loadQRCode();  // fallback：老房间懒生成
  },

  _loadQRCode() {
    const roomCode = roomStore.roomCode;
    if (!roomCode) return;
    this.setData({ shareQrCodeLoading: true });
    roomService.getRoomQRCode({ roomCode })
      .then((res) => {
        if (res.code === 'OK' && res.data && res.data.fileID) {
          this.setData({
            shareQrCodeFileID: res.data.fileID,
            shareQrCodeLoading: false,
          });
        } else {
          this.setData({ shareQrCodeLoading: false });
        }
      })
      .catch((err) => {
        console.error('getRoomQRCode error:', err);
        this.setData({ shareQrCodeLoading: false });
        handleError(err, this);
      });
  },

  onRetryQRCode() {
    this.setData({ shareQrCodeLoading: true });
    this._loadQRCode();
  },

  onCloseSharePopup() {
    this.setData({ sharePopupVisible: false });
  },

  onQrCodeImageError() {
    console.warn('QR code image failed to load, fallback to retry');
    this.setData({ shareQrCodeFileID: '', shareQrCodeLoading: false });
    this._loadQRCode();
  },

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
    if (!target) return;

    const me = roomStore.players.find(p => p._id === roomStore.currentPlayerId);
    if (!me) {
      this.setData({ popupVisible: false });
      return;
    }

    const num = Number(value);
    if (!Number.isInteger(num) || num <= 0) {
      // 静默关闭弹窗，不弹提示
      this.setData({ popupVisible: false });
      return;
    }

    // 正数：我 -X，目标 +X
    const scoreChanges = {
      [me._id]: -num,
      [target._id]: num,
    };
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
      type: 'manual',
      scoreChanges,
    }).then((res) => {
      if (res.code === 'OK') {
        // 原子替换 tempRound → realRound（避免中间状态）
        roomStore.replaceRound(clientId, res.data);
        this._render();
      } else {
        // 失败：回滚（删除 tempRound）
        roomStore.rounds = roomStore.rounds.filter(r => r._id !== clientId);
        this._render();
        handleError({ code: res.code, message: res.message }, this);
      }
    }).catch((err) => {
      roomStore.rounds = roomStore.rounds.filter(r => r._id !== clientId);
      this._render();
      handleError(err, this);
    });
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
    this.setData({ baseScorePopupVisible: true });
  },

  onBaseScoreConfirm(e) {
    const baseScore = e.detail.value;
    const newRule = { ...roomStore.rule, baseScore };
    this.setData({ baseScorePopupVisible: false, baseScore });
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
          });
        }
      },
    });
  },

  onSelfAvatarChange(e) {
    const { avatarIndex } = e.detail;
    const me = roomStore.players.find(p => p._id === roomStore.currentPlayerId);
    if (!me) return;
    // 头像变化时更新本地玩家对象（昵称由用户确认时再定）
    roomStore.players = roomStore.players.map(p =>
      p._id === me._id ? { ...p, avatarIndex } : p
    );
    // 同步更新弹窗目标数据（不关闭弹窗）
    this.setData({
      selfPopupTarget: { ...this.data.selfPopupTarget, avatarIndex },
    });
    this._render();
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
    });
  },

});
