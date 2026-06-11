Component({
  properties: {
    initialValue: { type: Number, value: 1 },
    autoFocus: { type: Boolean, value: true },
  },
  data: {
    value: 1,
  },
  lifetimes: {
    attached() {
      this.setData({ value: this.properties.initialValue });
    },
  },
  methods: {
    noop() {},
    onInput(e) {
      const raw = String(e.detail.value || '').replace(/[^0-9]/g, '');
      this.setData({ value: Number(raw) || 0 });
    },
    onQuickTap(e) {
      this.setData({ value: Number(e.currentTarget.dataset.v) || 0 });
    },
    onInc() {
      this.setData({ value: (Number(this.data.value) || 0) + 1 });
    },
    onDec() {
      const v = (Number(this.data.value) || 0) - 1;
      this.setData({ value: v < 0 ? 0 : v });
    },
    onConfirm() {
      const v = Number(this.data.value) || 0;
      if (v === 0) {
        this.triggerEvent('cancel');
        return;
      }
      this.triggerEvent('confirm', { value: v });
    },
    onCancel() {
      this.triggerEvent('cancel');
    },
    onMaskTap() {
      this.triggerEvent('cancel');
    },
  },
});