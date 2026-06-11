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
    syncStatus: 'connecting',
    syncText: '同步中...',
    popupVisible: false,
    popupTarget: null,
    selfPopupVisible: false,
    selfPopupTarget: null,
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
        const myId = players.find(p =>
          (p.openid && p.openid === appStore.openid) ||
          (p.clientId && p.clientId === appStore.clientId)
        )?._id || players[0]?._id; // fallback: 暂时用第一个玩家
        roomStore.setRoom({
          roomId,
          roomCode: room.roomCode,
          rule,
          players,
          isOwner: room.ownerId === appStore.openid,
          currentPlayerId: myId,
          status: room.status,
        });
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

  onShareRoom() {
    wx.showModal({
      title: '分享房间',
      content: `房间号：${this.data.roomCode}\n请朋友打开「胡了么」小程序，在首页输入房间号加入。`,
      showCancel: false,
    });
  },

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

  // 修改昵称（云端同步）
  _showEditNicknameModal() {
    const me = roomStore.players.find(p => p._id === roomStore.currentPlayerId);
    if (!me) {
      wx.showToast({ title: '无法识别你的玩家身份', icon: 'none' });
      return;
    }
    wx.showModal({
      title: '修改昵称',
      editable: true,
      placeholderText: '1-8 个字符',
      success: (modal) => {
        if (modal.confirm && modal.content) {
          const name = modal.content.trim();
          if (!name) return;
          appStore.setProfile(name, appStore.avatarIndex || 0);
          // 云端同步
          playerService.updatePlayer({
            roomId: roomStore.roomId,
            playerId: me._id,
            nickname: name,
          }).then((res) => {
            if (res.code === 'OK') {
              wx.showToast({ title: '已保存', icon: 'success', duration: 1000 });
              // 立即更新本地 store 中的该玩家
              roomStore.players = roomStore.players.map(p =>
                p._id === me._id ? { ...p, nickname: name } : p
              );
              this._render();
            } else {
              handleError({ code: res.code, message: res.message }, this);
            }
          }).catch(err => handleError(err, this));
        }
      },
    });
  },

  onAutoScore() {
    wx.navigateTo({ url: '/pages/room/auto-score/index' });
  },

  onShowHistory() {
    wx.navigateTo({ url: '/pages/room/history/index' });
  },

  onTapBaseScore() {
    wx.showActionSheet({
      itemList: ['底分 1', '底分 2', '底分 3', '底分 4', '底分 5'],
      title: '修改底分',
      success: (res) => {
        const baseScore = res.tapIndex + 1;
        const newRule = { ...roomStore.rule, baseScore };
        roomService.updateRule({ roomId: roomStore.roomId, rule: newRule })
          .then((r) => {
            if (r.code === 'OK') {
              roomStore.setRule(newRule);
              this.setData({ baseScore });
              wx.showToast({ title: '已更新', icon: 'success', duration: 1000 });
            } else {
              handleError({ code: r.code, message: r.message }, this);
            }
          })
          .catch(err => handleError(err, this));
      },
    });
  },

  onFinishRoom() {
    wx.showModal({
      title: '结束本局',
      content: '结束后所有人都无法再记录分数，且无法重新开启。确定要结束吗？',
      confirmText: '结束本局',
      confirmColor: '#d33',
      success: (res) => {
        if (res.confirm) {
          roomService.finishRoom({
            roomId: roomStore.roomId,
            clientId: appStore.clientId,
          }).then((r) => {
            if (r.code === 'OK') {
              wx.redirectTo({ url: '/pages/room/summary/index' });
            } else {
              handleError({ code: r.code, message: r.message }, this);
            }
          }).catch(err => handleError(err, this));
        }
      },
    });
  },

  // ====== self 弹窗回调 ======

  onSelfPopupClose() {
    this.setData({ selfPopupVisible: false });
  },

  onSelfPopupEditNickname() {
    this.setData({ selfPopupVisible: false });
    this._showEditNicknameModal();
  },

  onSelfPopupLeaveRoom() {
    this.setData({ selfPopupVisible: false });
    this.onLeaveRoom();
  },

  onSelfPopupFinishRoom() {
    this.setData({ selfPopupVisible: false });
    this.onFinishRoom();
  },
});
