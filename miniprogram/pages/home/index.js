const app = getApp();
const appStore = require('../../stores/appStore');
const roomService = require('../../services/roomService');
const { handleError } = require('../../services/errorHandler');
const roomStore = require('../../stores/roomStore');
const { AVATAR_NAMES } = require('../../utils/constants');

const MY_ROOMS_CACHE_KEY = 'myRooms';
const MY_ROOMS_CACHE_TTL = 5 * 60 * 1000; // 5 min

function _loadMyRoomsCache() {
  try {
    const raw = wx.getStorageSync(MY_ROOMS_CACHE_KEY);
    if (!raw) return null;
    if (Date.now() - raw.ts > MY_ROOMS_CACHE_TTL) return null;
    return raw.data;
  } catch (e) { return null; }
}

function _saveMyRoomsCache(data) {
  try {
    wx.setStorageSync(MY_ROOMS_CACHE_KEY, { ts: Date.now(), data });
  } catch (e) {}
}

function _formatClosedAt(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const HHMM = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const isSameDay = d.toDateString() === now.toDateString();
  if (isSameDay) return `今天 ${HHMM}`;
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  if (d.toDateString() === yesterday.toDateString()) return `昨天 ${HHMM}`;
  return `${d.getMonth() + 1}/${d.getDate()} ${HHMM}`;
}

function _decorateMyRooms(data) {
  return {
    active: (data.active || []).map(r => ({ ...r, onlineCount: null })),
    finished: (data.finished || []).map(r => ({ ...r, closedAtText: _formatClosedAt(r.closedAt) })),
  };
}

function _ensureNickname() {
  return appStore.nickname || '';
}

Page({
  data: { loaded: true, myRooms: { active: [], finished: [] }, nickname: '', baseScorePopupVisible: false, pendingNickname: '' },

  onLoad(options) {
    appStore.init();
    this.setData({
      nickname: appStore.nickname,
      avatarIndex: appStore.avatarIndex,
    });
    // 消费扫码带过来的 roomCode：
    // - 分享卡片带 joinCode 时：options.joinCode（onLoad 拿得到）
    // - 小程序码带 scene 时：app.onLaunch 已存到 globalData.pendingJoinCode（onLoad 拿不到 scene）
    this._consumePendingJoinCode(options);
  },

  onShow() {
    this._roomsLoaded = false;
    this.setData({ myRooms: { active: [], finished: [] } });
    // 小程序从后台被扫码唤醒时，app.onShow 也会更新 pendingJoinCode，这里补消费
    this._consumePendingJoinCode();
    this._renderMyRooms();
    clearInterval(this._roomsTimer);
    this._roomsTimer = setInterval(() => this._renderMyRooms(), 30000);
  },

  onHide() { clearInterval(this._roomsTimer); },
  onUnload() { clearInterval(this._roomsTimer); },

  _consumePendingJoinCode(options) {
    // 1. 分享卡片路径（onLoad 拿得到 joinCode）
    const fromOptions = options && (options.joinCode || options.scene);
    // 2. 扫码带 scene（onLoad 拿不到，由 app.js 暂存到 globalData）
    const fromGlobal = getApp().globalData.pendingJoinCode;
    const raw = fromOptions || fromGlobal || '';
    // 必须是 6 位数字才算合法房间号（防止 sourceAppId 之类的值误触）
    const joinCode = /^\d{6}$/.test(String(raw)) ? String(raw) : '';
    if (!joinCode) return;
    // 消费后立刻清空，避免 onShow 重复触发
    getApp().globalData.pendingJoinCode = '';
    this._scanJoin(joinCode);
  },

  onShareAppMessage() {
    return {
      title: '胡了么 · 打麻将记分神器',
      path: '/pages/home/index',
    };
  },

  onEditNickname() {
    wx.showModal({
      title: '修改昵称',
      editable: true,
      placeholderText: '1-8 个字符',
      content: appStore.nickname || '',
      success: (modal) => {
        if (modal.confirm && modal.content) {
          const name = modal.content.trim();
          if (!name || name.length > 8) return;
          appStore.setNickname(name);
          this.setData({ nickname: name });
          wx.showToast({ title: '已保存', icon: 'success', duration: 1200 });
        }
      },
    });
  },

  _renderMyRooms() {
    // 1. 先用缓存立即渲染
    const cached = _loadMyRoomsCache();
    if (cached && !this._roomsLoaded) {
      this.setData({ myRooms: _decorateMyRooms(cached) });
    }
    // 2. 异步刷新
    roomService.getMyRooms({ clientId: appStore.clientId })
      .then((res) => {
        if (res.code === 'OK') {
          this._roomsLoaded = true;
          _saveMyRoomsCache(res.data);
          this.setData({ myRooms: { ..._decorateMyRooms(res.data), active: res.data.active || [] } });
        } else {
          handleError(res, this);
        }
      })
      .catch((err) => handleError(err, this));
  },

  onCreateRoom() {
    const nickname = _ensureNickname();
    this.setData({ nickname, pendingNickname: nickname, baseScorePopupVisible: true });
  },

  _doCreateRoom(nickname, baseScore) {
    if (this._creating) return;
    this._creating = true;
    console.log('【home _doCreateRoom】nickname:', nickname, '!nickname:', !nickname, 'appStore.nickname:', appStore.nickname, 'pendingNickname:', this.data.pendingNickname);
    wx.showLoading({ title: '创建中...' });
    roomService.createRoom({
      nickname,
      avatarIndex: appStore.avatarIndex || 0,
      clientId: appStore.clientId,
      baseScore,
      // 有自定义昵称 → 手动模式（需同步）；没有 → 自动模式（随机分配）
      nicknameAuto: !nickname,
    }).then((res) => {
      wx.hideLoading();
      if (res.code === 'OK') {
        roomStore.setRoom({
          roomId: res.data.roomId,
          roomCode: res.data.roomCode,
          rule: null,
          players: [],
          isOwner: true,
          currentPlayerId: res.data.playerId,
        });
        wx.reLaunch({ url: '/pages/room/index/index' });
      } else {
        handleError({ code: res.code, message: res.message }, this);
      }
    }).catch((err) => {
      wx.hideLoading();
      handleError(err, this);
    }).finally(() => { this._creating = false; });
  },

  onBaseScoreConfirm(e) {
    console.log('【onBaseScoreConfirm】pendingNickname:', this.data.pendingNickname);
    const baseScore = e.detail.value;
    this.setData({ baseScorePopupVisible: false });
    this._doCreateRoom(this.data.pendingNickname, baseScore);
  },

  onBaseScoreCancel() {
    this.setData({ baseScorePopupVisible: false });
  },

  onJoinRoom() {
    this.setData({ nickname: appStore.nickname || '' });
    wx.showModal({
      title: '加入牌局',
      editable: true,
      placeholderText: '请输入 6 位房间号',
      success: (modal) => {
        if (modal.confirm && modal.content) {
          this._doJoin(modal.content.trim(), appStore.nickname || '');
        }
      },
    });
  },

  // 点击"进行中"分区某条：重入房间（joinRoom 会找到旧 player）
  onTapActive(e) {
    this._doJoin(e.currentTarget.dataset.roomcode, appStore.nickname || '');
  },

  // 点击"已结束"分区某条：跳到 summary（只读）
  onTapFinished(e) {
    const { roomid } = e.currentTarget.dataset;
    wx.navigateTo({ url: `/pages/room/summary/index?roomId=${roomid}&readonly=1` });
  },

  _doJoin(roomCode, nickname) {
    if (this._joining) return;
    this._joining = true;
    wx.showLoading({ title: '加入中...' });
    roomService.joinRoom({
      roomCode,
      nickname: appStore.nickname || '',
      avatarIndex: appStore.avatarIndex || 0,
      clientId: appStore.clientId,
      // 有自定义昵称 → 手动模式（需同步）；没有 → 自动模式
      nicknameAuto: !appStore.nickname,
    }).then((res) => {
      wx.hideLoading();
      if (res.code === 'OK') {
        wx.reLaunch({ url: `/pages/room/index/index?roomId=${res.data.roomId}` });
      } else {
        handleError({ code: res.code, message: res.message }, this);
      }
    }).catch((err) => {
      wx.hideLoading();
      handleError(err, this);
    }).finally(() => { this._joining = false; });
  },

  // 扫码加入：失败时弹明确的 modal（区别于手输房间号的通用 toast）
  _scanJoin(roomCode) {
    if (this._joining) return;
    this._joining = true;
    wx.showLoading({ title: '加入中...' });
    roomService.joinRoom({
      roomCode,
      nickname: appStore.nickname || '',
      avatarIndex: appStore.avatarIndex || 0,
      clientId: appStore.clientId,
      nicknameAuto: !appStore.nickname,
    }).then((res) => {
      wx.hideLoading();
      if (res.code === 'OK') {
        wx.reLaunch({ url: `/pages/room/index/index?roomId=${res.data.roomId}` });
      } else {
        this._showScanJoinError(res.code);
      }
    }).catch((err) => {
      wx.hideLoading();
      this._showScanJoinError(err.code);
    }).finally(() => { this._joining = false; });
  },

  _showScanJoinError(code) {
    const messages = {
      ROOM_FINISHED: '本局已结束，请找朋友重新邀请',
      ROOM_FULL: '房间已满 4 人',
      ROOM_NOT_FOUND: '房间号无效，请找朋友重新邀请',
    };
    wx.showModal({
      title: '无法加入',
      content: messages[code] || '加入失败，请稍后重试',
      showCancel: false,
      confirmText: '我知道了',
    });
  },

  
  onShowHelp() {
    wx.navigateTo({ url: '/pages/help/index' });
  },
});
