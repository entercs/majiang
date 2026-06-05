const { observable } = require('./observable');
const { getProfile, getOrCreateAnonymousUser } = require('../services/userService');
const { pickRandomName } = require('../services/randomName');

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
    // 首次进入：随机分配麻将术语风昵称
    const stored = wx.getStorageSync('nickname');
    if (stored) {
      this.nickname = stored;
    } else {
      const randomName = pickRandomName();
      wx.setStorageSync('nickname', randomName);
      this.nickname = randomName;
    }
    this.avatarIndex = wx.getStorageSync('avatarIndex') || 0;
  },

  setProfile(nickname, avatarIndex) {
    this.nickname = nickname;
    this.avatarIndex = avatarIndex;
    wx.setStorageSync('nickname', nickname);
    wx.setStorageSync('avatarIndex', avatarIndex);
  },

  setOpenid(openid) {
    this.openid = openid;
    this.isAnonymous = false;
    wx.setStorageSync('openid', openid);
  },
});

module.exports = store;
