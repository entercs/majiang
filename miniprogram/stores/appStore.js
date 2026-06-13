const { observable } = require('./observable');
const { getProfile, getOrCreateAnonymousUser } = require('../services/userService');
const { AVATAR_NAMES } = require('../utils/constants');

const store = observable({
  clientId: '',
  openid: '',
  isAnonymous: true,
  nickname: '',
  avatarIndex: 0,

  init() {
    const profile = getProfile();
    this.clientId = profile.clientId || getOrCreateAnonymousUser().clientId;
    this.openid = profile.openid;
    this.isAnonymous = profile.isAnonymous;
    // 昵称独立存储（可编辑）；优先读 customNickname（新 key），兜底读 nickname（旧 key）
    const customStored = wx.getStorageSync('customNickname');
    const stored = wx.getStorageSync('nickname');
    this.nickname = customStored || stored || '';
    // 首页固定显示"发财"头像
    this.avatarIndex = 6;
  },

  setProfile(nickname, avatarIndex) {
    this.nickname = nickname;
    this.avatarIndex = avatarIndex;
    wx.setStorageSync('nickname', nickname);
    wx.setStorageSync('avatarIndex', avatarIndex);
  },

  setNickname(nickname) {
    this.nickname = nickname;
    // 统一写到 customNickname（房间弹窗读取这个 key）
    wx.setStorageSync('customNickname', nickname);
    // nickname 也保留一份（兼容其他地方可能还在读这个 key）
    wx.setStorageSync('nickname', nickname);
  },

  setOpenid(openid) {
    this.openid = openid;
    this.isAnonymous = false;
    wx.setStorageSync('openid', openid);
  },
});

module.exports = store;
