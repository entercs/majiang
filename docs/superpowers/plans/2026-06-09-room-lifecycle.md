# 房间生命周期实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现房间的完整生命周期：手动结束 / 自动结束（最后一人离开）/ 重入 / 查看战绩

**Architecture:** 在现有 MVP 基础上扩展：
- 数据模型：`players` 加 `isOnline/lastSeenAt`，`rooms` 扩展 `closedAt/closedBy`
- 云函数：新建 `leaveRoom` / `finishRoom` / `getMyRooms`，改造 `joinRoom` 支持重入
- 前端：新建 `player-popup` 组件（self 弹窗）；首页拆"进行中"/"已结束"两区

**Tech Stack:** 微信原生小程序 (WXML/WXSS/JS) + 微信云开发 (wx.cloud + db.runTransaction) + Jest (单测)

**参考设计文档：** [docs/superpowers/specs/2026-06-09-room-lifecycle-design.md](../specs/2026-06-09-room-lifecycle-design.md)

---

## 文件结构总览（本计划涉及的变动）

```
majiang/
├── cloudfunctions/
│   ├── _shared/                    (既有，扩展：加 ERR_CODE.ROOM_ALREADY_FINISHED)
│   ├── leaveRoom/                  (新建)
│   ├── finishRoom/                 (新建)
│   ├── getMyRooms/                 (新建)
│   └── joinRoom/index.js           (改造：支持重入)
├── miniprogram/
│   ├── components/
│   │   ├── score-popup/            (既有，不变)
│   │   └── player-popup/           (新建)
│   ├── services/
│   │   ├── roomService.js          (改造：加 leaveRoom, getMyRooms 导出)
│   │   └── playerService.js        (改造：加 updateOnlineStatus)
│   ├── pages/
│   │   ├── room/index/             (改造：去"结束本局"按钮、排行榜加 bind:tap、加 self 弹窗)
│   │   └── home/index/             (改造：拆"进行中"/"已结束"两区)
│   └── stores/
│       └── roomStore.js            (扩展：保留 isOnline 缓存)
└── tests/
    ├── cloud/
    │   ├── leaveRoom.test.js       (新建)
    │   └── finishRoom.test.js      (新建)
    └── services/
        └── homePageState.test.js   (新建：测 getMyRooms 数据归类)
```

---

## 阶段概览

| 阶段 | 工作量 | 目标 | 任务数 |
|------|------|------|--------|
| **M0** | 0.5 天 | 数据模型 + 兼容老数据 | 2 |
| **M1** | 1 天 | 云函数 | 4 |
| **M2** | 1 天 | 前端：self 弹窗 + 房间内统一 | 3 |
| **M3** | 1 天 | 前端：首页改造 | 3 |
| **M4** | 0.5 天 | 联调回归 | 2 |

总计 **14 任务 / ~4 天**（单人开发）

---

# M0 — 数据模型（0.5 天）

## Task 1: 扩展 `players` / `rooms` 字段（云开发控制台）

**Files:**
- 无（直接操作云开发控制台）

- [ ] **Step 1: 在云开发控制台给 `players` 加字段**

打开云开发控制台 → 数据库 → `players` 集合 → 选中任意一条记录 → "添加字段"：

```
isOnline:  Boolean  // 全部填 true
lastSeenAt: Number   // 填当前时间戳
```

或者用云开发"数据迁移"工具：
- 导出所有 players → JSON
- 脚本加两个字段 → 重新导入

- [ ] **Step 2: 在云开发控制台给 `rooms` 加字段**

同样地，给 `rooms` 集合的每条记录加：

```
closedAt:  null
closedBy:  null
```

- [ ] **Step 3: 在 `_shared/constants.js` 加错误码**

编辑 `miniprogram/utils/constants.js`，在 `ERR_CODE` 块内追加：

```js
ROOM_ALREADY_FINISHED: 'ROOM_ALREADY_FINISHED',
```

- [ ] **Step 4: 把改动同步到 `_shared/constants.js`**

```bash
cd "c:/Claude Project/微信小程序/majiang"
cp miniprogram/utils/constants.js cloudfunctions/_shared/constants.js
```

- [ ] **Step 5: 提交**

```bash
git add miniprogram/utils/constants.js cloudfunctions/_shared/constants.js
git commit -m "feat(constants): add ROOM_ALREADY_FINISHED error code"
```

---

## Task 2: 让 `createRoom` 给新 player 设默认值

**Files:**
- Modify: `cloudfunctions/createRoom/index.js`

- [ ] **Step 1: 找到创建 player 的代码块**

在 `cloudfunctions/createRoom/index.js` 中搜索 `db.collection('players').add(`，找到当前代码（约 Step 5）。

- [ ] **Step 2: 在 add 的 data 里加 `isOnline` 和 `lastSeenAt`**

```js
const playerRes = await db.collection('players').add({
  data: {
    roomId,
    nickname: nickname.trim(),
    avatarIndex,
    seatIndex: 0,
    isOwner: true,
    openid: openid || null,
    joinedAt: Date.now(),
    isOnline: true,           // ← 新增
    lastSeenAt: Date.now(),   // ← 新增
  }
});
```

- [ ] **Step 3: 在微信开发者工具中右键 cloudfunctions/createRoom → 上传并部署**

- [ ] **Step 4: 创建测试房间验证**

在开发者工具的"云开发 → 云函数"里测试调用 `createRoom`，查看新 player 记录是否包含 `isOnline: true, lastSeenAt`。

- [ ] **Step 5: 提交**

```bash
git add cloudfunctions/createRoom/
git commit -m "feat(cloud): createRoom sets isOnline/lastSeenAt for new player"
```

---

# M1 — 云函数（1 天）

## Task 3: 新建 `leaveRoom` 云函数

**Files:**
- Create: `cloudfunctions/leaveRoom/index.js`
- Create: `cloudfunctions/leaveRoom/package.json`
- Create: `cloudfunctions/leaveRoom/config.json`

- [ ] **Step 1: 创建 `package.json`**

```json
{
  "name": "leaveRoom",
  "version": "1.0.0",
  "main": "index.js",
  "dependencies": {
    "wx-server-sdk": "~2.6.3"
  }
}
```

- [ ] **Step 2: 创建 `config.json`**

```json
{ "permissions": { "openapi": [] } }
```

- [ ] **Step 3: 写 `index.js`**

```js
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;
const { ROOM_STATUS, ERR_CODE } = require('../_shared/constants');

exports.main = async (event) => {
  const { roomId, playerId, clientId } = event;

  // 1. 入参校验
  if (!roomId || !playerId || !clientId) {
    return { code: 'INVALID_INPUT', message: '参数缺失', detail: 'roomId/playerId/clientId' };
  }

  try {
    const result = await db.runTransaction(async (tx) => {
      // 1) 拿 player
      const playerRes = await tx.collection('players').doc(playerId).get();
      if (!playerRes.data) {
        return { code: 'PLAYER_NOT_FOUND', message: '玩家不存在' };
      }
      const player = playerRes.data;
      if (player.clientId !== clientId) {
        return { code: 'FORBIDDEN', message: '无权操作' };
      }

      // 2) 校验 room
      const roomRes = await tx.collection('rooms').doc(roomId).get();
      if (!roomRes.data) {
        return { code: 'ROOM_NOT_FOUND', message: '房间不存在' };
      }

      // 3) 标为离线
      await tx.collection('players').doc(playerId).update({
        data: { isOnline: false, lastSeenAt: Date.now() }
      });

      // 4) 查该 room 内剩余在线人数
      const onlineCountRes = await tx.collection('players')
        .where({ roomId, isOnline: true })
        .count();
      const onlineCount = onlineCountRes.total;

      // 5) 若无人在线且房间还 active → 自动关
      let autoClosed = false;
      if (onlineCount === 0 && roomRes.data.status === ROOM_STATUS.ACTIVE) {
        await tx.collection('rooms').doc(roomId).update({
          data: {
            status: ROOM_STATUS.FINISHED,
            closedAt: Date.now(),
            closedBy: 'auto',
          }
        });
        autoClosed = true;
      }

      return { code: 'OK', data: { autoClosed, onlineCount } };
    });

    return result;
  } catch (err) {
    console.error('leaveRoom error:', err);
    return { code: 'INTERNAL_ERROR', message: err.message };
  }
};
```

- [ ] **Step 4: 在开发者工具中上传并部署**

右键 `cloudfunctions/leaveRoom` → 上传并部署：云端安装依赖。

- [ ] **Step 5: 提交**

```bash
git add cloudfunctions/leaveRoom/
git commit -m "feat(cloud): add leaveRoom with auto-close detection"
```

---

## Task 4: 新建 `finishRoom` 云函数

**Files:**
- Create: `cloudfunctions/finishRoom/{index.js,package.json,config.json}`

- [ ] **Step 1: 创建 `package.json`**

```json
{
  "name": "finishRoom",
  "version": "1.0.0",
  "main": "index.js",
  "dependencies": { "wx-server-sdk": "~2.6.3" }
}
```

- [ ] **Step 2: 创建 `config.json`**

```json
{ "permissions": { "openapi": [] } }
```

- [ ] **Step 3: 写 `index.js`**

```js
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;
const { ROOM_STATUS, ERR_CODE } = require('../_shared/constants');

exports.main = async (event) => {
  const { roomId, clientId } = event;

  if (!roomId || !clientId) {
    return { code: 'INVALID_INPUT', message: '参数缺失' };
  }

  try {
    // 1. 校验调用者是房内玩家
    const playerRes = await db.collection('players')
      .where({ roomId, clientId })
      .limit(1)
      .get();
    if (playerRes.data.length === 0) {
      return { code: 'FORBIDDEN', message: '你不在该房间中' };
    }

    // 2. 校验房间状态
    const roomRes = await db.collection('rooms').doc(roomId).get();
    if (!roomRes.data) {
      return { code: 'ROOM_NOT_FOUND', message: '房间不存在' };
    }
    if (roomRes.data.status !== ROOM_STATUS.ACTIVE) {
      return { code: 'ROOM_ALREADY_FINISHED', message: '本局已结束' };
    }

    // 3. 关闭房间 + 清理所有 isOnline
    const now = Date.now();
    await db.runTransaction(async (tx) => {
      await tx.collection('rooms').doc(roomId).update({
        data: {
          status: ROOM_STATUS.FINISHED,
          closedAt: now,
          closedBy: 'manual',
        }
      });
      await tx.collection('players').where({ roomId }).update({
        data: { isOnline: false, lastSeenAt: now },
      });
    });

    return { code: 'OK', data: { closedAt: now, closedBy: 'manual' } };
  } catch (err) {
    console.error('finishRoom error:', err);
    return { code: 'INTERNAL_ERROR', message: err.message };
  }
};
```

- [ ] **Step 4: 上传并部署**

- [ ] **Step 5: 提交**

```bash
git add cloudfunctions/finishRoom/
git commit -m "feat(cloud): add finishRoom (manual close)"
```

---

## Task 5: 新建 `getMyRooms` 云函数

**Files:**
- Create: `cloudfunctions/getMyRooms/{index.js,package.json,config.json}`

- [ ] **Step 1: 创建 `package.json`**

```json
{
  "name": "getMyRooms",
  "version": "1.0.0",
  "main": "index.js",
  "dependencies": { "wx-server-sdk": "~2.6.3" }
}
```

- [ ] **Step 2: 创建 `config.json`**

```json
{ "permissions": { "openapi": [] } }
```

- [ ] **Step 3: 写 `index.js`**

```js
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;
const { ROOM_STATUS } = require('../_shared/constants');

exports.main = async (event) => {
  const { clientId } = event;
  if (!clientId) {
    return { code: 'INVALID_INPUT', message: 'clientId 缺失' };
  }

  try {
    // 1. 拿该 clientId 的所有 player 记录
    const playersRes = await db.collection('players')
      .where({ clientId })
      .get();
    if (playersRes.data.length === 0) {
      return {
        code: 'OK',
        data: { active: [], finished: [] }
      };
    }

    // 2. 收集去重后的 roomIds
    const roomIds = [...new Set(playersRes.data.map(p => p.roomId))];

    // 3. 一次性查所有 room
    const roomsRes = await db.collection('rooms')
      .where({ _id: _.in(roomIds) })
      .get();
    const rooms = roomsRes.data;

    // 4. 对每个 room 算在线人数
    const active = [];
    const finished = [];
    for (const room of rooms) {
      const onlineCountRes = await db.collection('players')
        .where({ roomId: room._id, isOnline: true })
        .count();
      const item = {
        roomId: room._id,
        roomCode: room.roomCode,
        onlineCount: onlineCountRes.total,
        closedAt: room.closedAt || null,
        closedBy: room.closedBy || null,
      };
      if (room.status === ROOM_STATUS.ACTIVE) {
        active.push(item);
      } else {
        finished.push(item);
      }
    }

    // 5. 按 closedAt 倒序
    active.sort((a, b) => (b.closedAt || 0) - (a.closedAt || 0));
    finished.sort((a, b) => (b.closedAt || 0) - (a.closedAt || 0));

    return { code: 'OK', data: { active, finished } };
  } catch (err) {
    console.error('getMyRooms error:', err);
    return { code: 'INTERNAL_ERROR', message: err.message };
  }
};
```

- [ ] **Step 4: 上传并部署**

- [ ] **Step 5: 提交**

```bash
git add cloudfunctions/getMyRooms/
git commit -m "feat(cloud): add getMyRooms (returns active/finished for clientId)"
```

---

## Task 6: 改造 `joinRoom` 支持重入

**Files:**
- Modify: `cloudfunctions/joinRoom/index.js`

- [ ] **Step 1: 找到 joinRoom 的现有实现**

打开 `cloudfunctions/joinRoom/index.js`。当前逻辑是"找 room → 校验满员 → 创建新 player"。

- [ ] **Step 2: 加入 clientId 重入分支**

在入参校验后、"创建新 player"前，加：

```js
// 0. 改造：接受 clientId 入参
const { roomCode, nickname, avatarIndex, clientId } = event;
```

- [ ] **Step 3: 替换"创建新 player"部分**

把现有的 Step 3（按 openid 检查已加入）和 Step 4-5（分配座位、创建新 player）替换为：

```js
// 3. 优先按 clientId 查旧 player（重入）
if (clientId) {
  const existing = await db.collection('players')
    .where({ roomId: room._id, clientId })
    .limit(1)
    .get();
  if (existing.data.length > 0) {
    const p = existing.data[0];
    // 激活：isOnline=true, 更新昵称头像, 同步到 rooms.playerIds（若不在）
    await db.collection('players').doc(p._id).update({
      data: {
        isOnline: true,
        lastSeenAt: Date.now(),
        nickname: nickname.trim(),
        avatarIndex,
      }
    });
    // 旧 player 不在 playerIds 时补回
    if (!room.playerIds || !room.playerIds.includes(p._id)) {
      await db.collection('rooms').doc(room._id).update({
        data: { playerIds: _.push(p._id) }
      });
    }
    return {
      code: 'OK',
      data: { roomId: room._id, playerId: p._id, ruleId: room.ruleId, isRejoin: true }
    };
  }
}

// 3b. 兜底：按 openid 查旧 player（微信登录用户重入）
if (openid) {
  const existing = await db.collection('players')
    .where({ roomId: room._id, openid })
    .limit(1)
    .get();
  if (existing.data.length > 0) {
    const p = existing.data[0];
    await db.collection('players').doc(p._id).update({
      data: { isOnline: true, lastSeenAt: Date.now() }
    });
    return {
      code: 'OK',
      data: { roomId: room._id, playerId: p._id, ruleId: room.ruleId, isRejoin: true }
    };
  }
}

// 4. 分配座位（先来先得，找空位）
const takenSeats = (await db.collection('players').where({ roomId: room._id }).get()).data.map(p => p.seatIndex);
const allSeats = [0, 1, 2, 3];
const available = allSeats.find(s => !takenSeats.includes(s));
if (available === undefined) {
  return { code: 'ROOM_FULL', message: '房间已满' };
}

// 5. 创建玩家
const playerRes = await db.collection('players').add({
  data: {
    roomId: room._id,
    nickname: nickname.trim(),
    avatarIndex,
    seatIndex: available,
    isOwner: false,
    openid: openid || null,
    clientId: clientId || null,         // ← 新增
    joinedAt: Date.now(),
    isOnline: true,                    // ← 新增
    lastSeenAt: Date.now(),            // ← 新增
  }
});

// 6. 更新房间 playerIds
await db.collection('rooms').doc(room._id).update({
  data: { playerIds: _.push(playerRes._id) }
});

return {
  code: 'OK',
  data: { roomId: room._id, playerId: playerRes._id, ruleId: room.ruleId, isRejoin: false, seatIndex: available }
};
```

- [ ] **Step 4: 上传并部署**

- [ ] **Step 5: 提交**

```bash
git add cloudfunctions/joinRoom/
git commit -m "feat(cloud): joinRoom supports rejoin via clientId/openid"
```

---

# M2 — 前端：self 弹窗 + 房间内统一（1 天）

## Task 7: 扩展 `roomService.js` 暴露 leaveRoom / getMyRooms

**Files:**
- Modify: `miniprogram/services/roomService.js`

- [ ] **Step 1: 在 `roomService.js` 加 `leaveRoom` 函数**

在 `finishRoom` 函数下方加：

```js
function leaveRoom({ roomId, playerId, clientId }) {
  return callFunction('leaveRoom', { roomId, playerId, clientId });
}

function getMyRooms({ clientId }) {
  return callFunction('getMyRooms', { clientId });
}
```

- [ ] **Step 2: 更新 module.exports**

```js
module.exports = { createRoom, joinRoom, updateRule, getRoom, getPlayers, finishRoom, leaveRoom, getMyRooms };
```

- [ ] **Step 3: 提交**

```bash
git add miniprogram/services/roomService.js
git commit -m "feat(room): expose leaveRoom and getMyRooms in service"
```

---

## Task 8: 新建 `player-popup` 组件

**Files:**
- Create: `miniprogram/components/player-popup/index.wxml`
- Create: `miniprogram/components/player-popup/index.wxss`
- Create: `miniprogram/components/player-popup/index.js`
- Create: `miniprogram/components/player-popup/index.json`

- [ ] **Step 1: 创建 `index.json`**

```json
{
  "component": true,
  "usingComponents": {}
}
```

- [ ] **Step 2: 创建 `index.wxml`**

```html
<view class="popup-mask" bind:tap="onMaskTap">
  <view class="popup-panel" catch:tap>
    <image class="avatar" src="/images/avatars/avatar-{{avatarIndex || 0}}.png" mode="aspectFit"></image>
    <text class="nick">{{nickname}}</text>
    <text class="score">{{totalScore}} 分</text>

    <button class="popup-btn default" bind:tap="onEditNickname">修改昵称</button>
    <button class="popup-btn default" bind:tap="onLeaveRoom">退出房间</button>
    <button class="popup-btn danger" bind:tap="onFinishRoom">结束本局</button>
  </view>
</view>
```

- [ ] **Step 3: 创建 `index.wxss`**

```css
.popup-mask {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.popup-panel {
  width: 80%;
  max-width: 600rpx;
  background: #fff;
  border-radius: 24rpx;
  padding: 48rpx 32rpx 32rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16rpx;
}

.avatar {
  width: 128rpx;
  height: 128rpx;
  border-radius: 50%;
}

.nick {
  font-size: 36rpx;
  font-weight: 600;
  color: #333;
}

.score {
  font-size: 28rpx;
  color: #7A7E83;
  margin-bottom: 24rpx;
}

.popup-btn {
  width: 100%;
  height: 88rpx;
  line-height: 88rpx;
  border-radius: 12rpx;
  font-size: 30rpx;
  margin-top: 12rpx;
}

.popup-btn.default {
  background: #f5f5f5;
  color: #333;
}

.popup-btn.danger {
  background: #fff;
  color: #d33;
  border: 1rpx solid #d33;
}
```

- [ ] **Step 4: 创建 `index.js`**

```js
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
```

- [ ] **Step 5: 提交**

```bash
git add miniprogram/components/player-popup/
git commit -m "feat(ui): add player-popup component (self action sheet)"
```

---

## Task 9: 改造 `room/index`：去"结束本局"按钮 + 排行榜加点击 + 接 self 弹窗

**Files:**
- Modify: `miniprogram/pages/room/index/index.wxml`
- Modify: `miniprogram/pages/room/index/index.js`
- Modify: `miniprogram/pages/room/index/index.wxss`

- [ ] **Step 1: 修改 wxml — 去掉"结束本局"按钮**

在 `miniprogram/pages/room/index/index.wxml` 中找到：

```html
<view wx:if="{{isOwner}}" class="action-btn finish" bind:tap="onFinishRoom">结束本局</view>
```

整行**删除**。同时 `actions` 容器上的 `actions-3` 改为 `actions-2`（无脑搜索替换 `actions-3` 为 `actions-2`）。

- [ ] **Step 2: 修改 wxml — 排行榜行加 bind:tap**

找到 `<view class="rank-row {{index === 0 ? 'first' : ''}}">`，替换为：

```html
<view class="rank-row {{index === 0 ? 'first' : ''}}" bind:tap="onTapPlayer" data-id="{{item._id}}" data-self="{{item._id === currentPlayerId}}">
```

- [ ] **Step 3: 修改 wxml — 在 score-popup 之后加 self-popup**

在：

```html
<score-popup
  wx:if="{{popupVisible}}"
  ...
></score-popup>
```

下方加：

```html
<player-popup
  wx:if="{{selfPopupVisible}}"
  player-id="{{selfPopupTarget._id}}"
  nickname="{{selfPopupTarget.nickname}}"
  avatar-index="{{selfPopupTarget.avatarIndex}}"
  total-score="{{selfPopupTarget.totalScore}}"
  bind:close="onSelfPopupClose"
  bind:editnickname="onSelfPopupEditNickname"
  bind:leaveroom="onSelfPopupLeaveRoom"
  bind:finishroom="onSelfPopupFinishRoom"
></player-popup>
```

- [ ] **Step 4: 修改 js — data 加 self popup 状态**

在 `data` 中加：

```js
selfPopupVisible: false,
selfPopupTarget: null,
```

- [ ] **Step 5: 修改 js — 改 onTapPlayer**

把现有 `onTapPlayer` 替换为：

```js
onTapPlayer(e) {
  const id = e.currentTarget.dataset.id;
  const isSelf = e.currentTarget.dataset.self;
  const player = roomStore.players.find(p => p._id === id);
  if (!player) return;

  if (isSelf) {
    const totals = roomStore.getTotalScores();
    this.setData({
      selfPopupVisible: true,
      selfPopupTarget: { ...player, totalScore: totals[id] || 0 },
    });
  } else {
    this.setData({
      popupVisible: true,
      popupTarget: player,
    });
  }
},
```

- [ ] **Step 6: 修改 js — 加 4 个 self popup 回调**

```js
onSelfPopupClose() {
  this.setData({ selfPopupVisible: false });
},

onSelfPopupEditNickname() {
  this.setData({ selfPopupVisible: false });
  this._showEditNicknameModal();
},

onSelfPopupLeaveRoom() {
  this.setData({ selfPopupVisible: false });
  wx.showModal({
    title: '退出房间',
    content: '确定要退出吗？你可以稍后从首页「进行中」回到房间。',
    success: (modal) => {
      if (modal.confirm) {
        const me = roomStore.players.find(p => p._id === roomStore.currentPlayerId);
        if (!me) return;
        roomService.leaveRoom({
          roomId: roomStore.roomId,
          playerId: me._id,
          clientId: appStore.clientId,
        }).then((res) => {
          if (res.code === 'OK') {
            wx.reLaunch({ url: '/pages/home/index' });
          } else {
            handleError(res, this);
          }
        }).catch((err) => handleError(err, this));
      }
    },
  });
},

onSelfPopupFinishRoom() {
  this.setData({ selfPopupVisible: false });
  wx.showModal({
    title: '结束本局',
    content: '结束后所有人都无法再记录分数，且无法重新开启。确定要结束吗？',
    confirmText: '结束本局',
    confirmColor: '#d33',
    success: (modal) => {
      if (modal.confirm) {
        roomService.finishRoom(roomStore.roomId).then((res) => {
          if (res.code === 'OK') {
            wx.redirectTo({ url: '/pages/room/summary/index' });
          } else {
            handleError(res, this);
          }
        }).catch((err) => handleError(err, this));
      }
    },
  });
},
```

- [ ] **Step 7: 修改 wxml — 引入 player-popup 组件**

在 `miniprogram/pages/room/index/index.json` 中加：

```json
{
  "usingComponents": {
    "score-popup": "/components/score-popup/index",
    "player-popup": "/components/player-popup/index"
  }
}
```

（已有 score-popup 的要保留）

- [ ] **Step 8: 验证编译**

在开发者工具里打开房间页：
- 底部应该只有 2 个按钮（辅助算分 + 历史战绩）
- 点自己头像应该弹 player-popup（3 个按钮）
- 点排行榜自己的行 → 也应该弹 player-popup
- 点排行榜别人 / 玩家行别人 → 弹 score-popup（不变）

- [ ] **Step 9: 提交**

```bash
git add miniprogram/pages/room/index/
git commit -m "feat(room): unify self popup + remove owner-only finish button"
```

---

# M3 — 前端：首页改造（1 天）

## Task 10: 改造 home wxml：拆"进行中"/"已结束"两区

**Files:**
- Modify: `miniprogram/pages/home/index/index.wxml`

- [ ] **Step 1: 替换"最近玩过" section**

找到：

```html
<view class="recent" wx:if="{{recentRooms.length > 0}}">
  <view class="recent-title">最近玩过</view>
  <view class="recent-list">
    <view class="recent-item" wx:for="{{recentRooms}}" wx:key="roomId" bindtap="onTapRecent" data-roomcode="{{item.roomCode}}" data-roomid="{{item.roomId}}">
      <text class="recent-code">{{item.roomCode}}</text>
      <text class="recent-time">{{item.timeText}}</text>
    </view>
  </view>
</view>
```

整段**删除**。

- [ ] **Step 2: 在同一位置加"进行中"区**

```html
<view class="my-rooms" wx:if="{{myRooms.active.length > 0}}">
  <view class="section-title">进行中</view>
  <view class="room-list">
    <view class="room-item active" wx:for="{{myRooms.active}}" wx:key="roomId"
          bind:tap="onTapActive" data-roomid="{{item.roomId}}" data-roomcode="{{item.roomCode}}">
      <text class="code">{{item.roomCode}}</text>
      <text class="meta">{{item.onlineCount}} 人在线</text>
    </view>
  </view>
</view>

<view class="my-rooms" wx:if="{{myRooms.finished.length > 0}}">
  <view class="section-title">已结束</view>
  <view class="room-list">
    <view class="room-item finished" wx:for="{{myRooms.finished}}" wx:key="roomId"
          bind:tap="onTapFinished" data-roomid="{{item.roomId}}">
      <text class="code">{{item.roomCode}}</text>
      <text class="meta">{{item.closedAtText}}</text>
    </view>
  </view>
</view>
```

- [ ] **Step 3: 提交 wxml**

```bash
git add miniprogram/pages/home/index/index.wxml
git commit -m "feat(home): split recent into active/finished sections"
```

---

## Task 11: 改造 home js：调 getMyRooms + 跳转逻辑

**Files:**
- Modify: `miniprogram/pages/home/index/index.js`
- Modify: `miniprogram/pages/home/index/index.wxss`

- [ ] **Step 1: 替换 import**

文件顶部的：

```js
const RECENT_KEY = 'recentRooms';
const RECENT_MAX = 5;
```

和 `_loadRecent / _saveRecent / _addRecent / _formatTime` 这几个函数**整段删除**。

- [ ] **Step 2: 加 getMyRooms 缓存 + 格式化函数**

```js
const MY_ROOMS_CACHE_KEY = 'myRooms';
const MY_ROOMS_CACHE_TTL = 5 * 60 * 1000; // 5 min

function _loadMyRoomsCache() {
  try {
    const raw = wx.getStorageSync(MY_ROOMS_CACHE_KEY);
    if (!raw) return null;
    if (Date.now() - raw.ts > MY_ROOMS_CACHE_TTL) return null;
    return raw.data;
  } catch (e) { return null; }
}

function _saveMyRoomsCache(data) {
  try {
    wx.setStorageSync(MY_ROOMS_CACHE_KEY, { ts: Date.now(), data });
  } catch (e) {}
}

function _formatClosedAt(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
```

- [ ] **Step 3: data 加 myRooms**

```js
data: { loaded: false, myRooms: { active: [], finished: [] }, nickname: '' },
```

- [ ] **Step 4: 替换 onShow**

```js
onShow() {
  this._renderMyRooms();
},

_renderMyRooms() {
  // 1. 先用缓存立即渲染
  const cached = _loadMyRoomsCache();
  if (cached) {
    this.setData({ myRooms: this._decorate(cached) });
  }
  // 2. 异步刷新
  roomService.getMyRooms({ clientId: appStore.clientId })
    .then((res) => {
      if (res.code === 'OK') {
        _saveMyRoomsCache(res.data);
        this.setData({ myRooms: this._decorate(res.data) });
      } else {
        handleError(res, this);
      }
    })
    .catch((err) => handleError(err, this));
},

_decorate(data) {
  return {
    active: data.active || [],
    finished: (data.finished || []).map(r => ({ ...r, closedAtText: _formatClosedAt(r.closedAt) })),
  };
},
```

- [ ] **Step 5: 删掉 onTapRecent / _renderRecent**

- [ ] **Step 6: 加 onTapActive / onTapFinished**

```js
onTapActive(e) {
  const { roomid, roomcode } = e.currentTarget.dataset;
  wx.showLoading({ title: '加入中...' });
  roomService.joinRoom({ roomCode: roomcode, clientId: appStore.clientId, nickname: appStore.nickname, avatarIndex: appStore.avatarIndex || 0 })
    .then((res) => {
      wx.hideLoading();
      if (res.code === 'OK') {
        wx.navigateTo({ url: `/pages/room/index/index?roomId=${res.data.roomId}` });
      } else {
        handleError(res, this);
      }
    })
    .catch((err) => { wx.hideLoading(); handleError(err, this); });
},

onTapFinished(e) {
  const { roomid } = e.currentTarget.dataset;
  wx.navigateTo({ url: `/pages/room/summary/index?roomId=${roomid}&readonly=1` });
},
```

- [ ] **Step 7: 修改 onCreateRoom 也传 clientId**

在 onCreateRoom 中找到：

```js
roomService.createRoom({
  nickname,
  avatarIndex: appStore.avatarIndex || 0,
  clientId: appStore.clientId,
}).then(...)
```

确保 `clientId` 字段已传（应已传；如果没传就加）。

- [ ] **Step 8: 提交**

```bash
git add miniprogram/pages/home/index/
git commit -m "feat(home): fetch and render myRooms (active/finished)"
```

---

## Task 12: 给首页新区域加样式

**Files:**
- Modify: `miniprogram/pages/home/index/index.wxss`

- [ ] **Step 1: 删掉旧 .recent 样式**

删除 `.recent`, `.recent-title`, `.recent-list`, `.recent-item`, `.recent-code`, `.recent-time` 整组。

- [ ] **Step 2: 加 .my-rooms 样式**

```css
.my-rooms { margin: 32rpx 24rpx 0; }
.section-title { font-size: 30rpx; font-weight: 700; color: #333; padding: 16rpx 0; }
.room-list { background: #fff; border-radius: 12rpx; overflow: hidden; }
.room-item { display: flex; align-items: center; padding: 24rpx; border-bottom: 1rpx solid #f0f0f0; }
.room-item:last-child { border-bottom: none; }
.room-item:active { background: #f5f5f5; }
.room-item .code { font-size: 36rpx; font-weight: 700; color: #1aad19; letter-spacing: 2rpx; flex: 1; }
.room-item .meta { font-size: 24rpx; color: #7A7E83; }
.room-item.finished .code { color: #7A7E83; }
```

- [ ] **Step 3: 提交**

```bash
git add miniprogram/pages/home/index/index.wxss
git commit -m "style(home): add my-rooms section styles"
```

---

# M4 — 联调回归（0.5 天）

## Task 13: 手动跑完 4 个端到端流程

- [ ] **Step 1: 流程 A — 退出房间**

- 4 人创建/加入房间
- 各自点几次分（确保有数据）
- 玩家 A 点自己头像 → 弹 player-popup → 点"退出房间" → 确认
- 期望：弹窗消失，回到首页，"进行中"区仍显示该房间
- 玩家 A 再次点"进行中"该房间 → 重入 → 分数仍在

- [ ] **Step 2: 流程 A 续 — 自动关闭**

- 继续上一步：玩家 B、C、D 依次退出房间（每次确认弹窗、回到首页）
- 期望：第 4 个人（D）退出后，该房间从"进行中"区消失，出现在"已结束"区
- 玩家 A 再次点首页 → 应看不到该房间在"进行中" → 看到在"已结束"
- 点"已结束"该房间 → 跳到 summary → 排行榜和 round 历史正确

- [ ] **Step 3: 流程 B — 手动结束**

- 4 人重新创建/加入房间
- 房主 A 点自己头像 → 弹 player-popup → 点"结束本局" → 红色确认
- 期望：跳到 summary 页
- 其他玩家（B/C/D）的页面应自动跳到 summary 或显示"房间已结束"（通过 db.watch 推 status 变更）

- [ ] **Step 4: 流程 C/D — 首页重入**

- 创建新房间，自己一个人
- 退出（此时 B/C/D 都没进，触发自动关）
- 期望：回到首页，看到"已结束"
- 再创建新房间，邀请朋友（模拟），他们也退
- 自己点首页"已结束"该房间 → 跳 summary → 排行榜正确

- [ ] **Step 5: 修复跑通过程中发现的 bug**

每个流程都跑一遍，发现问题立即修。每修一个 bug 单独 commit。

```bash
git commit -m "fix(home/room): <具体描述>"
```

---

## Task 14: 跑回归测试 + 关闭本次迭代

- [ ] **Step 1: 跑 `npm test`**

```bash
cd "c:/Claude Project/微信小程序/majiang"
npm test
```

Expected: 所有现有测试通过（这次没新增单测；如果有改 scoreService 等纯函数需加测试）

- [ ] **Step 2: 跑 `npm run check:banned`**

```bash
npm run check:banned
```

Expected: PASS（敏感词扫描通过）

- [ ] **Step 3: 提交一个 docs 改动（如果需要）**

更新 `docs/launch-checklist.md`，把相关的合规项做手动核查。

- [ ] **Step 4: 关闭 milestone**

在 commit message 里标记：

```bash
git commit --allow-empty -m "chore: M0-M4 done for room-lifecycle feature"
```

或者把这次的几个 commit 整合到 PR / release。

---

## 附录 A：兼容性注意点

1. **老 `players` 没 `isOnline` 字段**：
   - 迁移脚本（Task 1）补 `isOnline: true`
   - 之后所有 `where({isOnline: true})` 查询能正常匹配
   - 极端情况（漏迁）：会查不到老 player，但 4 人新房间不会受影响

2. **老 `rooms` 没 `closedAt/closedBy`**：
   - 默认为 `null`，不影响
   - `getMyRooms` 返回的 `closedAtText` 是空字符串 → 列表里显示空，UI 简单 fallback 即可

3. **MVP 阶段没有 unit test for 云函数**：
   - 本计划靠 Task 13 的手动 E2E 验证
   - 后续可加 `tests/cloud/` 目录用 `wx-server-sdk` mock 测试

## 附录 B：关键文件清单回顾

**新建**（3 个云函数 + 1 个组件）：
- `cloudfunctions/leaveRoom/index.js`
- `cloudfunctions/finishRoom/index.js`
- `cloudfunctions/getMyRooms/index.js`
- `miniprogram/components/player-popup/{wxml,wxss,js,json}`

**修改**（4 个文件 + 1 个新工具）：
- `cloudfunctions/createRoom/index.js`（加 isOnline/lastSeenAt）
- `cloudfunctions/joinRoom/index.js`（支持重入 + 写新字段）
- `miniprogram/utils/constants.js`（加 ROOM_ALREADY_FINISHED）
- `miniprogram/services/roomService.js`（加 leaveRoom / getMyRooms 导出）
- `miniprogram/pages/room/index/{wxml,js}`（去"结束本局"按钮 + 排行榜点击 + self 弹窗）
- `miniprogram/pages/home/index/{wxml,js,wxss}`（拆"进行中"/"已结束"）

## 附录 C：非目标

明确**不做**的事：

- ❌ 撤销结束（已关房间不能重开，需要只能新创）
- ❌ 转让房主（按当前设计，"结束本局"和"退出房间"都不需要房主专权）
- ❌ 多设备同时在线（一个 clientId 只对应一个 wx account）
- ❌ 推送通知（不在本迭代）
- ❌ 排行榜分享到朋友圈（单独 feature）
