const { AVATAR_NAMES } = require('../../utils/constants');

Component({
  properties: {
    visible: { type: Boolean, value: false },
    playerId: { type: String, value: '' },
    nickname: { type: String, value: '' },
    avatarIndex: { type: Number, value: 0 },
    totalScore: { type: Number, value: 0 },
    customNickname: { type: String, value: '' },
  },
  data: {
    selectedNicknameType: 'system',  // 'system' | 'custom'
    systemNickname: '',
    inputNickname: '',
  },
  lifetimes: {
    attached() {
      this._initState();
    },
  },
  observers: {
    'avatarIndex': function(avatarIndex) {
      const name = AVATAR_NAMES[avatarIndex] || '东风';
      this.setData({ systemNickname: name });
    },
  },
  methods: {
    _initState() {
      const avatarIndex = this.properties.avatarIndex;
      // 直接从 storage 读自定义昵称（双向同步的关键）
      const customNickname = wx.getStorageSync('customNickname') || '';
      const systemNickname = AVATAR_NAMES[avatarIndex] || '东风';
      // 有自定义昵称 → 默认选自定义；否则默认选系统昵称
      const selectedNicknameType = customNickname ? 'custom' : 'system';
      this.setData({
        selectedNicknameType,
        systemNickname,
        inputNickname: customNickname,
      });
    },

    onMaskTap() {
      this.triggerEvent('close');
    },

    onTapAvatar(e) {
      const idx = Number(e.currentTarget.dataset.idx);
      // 头像变化时更新系统昵称值，但保持用户当前选择的昵称类型
      const systemNickname = AVATAR_NAMES[idx] || '东风';
      this.setData({
        avatarIndex: idx,
        systemNickname,
      });
      this.triggerEvent('avatarchange', { avatarIndex: idx }, true);
    },

    onSelectNicknameType(e) {
      const type = e.currentTarget.dataset.type;
      this.setData({ selectedNicknameType: type });
    },

    onNicknameInput(e) {
      this.setData({ inputNickname: e.detail.value });
    },

    noop() {},

    onEditNick() {
      this.triggerEvent('editnick');
    },

    onConfirm() {
      const { selectedNicknameType, systemNickname, inputNickname, avatarIndex } = this.data;
      const nickname = selectedNicknameType === 'system' ? systemNickname : inputNickname;
      console.log('【popup onConfirm】', { nickname, selectedNicknameType, systemNickname, inputNickname, avatarIndex });
      this.triggerEvent('confirm', {
        nickname,
        avatarIndex,
        selectedNicknameType,
      });
    },
  },
});