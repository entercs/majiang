const app = getApp();
const appStore = require('../../stores/appStore');
const roomService = require('../../services/roomService');
const { handleError } = require('../../services/errorHandler');
const roomStore = require('../../stores/roomStore');
const { pickRandomName } = require('../../services/randomName');

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
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function _decorateMyRooms(data) {
  return {
    active: data.active || [],
    finished: (data.finished || []).map(r => ({ ...r, closedAtText: _formatClosedAt(r.closedAt) })),
  };
}

function _ensureNickname() {
  if (!appStore.nickname) {
    const name = pickRandomName();
    appStore.setProfile(name, appStore.avatarIndex || 0);
    return name;
  }
  return appStore.nickname;
}

Page({
  data: { loaded: false, myRooms: { active: [], finished: [] }, nickname: '' },

  onShow() {
    this._renderMyRooms();
    // 只在首次进入时检查 active 房间（避免用户从其他页回来被强制跳走）
    if (!this._hasChecked) {
      this._hasChecked = true;
      this._maybeRedirectToActiveRoom();
    }
  },

  onLoad() {
    appStore.init();
    this.setData({
      loaded: true,
      nickname: appStore.nickname,
      avatarIndex: appStore.avatarIndex,
    });
  },

  _renderMyRooms() {
    // 1. 先用缓存立即渲染
    const cached = _loadMyRoomsCache();
    if (cached) {
      this.setData({ myRooms: _decorateMyRooms(cached) });
    }
    // 2. 异步刷新
    roomService.getMyRooms({ clientId: appStore.clientId })
      .then((res) => {
        if (res.code === 'OK') {
          _saveMyRoomsCache(res.data);
          this.setData({ myRooms: _decorateMyRooms(res.data) });
        } else {
          handleError(res, this);
        }
      })
      .catch((err) => handleError(err, this));
  },

  // 若有 active 房间则 reLaunch 到那个房间页
  // 注意：检查期间 loaded=false，按钮被禁用，避免用户中途点"创建房间"造成竞态
  _maybeRedirectToActiveRoom() {
    if (this._redirecting) return;
    this.setData({ loaded: false });
    roomService.getMyRooms({ clientId: appStore.clientId })
      .then((res) => {
        if (res.code !== 'OK') {
          this.setData({ loaded: true });
          return;
        }
        const active = (res.data.active || []);
        if (active.length === 0) {
          this.setData({ loaded: true });
          return;
        }
        this._redirecting = true;
        const target = active[0];
        roomService.joinRoom({
          roomCode: target.roomCode,
          nickname: appStore.nickname,
          avatarIndex: appStore.avatarIndex || 0,
          clientId: appStore.clientId,
        }).then((jr) => {
          if (jr.code === 'OK') {
            wx.reLaunch({ url: `/pages/room/index/index?roomId=${jr.data.roomId}` });
            // 跳转后不需要 setData（页面会被销毁）
          } else {
            this.setData({ loaded: true });
            this._redirecting = false;
          }
        }).catch(() => {
          this.setData({ loaded: true });
          this._redirecting = false;
        });
      })
      .catch(() => {
        this.setData({ loaded: true });
      });
  },

  onCreateRoom() {
    const nickname = _ensureNickname();
    this.setData({ nickname });
    wx.showLoading({ title: '创建中...' });
    roomService.createRoom({
      nickname,
      avatarIndex: appStore.avatarIndex || 0,
      clientId: appStore.clientId,
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
    });
  },

  onJoinRoom() {
    const nickname = _ensureNickname();
    this.setData({ nickname });
    wx.showModal({
      title: '加入牌局',
      editable: true,
      placeholderText: '请输入 6 位房间号',
      success: (modal) => {
        if (modal.confirm && modal.content) {
          this._doJoin(modal.content.trim(), nickname);
        }
      },
    });
  },

  // 点击"进行中"分区某条：重入房间（joinRoom 会找到旧 player）
  onTapActive(e) {
    const { roomid, roomcode } = e.currentTarget.dataset;
    const nickname = _ensureNickname();
    wx.showLoading({ title: '加入中...' });
    roomService.joinRoom({
      roomCode: roomcode,
      nickname,
      avatarIndex: appStore.avatarIndex || 0,
      clientId: appStore.clientId,
    }).then((res) => {
      wx.hideLoading();
      if (res.code === 'OK') {
        wx.reLaunch({ url: `/pages/room/index/index?roomId=${res.data.roomId}` });
      } else {
        handleError(res, this);
      }
    }).catch((err) => { wx.hideLoading(); handleError(err, this); });
  },

  // 点击"已结束"分区某条：跳到 summary（只读）
  onTapFinished(e) {
    const { roomid } = e.currentTarget.dataset;
    wx.navigateTo({ url: `/pages/room/summary/index?roomId=${roomid}&readonly=1` });
  },

  _doJoin(roomCode, nickname) {
    wx.showLoading({ title: '加入中...' });
    roomService.joinRoom({
      roomCode,
      nickname,
      avatarIndex: appStore.avatarIndex || 0,
      clientId: appStore.clientId,
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
    });
  },

  // 修改昵称
  onEditNickname() {
    wx.showModal({
      title: '修改昵称',
      editable: true,
      placeholderText: '1-8 个字符',
      success: (modal) => {
        if (modal.confirm && modal.content) {
          const name = modal.content.trim();
          if (!name) return;
          appStore.setProfile(name, appStore.avatarIndex || 0);
          this.setData({ nickname: name });
          wx.showToast({ title: '已保存', icon: 'success', duration: 1200 });
        }
      },
    });
  },

  onShowHelp() {
    wx.showModal({
      title: '使用帮助',
      content: '【核心用法】\n1. 点创建牌局或加入牌局（输入 6 位房间号）\n2. 房间内点别的玩家头像 → 输入扣分（自己 -X，对方 +X）\n3. 排行榜实时刷新\n4. 点自己头像修改昵称（房间内会同步给其他玩家）\n5. 点自己头像弹窗里可「退出房间」或「结束本局」\n\n【辅助算分】\n- 点「辅助算分」按麻将规则（自摸/点炮/番数/杠）自动算分\n- 结果预览后点「应用到房间」才入账\n\n【房间生命周期】\n- 所有人退出房间 → 自动结束\n- 任何人都可手动点「结束本局」\n- 已结束的房间在首页「已结束」区可查看战绩\n\n【数据与隐私】\n- 仅记录番数变化，不涉及任何金钱交易\n- 数据存于微信云开发，仅用于牌局记录\n- 本应用仅供娱乐和记录\n\n【协议】\n- 用户协议、隐私协议见首页「帮助」',
      showCancel: false,
      confirmText: '我知道了',
    });
  },
});
