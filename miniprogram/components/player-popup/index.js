Component({
  properties: {
    visible: { type: Boolean, value: false },
    playerId: { type: String, value: '' },
    nickname: { type: String, value: '' },
    avatarIndex: { type: Number, value: 0 },
    totalScore: { type: Number, value: 0 },
  },
  methods: {
    onMaskTap() {
      this.triggerEvent('close');
    },
    onEditNickname() {
      this.triggerEvent('editnickname');
    },
    onLeaveRoom() {
      this.triggerEvent('leaveroom');
    },
    onFinishRoom() {
      this.triggerEvent('finishroom');
    },
  },
});
