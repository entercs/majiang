# 房间生命周期设计文档

**日期**：2026-06-09
**项目**：「胡了么」麻将记分小程序
**状态**：待用户审阅
**作者**：通过头脑风暴流程与用户协作产出
**对应需求**：[need.md](../../need.md) 4 条

> **核心转变**：
> - **触发关闭的两条路径**：① 任何人点「结束本局」；② 所有玩家都离开 → **自动关**
> - **退出房间 ≠ 关闭房间**：退出只标离线，player 记录保留；关闭是房间级别的状态终结
> - **首页改造**：把"最近玩过"拆成"进行中"和"已结束"两区

---

## 0. 需求映射

| need.md | 本设计 § |
|---|---|
| 1. 去掉房主专有的解散按钮 | § 3.1 |
| 2. 点击玩家列表/排行榜的头像/昵称效果统一 | § 3.1 + § 3.3 |
| 3. 退出后首页显示"进行中"/"查看战绩" | § 3.2 + § 4.流程 C/D |
| 4. 房间关闭逻辑方案 | § 1 + § 2 + § 4.流程 A/B |

---

## 1. 数据模型

### 1.1 `players` 集合（加 2 个字段）

```js
{
  _id, roomId, nickname, avatarIndex, seatIndex, isOwner, openid?, clientId, joinedAt,
  // ↓ 新增
  isOnline: Boolean,       // 默认 true（创建时）
  lastSeenAt: Number,      // 毫秒时间戳；标为离线时更新
}
```

### 1.2 `rooms` 集合（扩展 2 个字段）

```js
{
  ...existing,
  status: 'active' | 'finished',  // 沿用
  // ↓ 扩展
  closedAt: Number | null,            // 关闭时间戳；null = 未关闭
  closedBy: 'manual' | 'auto' | null, // 关闭触发方式
}
```

### 1.3 老数据迁移

- 老 `players` 没有 `isOnline` 字段 → 启动时给老数据补 `isOnline: true`（一次性脚本，不强制要求）
- 老 `rooms` 没有 `closedAt` / `closedBy` → 不补值（用 `null` 默认即可）

---

## 2. 云函数

### 2.1 新建 `leaveRoom`

**职责**：标为离线 + 自动关闭检测（**一个事务**）

```js
// 入参
{ roomId, playerId, clientId }

// 流程（db.runTransaction 内）
1. tx.collection('players').doc(playerId).get() → 校验 player.clientId === clientId
2. tx.collection('players').doc(playerId).update({ isOnline: false, lastSeenAt: Date.now() })
3. tx.collection('players').where({ roomId, isOnline: true }).count()
4. 若 count === 0 → tx.collection('rooms').doc(roomId).update({
     status: 'finished', closedAt: Date.now(), closedBy: 'auto'
   })
5. return { code: 'OK', autoClosed: <bool> }
```

**错误码**：
- `FORBIDDEN`（clientId 不匹配）
- `PLAYER_NOT_FOUND`
- `ROOM_NOT_FOUND`

### 2.2 新建 `finishRoom`

**职责**：手动结束本局（**任何玩家可调用**）

```js
// 入参
{ roomId, clientId }

// 流程
1. 校验调用者是房内玩家（players.where({ roomId, clientId }) 至少 1 条）
2. 校验 rooms.status === 'active'（不能重复关）
3. rooms.update({ status: 'finished', closedAt, closedBy: 'manual' })
4. players.where({ roomId }).update({ isOnline: false })  // 清理所有在线
5. return { code: 'OK' }
```

**错误码**：
- `FORBIDDEN`
- `ROOM_ALREADY_FINISHED`

### 2.3 改造 `joinRoom`

**两个场景必须区分**：

| 场景 | 行为 |
|---|---|
| **首次加入**（输入房间号） | 创建新 player，`isOnline: true` |
| **重入**（从首页"进行中"点回） | 找到同 roomId+clientId 的旧 player，置 `isOnline: true`；**不创建新 player** |

**入参**：
```js
{ roomCode, clientId, nickname, avatarIndex }
```

**流程**：
```
1. rooms.where({ roomCode }).get() → 找到 room
2. rooms.status !== 'active' → 报错 ROOM_FINISHED
3. players.where({ roomId, clientId }).get()
   - 若已存在 → update({ isOnline: true, lastSeenAt, nickname, avatarIndex })
   - 若不存在 → add({ ...new player, isOnline: true, lastSeenAt })
4. return { code: 'OK', data: { roomId, playerId, isRejoin } }
```

### 2.4 新建 `getMyRooms`

**职责**：拉取当前 clientId 的所有相关房间

```js
// 入参
{ clientId }

// 流程
1. players.where({ clientId }).get() → 拿到所有 playerIds
2. rooms.where({ _id: db.command.in([...roomIds]) }).get()
3. 对每个 room，按 status 归类
4. return {
     code: 'OK',
     data: {
       active: [{ roomId, roomCode, onlineCount, lastActivityAt }, ...],
       finished: [{ roomId, roomCode, closedAt, closedBy }, ...],
     }
   }
```

**注意**：这一步涉及 `players → rooms` 的间接查询。性能不是瓶颈（5 条/用户）。

---

## 3. 前端 UI

### 3.1 房间内（`pages/room/index/index`）

**底部按钮**：去掉"结束本局"。

**`actions` 渲染逻辑**：
```js
const actions = [
  { type: 'auto', label: '辅助算分', handler: 'onAutoScore' },
  { type: 'history', label: '历史战绩', handler: 'onShowHistory' },
];
// 所有人通用，无 isOwner 分支
```

**`onTapPlayer` 统一逻辑**（玩家行 + 排行榜行都走这里）：
```js
onTapPlayer(e) {
  const id = e.currentTarget.dataset.id;
  const isSelf = id === this.data.currentPlayerId;
  if (isSelf) {
    this.setData({ selfPopupVisible: true, selfPopupTarget: player });
  } else {
    this.setData({ scorePopupVisible: true, scorePopupTarget: player });  // 不变
  }
}
```

**排行榜行**：在 `room/index/index.wxml` 的 `rank-row` 上加 `bind:tap="onTapPlayer" data-id="{{item._id}}"`。

**self 弹窗（新建 `components/player-popup`）**：

```html
<view class="player-popup-mask" bind:tap="onMaskTap">
  <view class="player-popup" catch:tap>
    <image class="avatar" src="..." />
    <text class="nick">{{nickname}}</text>
    <text class="score">{{totalScore}} 分</text>
    <button class="btn-default" bind:tap="onEditNickname">修改昵称</button>
    <button class="btn-default" bind:tap="onLeaveRoom">退出房间</button>
    <button class="btn-danger" bind:tap="onFinishRoom">结束本局</button>
  </view>
</view>
```

**事件**：
- `onEditNickname`：复用现有 `_showEditNicknameModal`
- `onLeaveRoom`：
  - `wx.showModal({ title: '退出房间', content: '确定要退出吗？你可以稍后从首页「进行中」回到房间。' })`
  - 确认 → `roomService.leaveRoom` → `wx.reLaunch` 到首页
- `onFinishRoom`：
  - `wx.showModal({ title: '结束本局', content: '结束后所有人都无法再记录分数，且无法重新开启。确定要结束吗？', confirmText: '结束本局', confirmColor: '#d33' })`
  - 确认 → `roomService.finishRoom` → `wx.redirectTo` 到 summary

### 3.2 首页（`pages/home/index/index`）

**当前结构**：
- "最近玩过"列表 5 条

**新结构**：
- "进行中"分区：每条显示 `房间号` + `N 人在线` + 点击重入
- "已结束"分区：每条显示 `房间号` + `关闭时间` + 点击跳 summary
- 没有则整区隐藏

**wxml 改造**：
```html
<view class="active-section" wx:if="{{myRooms.active.length > 0}}">
  <view class="section-title">进行中</view>
  <view wx:for="{{myRooms.active}}" wx:key="roomId" class="room-item"
        bind:tap="onTapActive" data-roomid="{{item.roomId}}" data-roomcode="{{item.roomCode}}">
    <text class="code">{{item.roomCode}}</text>
    <text class="meta">{{item.onlineCount}} 人在线</text>
  </view>
</view>

<view class="finished-section" wx:if="{{myRooms.finished.length > 0}}">
  <view class="section-title">已结束</view>
  <view wx:for="{{myRooms.finished}}" wx:key="roomId" class="room-item"
        bind:tap="onTapFinished" data-roomid="{{item.roomId}}">
    <text class="code">{{item.roomCode}}</text>
    <text class="meta">{{item.timeText}}</text>
  </view>
</view>
```

**逻辑**：
- `onShow` 时调 `getMyRooms` 刷新（5 分钟缓存）
- `onTapActive` → 调 `joinRoom` 重入（cloud 端会找到旧 player）
- `onTapFinished` → `wx.navigateTo` 到 summary 页（带 roomId 参数）

### 3.3 组件

| 组件 | 状态 | 改动 |
|---|---|---|
| `components/score-popup` | 不变 | 给别人加 X 分 |
| `components/player-popup` | **新建** | self 操作弹窗（3 个按钮） |
| `components/player-card` | 暂不变 | 暂未在房间主页用到（room/index 自实现） |

---

## 4. 数据流（端到端）

### 流程 A：玩家退出房间（手动）

```
[房间页] 点自己头像
  → 弹 self 弹窗
[点"退出房间"]
  → wx.showModal: "确定退出吗？"
[点"确定"]
  → roomService.leaveRoom({ roomId, playerId, clientId })
  → 云函数: tx 标离线 + 检查在线人数 + (可能)自动关房
  → wx.reLaunch({ url: '/pages/home/index' })
[首页] onShow → getMyRooms 刷新
  → 看到该房间进入"已结束"（若 autoClosed）或"进行中"（若还有别人在）
```

### 流程 B：手动结束本局

```
[房间页] 点自己头像
  → 弹 self 弹窗
[点"结束本局"]  ← 红色按钮
  → wx.showModal: "结束后无法再记录分数，确定吗？"
[点"确定"]
  → roomService.finishRoom({ roomId, clientId })
  → 云函数: 置 finished + 清理所有 isOnline
  → wx.redirectTo({ url: '/pages/room/summary/index' })
[summary] 只读模式（不显示"再开一局"等）
```

### 流程 C：重入已结束房间（从首页）

```
[首页] 点"已结束"分区的某条
  → home.onTapFinished
  → wx.navigateTo({ url: `/pages/room/summary/index?roomId=${id}&readonly=1` })
[summary] 只读渲染
```

### 流程 D：重入进行中房间（从首页）

```
[首页] 点"进行中"分区的某条
  → home.onTapActive
  → roomService.joinRoom({ roomCode, clientId, nickname, avatarIndex })
  → 云函数: 找到旧 player → 置 isOnline=true（不创建新）
  → wx.navigateTo({ url: `/pages/room/index/index?roomId=${id}` })
[房间页] 正常体验
```

---

## 5. 风险与开放问题

| # | 风险 | 缓解 | 严重度 |
|---|---|---|---|
| 1 | App 崩溃/强杀：`isOnline=true` 一直挂着 | MVP 接受；后续加云函数定时器（每 5 min 扫 `lastSeenAt > 10min` 标离线） | 中 |
| 2 | 网络抖动：退出时网络断了 | `wx.cloud.callFunction` 自带重试；客户端先 reLaunch 回家，后台异步重试 | 低 |
| 3 | 弹窗"退出"误点 | 退出加二次确认（`wx.showModal`） | 低 |
| 4 | 排行榜整行可点 | 整行可点，触摸区更大，OK | 无 |
| 5 | 首页 5 min 缓存可能过期 | 缓存里只存 `roomId` 列表，状态在 `onShow` 时强制刷新 | 低 |
| 6 | 老数据迁移 | 给老 players 补 `isOnline: true`（一次性脚本） | 低 |
| 7 | `getMyRooms` 性能 | 用户 ≤ 5 条房间，不成瓶颈 | 低 |

---

## 6. 实施分阶段

| 阶段 | 目标 | 工作量 |
|---|---|---|
| **M0** | 数据模型：扩展 `players` / `rooms` 字段 + 老数据迁移脚本 | 0.5 天 |
| **M1** | 云函数：新建 `leaveRoom` / `finishRoom` / `getMyRooms` + 改造 `joinRoom` | 1 天 |
| **M2** | 前端：self 弹窗组件 + 房间内 onTapPlayer 统一 + 排行榜行点击 | 1 天 |
| **M3** | 前端：首页"进行中/已结束"分区 + onShow 调 getMyRooms + 跳转逻辑 | 1 天 |
| **M4** | 联调：完整跑 4 个流程，回归 MVP 测试 | 0.5 天 |

总计约 **4 天**（单人）。

---

## 7. 附录

### 7.1 关键文件清单

**新增**：
- `cloudfunctions/leaveRoom/index.js`
- `cloudfunctions/finishRoom/index.js`
- `cloudfunctions/getMyRooms/index.js`
- `miniprogram/components/player-popup/index.{wxml,wxss,js,json}`

**修改**：
- `cloudfunctions/joinRoom/index.js`（支持重入）
- `miniprogram/services/roomService.js`（加 leaveRoom、getMyRooms 导出）
- `miniprogram/services/playerService.js`（可能加 updateOnlineStatus）
- `miniprogram/pages/room/index/index.wxml`（去掉"结束本局"按钮，排行榜加 bind:tap）
- `miniprogram/pages/room/index/index.js`（onTapPlayer 统一，新增 onLeaveRoom、onFinishRoom）
- `miniprogram/pages/home/index/index.wxml`（拆"进行中"和"已结束"两个分区）
- `miniprogram/pages/home/index/index.js`（onShow 调 getMyRooms，新增 onTapActive、onTapFinished）
- `miniprogram/pages/room/summary/index.wxml/.js`（支持 readonly 参数模式）

### 7.2 兼容性

- 老 `rooms.status='active'` 数据不受影响
- 老 `players` 缺 `isOnline` 字段 → `where({isOnline: true})` 查询会**只查到有该字段的**（即新数据）。**不**用 `$exists: false` 兜底，避免复杂化
