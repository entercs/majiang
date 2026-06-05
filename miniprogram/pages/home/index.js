const app = getApp();
const appStore = require('../../stores/appStore');
const roomService = require('../../services/roomService');
const { handleError } = require('../../services/errorHandler');
const roomStore = require('../../stores/roomStore');
const { pickRandomName } = require('../../services/randomName');

const RECENT_KEY = 'recentRooms';
const RECENT_MAX = 5;

function _loadRecent() {
  try { return wx.getStorageSync(RECENT_KEY) || []; } catch (e) { return []; }
}

function _saveRecent(list) {
  try { wx.setStorageSync(RECENT_KEY, list.slice(0, RECENT_MAX)); } catch (e) {}
}

function _addRecent(roomId, roomCode) {
  const list = _loadRecent().filter(r => r.roomId !== roomId);
  list.unshift({ roomId, roomCode, joinedAt: Date.now() });
  _saveRecent(list);
}

function _formatTime(ts) {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1) return '刚刚';
  if (m < 60) return `${m} 分钟前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} 小时前`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d} 天前`;
  const date = new Date(ts);
  return `${date.getMonth() + 1}/${date.getDate()}`;
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
  data: { loaded: false, recentRooms: [], nickname: '' },

  onShow() {
    this._renderRecent();
  },

  onLoad() {
    appStore.init();
    this.setData({
      loaded: true,
      nickname: appStore.nickname,
      avatarIndex: appStore.avatarIndex,
    });
  },

  _renderRecent() {
    const list = _loadRecent().map(r => ({ ...r, timeText: _formatTime(r.joinedAt) }));
    this.setData({ recentRooms: list });
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
        _addRecent(res.data.roomId, res.data.roomCode);
        this._renderRecent();
        wx.navigateTo({ url: '/pages/room/index/index' });
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

  // 点击最近房间直接重入
  onTapRecent(e) {
    const { roomcode, roomid } = e.currentTarget.dataset;
    const nickname = _ensureNickname();
    wx.showLoading({ title: '加入中...' });
    roomService.joinRoom({ roomCode: roomcode, nickname, avatarIndex: appStore.avatarIndex || 0 })
      .then((res) => {
        wx.hideLoading();
        if (res.code === 'OK') {
          _addRecent(roomid, roomcode);
          this._renderRecent();
          wx.navigateTo({ url: `/pages/room/index/index?roomId=${res.data.roomId}` });
        } else if (res.code === 'ROOM_FINISHED') {
          const list = _loadRecent().filter(r => r.roomId !== roomid);
          _saveRecent(list);
          this._renderRecent();
          handleError({ code: res.code, message: '本局已结束，已从最近列表移除' }, this);
        } else if (res.code === 'ROOM_NOT_FOUND') {
          handleError({ code: res.code, message: '房间已不存在，已从最近列表移除' }, this);
          const list = _loadRecent().filter(r => r.roomId !== roomid);
          _saveRecent(list);
          this._renderRecent();
        } else {
          handleError({ code: res.code, message: res.message }, this);
        }
      })
      .catch(err => { wx.hideLoading(); handleError(err, this); });
  },

  _doJoin(roomCode, nickname) {
    wx.showLoading({ title: '加入中...' });
    roomService.joinRoom({
      roomCode,
      nickname,
      avatarIndex: appStore.avatarIndex || 0,
    }).then((res) => {
      wx.hideLoading();
      if (res.code === 'OK') {
        _addRecent(res.data.roomId, roomCode);
        this._renderRecent();
        wx.navigateTo({ url: `/pages/room/index/index?roomId=${res.data.roomId}` });
      } else {
        handleError({ code: res.code, message: res.message }, this);
      }
    }).catch((err) => {
      wx.hideLoading();
      handleError(err, this);
    });
  },

  // 修改昵称（M3 完整实现：同步到云端 players）
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

  // 帮助弹窗（M4 完整实现：完整内容）
  onShowHelp() {
    wx.showModal({
      title: '使用帮助',
      content: '【核心用法】\n1. 点创建牌局或加入牌局（输入 6 位房间号）\n2. 房间内点别的玩家头像 → 输入扣分（自己 -X，对方 +X）\n3. 排行榜实时刷新\n4. 点自己头像修改昵称（房间内会同步给其他玩家）\n\n【辅助算分】\n- 点「辅助算分」按麻将规则（自摸/点炮/番数/杠）自动算分\n- 结果预览后点「应用到房间」才入账\n\n【数据与隐私】\n- 仅记录番数变化，不涉及任何金钱交易\n- 数据存于微信云开发，仅用于牌局记录\n- 本应用仅供娱乐和记录\n\n【协议】\n- 用户协议、隐私协议见首页「帮助」',
      showCancel: false,
      confirmText: '我知道了',
    });
  },
});
