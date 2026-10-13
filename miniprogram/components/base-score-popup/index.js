Component({
  properties: {
    initialValue: { type: Number, value: 1 },
    autoFocus: { type: Boolean, value: true },
  },
  data: {
    value: 1,
    canConfirm: true,
  },
  lifetimes: {
    attached() {
      this._setValue(this.properties.initialValue);
    },
  },
  methods: {
    noop() {},
    _setValue(value) {
      this.setData({ value, canConfirm: Number.isSafeInteger(value) && value > 0 });
    },
    onInput(e) {
      const raw = String(e.detail.value || '').trim();
      this._setValue(/^\d+$/.test(raw) ? Number(raw) : raw);
    },
    onQuickTap(e) {
      this._setValue(Number(e.currentTarget.dataset.v) || 0);
    },
    onInc() {
      this._setValue((Number(this.data.value) || 0) + 1);
    },
    onDec() {
      const v = (Number(this.data.value) || 0) - 1;
      this._setValue(v < 0 ? 0 : v);
    },
    onConfirm() {
      const v = Number(this.data.value) || 0;
      if (!this.data.canConfirm || !Number.isSafeInteger(v) || v <= 0) return;
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