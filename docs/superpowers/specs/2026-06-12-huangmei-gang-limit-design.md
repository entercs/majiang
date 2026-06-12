# 黄梅麻将杠数上限设计

## 背景

黄梅麻将规则：字牌与杠牌的总组数不能超过 3 组。

计入总组数的字段：
- `mingGang`（明杠数牌）：1–3 组
- `anGang`（暗杠数牌）：1–3 组
- `hongZhong`（红中）：选择"碰/暗刻/明杠/暗杠"之一时计 1 组；"无"不计入
- `baiBan`（白板）：同上

**总组数 = (mingGang || 0) + (anGang || 0) + (hongZhong === 'none' ? 0 : 1) + (baiBan === 'none' ? 0 : 1)**

上限 3 组。

## 交互规则

### 禁用规则
- **总组数 < 3**：所有杠选项正常可选。
- **总组数 = 3**：所有杠选项 chip 显示为 `disabled`，不可点击。
  - 已选中的选项维持选中，不强制清除。
  - 用户必须先取消某个已选杠，才能再选其他杠。
- **总组数 > 3**：理论上不可能（disabled 阻止），但若因 `hongZhong`/`baiBan` 切换导致（如从"明杠"切到"暗刻"组数不变；从"无"切到"碰"组数+1），则立即触发禁用。

### 清零联动
- 选"门前清"时，清掉 `hongZhong`、`baiBan`、`mingGang`（已有逻辑）。
- 清掉后总组数减少，禁用状态自动解除。

### 边界：hongZhong/baiBan 选"无"时
- 视为 0 组，`disabled` 判断时跳过。

## 实现方案

### 统一计算函数
```js
_getTotalGangGroups() {
  const mg = this.data.mingGang || 0;
  const ag = this.data.anGang || 0;
  const hz = (this.data.hongZhong && this.data.hongZhong !== 'none') ? 1 : 0;
  const bb = (this.data.baiBan && this.data.baiBan !== 'none') ? 1 : 0;
  return mg + ag + hz + bb;
}
```

### 统一禁用判断函数
```js
_applyGangDisabled() {
  const total = this._getTotalGangGroups();
  const isDisabled = total >= 3;
  this.setData({ gangDisabled: isDisabled });
}
```

### 各 onChange 里的改动

| 函数 | 改动 |
|------|------|
| `onMingGangChange` | 先设值，再调 `_applyGangDisabled()` + `_applyQmMutex()` + `_recompute()` |
| `onAnGangChange` | 同上 |
| `onHongZhongChange` | 同上 |
| `onBaiBanChange` | 同上 |

### WXML 改动

明杠数牌 chip：
```html
class="chip {{mingGang === item.key ? 'selected' : ''}} {{gangDisabled ? 'disabled' : ''}}"
```

暗杠数牌 chip：同上，`anGang`。

红中 chip：同上，加上 `hongZhong === 'none'` 时直接无 disabled。

白板 chip：同上，加上 `baiBan === 'none'` 时直接无 disabled。

### CSS
`disabled` 样式：半透明 + `pointer-events: none`，与现有 `qmDisabledMap` 的 disabled 样式保持一致。

## 数据流

```
用户点选杠 chip
  → onXxxChange
  → setData(xxx: newValue)
  → _applyGangDisabled()  // 计算总组数，设 gangDisabled
  → _applyQmMutex()       // 门前清互斥（不变）
  → _recompute()          // 番数/金额/可胡（不变）
```

## 变更范围

- `miniprogram/pages/room/auto-score/index.js`：新增 `_getTotalGangGroups`、`_applyGangDisabled`；修改 4 个 onChange。
- `miniprogram/pages/room/auto-score/index.wxml`：5 处 chip 加 `gangDisabled` 判断。
- `miniprogram/pages/room/auto-score/index.wxss`：无需改动（复用手头已有的 disabled 样式）。

## 验证

1. `mingGang=2` + `anGang=1` → 总组数 3 → 所有杠 chip disabled。
2. `mingGang=2` + `anGang=1` → 取消 `mingGang` → 总组数 1 → 所有杠 chip 可选。
3. `mingGang=1` + `hongZhong='peng'` + `baiBan='anke'` → 总组数 3 → disabled。
4. `mingGang=1` + `hongZhong='none'`（不选） + `baiBan='peng'` → 总组数 2 → 可选。