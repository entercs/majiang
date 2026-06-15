# 黄梅麻将玩法配置（算炮数可配置化）实现计划

## 背景

黄梅麻将各牌型的"炮数"（fan 值）目前写死在 `huangmei.js` 和 `auto-score/index.js` 两处，无法灵活调整。不同地区玩法不同，需要支持自定义各牌型及胡牌方式的炮数。

---

## 问题清单（实施前已确认）

| # | 优先级 | 问题 |
|---|--------|------|
| A | 关键 | `_recomputeHm()` 和 `huangmei.js` 是两套独立逻辑，fan 值必须统一数据源 |
| B | 关键 | `validateRule` 硬编码字段列表，会拒绝包含新字段的 rule |
| C | 中等 | 新房间 rule 无 `cardTypeFans`/`winTypeFans`，需兜底初始化 |
| D | 中等 | 非房主应有只读提示 |
| E | 轻微 | fan 值无范围校验（建议 min=0, max=100） |

---

## 改动范围与实施步骤

### Step 1：`huangmei.js` 新增查表函数

**文件**：`miniprogram/rules/huangmei.js`

**改动**：
- 新增 `getCardTypeFan(key, rule)` 函数：优先取 `rule.cardTypeFans?.[key]`，无则用 `CARD_TYPES` 默认值
- 新增 `getWinTypeFan(key, rule)` 函数：优先取 `rule.winTypeFans?.[key]`，无则用 `WIN_TYPES` 默认值
- 两个函数导出供外部调用

**说明**：`computeFanBreakdown()` 保持不变（暂未被调用），后续有需要时再改造。

---

### Step 2：`auto-score/index.js` 改造 `_recomputeHm()`

**文件**：`miniprogram/pages/room/auto-score/index.js`

**改动**：
- 引入 `huangmei.js` 的 `getCardTypeFan`/`getWinTypeFan`
- 改造 `_recomputeHm()` 内的查表逻辑：
  - 原来直接查 `HM_CARD_TYPES` 常量 → 改为 `getCardTypeFan(key, roomStore.rule)`
  - 原来直接查 `HM_WIN_TYPES` 常量 → 改为 `getWinTypeFan(key, roomStore.rule)`
- 发财、明杠、暗杠、红中、白板、门清等辅助 fan 值暂不纳入可配置范围，保持现有逻辑不变（因为它们不是"牌型炮数"，而是"附加分"）
- 新增 `openConfigPanel()` 方法：面板打开时从 `roomStore.rule` 读取 `cardTypeFans`/`winTypeFans`，若不存在则用 `huangmei.js` 默认值初始化本地状态

---

### Step 3：配置面板 UI

**文件**：`miniprogram/pages/room/auto-score/index.wxml` + `index.wxss`

**改动**：
- 顶栏新增一行提示：`💡 如需调整炮数，请先点击「玩法配置」`
- 顶栏新增「玩法配置」按钮（次要样式），放在玩法切换 picker 右侧
- 新增配置面板弹窗（底部弹窗），包含：
  - 牌型列表（6项）：每个有 `[-]` `[+]` stepper 和说明文字（小号灰色字始终可见）
  - 胡牌方式列表（6项）：同上
  - 「取消」按钮 + 「应用到房间」按钮（仅房主可用，非房主灰化+提示）
- 输入框限制 min=0, max=100

**权限控制**：
- 房主：`isOwner=true` 时"应用到房间"按钮可用
- 非房主：面板为只读模式，按钮灰化，提示"仅房主可修改"

---

### Step 4：`ruleService.js` 改造 `validateRule`

**文件**：`miniprogram/services/ruleService.js`

**改动**：
- `validateRule` 仍保留现有字段校验，但将 `cardTypeFans`/`winTypeFans` 设为**可选字段**
- 若字段存在，则校验其为对象类型，且每个 key 的值为 0~100 的数字
- 字段不存在则跳过校验（向后兼容新建房间的场景）

---

### Step 5：后端 `updateRule` 云函数（无需改动）

**说明**：`updateRule` 云函数调用 `validateRule`，只要前端传的值能通过客户端 `validateRule`，云端也会通过（云端和客户端的 `ruleService.js` 是同套代码）。无需额外改造。

---

### Step 6：`roomStore` 规则同步

**文件**：`miniprogram/stores/roomStore.js`

**改动**：
- 配置面板"应用"成功后，调用 `roomStore.setRule(updatedRule)` 更新本地缓存
- 确保其他页面下次读取时拿到最新配置

---

## 数据流

```
房主打开玩法配置
  → 读取 roomStore.rule.cardTypeFans / winTypeFans
  → 不存在 → 用 huangmei.js 默认值初始化
  → 显示配置面板

房主调整数值并点"应用到房间"
  → 合并到 rule 对象（只改 cardTypeFans/winTypeFans，其他字段透传）
  → 调用 roomService.updateRule()
  → 成功后 roomStore.setRule() 更新本地

其他玩家下次打开辅助算分页面
  → _recomputeHm() 用 getCardTypeFan() / getWinTypeFan() 读取最新配置
  → 番数明细反映新炮数
```

---

## 待确认项（实施前需确认）

1. 辅助 fan 值（发财、明杠、暗杠、红中、白板、门清）是否也纳入可配置范围？目前计划**不纳入**，仅配置"牌型"和"胡牌方式"的基础炮数。
2. 配置面板默认展开还是收起？建议**默认收起**，避免干扰现有操作流程。
3. 说明文字内容是否需要你提供？还是我根据牌型含义自行编写？