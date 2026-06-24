# 房间二维码分享 - 设计文档

**日期：** 2026-06-24
**状态：** 待用户审阅
**作者：** brainstorming + 用户协作

---

## 1. 背景与目标

### 1.1 问题

麻将小程序已上线，房间内玩家目前**只能手动告诉朋友房间号**（6 位数字），对方需要在首页输入才能加入，体验差且容易输错。

### 1.2 目标

为房间页增加**扫码加入**能力：A 在房间内点"分享"按钮 → 显示小程序码 → B 用微信扫码 → 自动打开小程序并加入房间。

### 1.3 成功标准

- A 点分享按钮 → 弹窗**秒开**显示小程序码（无需等待生成）
- B 用另一台手机微信扫码 → 自动进房（除非房间已关 / 已满）
- B 扫码失败时看到**明确的提示**（不是通用 toast）
- 已结束的房间**不保留**小程序码（云存储零孤儿）
- 现有的"右上角转发给朋友"功能**不受影响**

---

## 2. 架构概览

### 2.1 数据流

```
【创建房间时】
A 点"创建房间"
  → cloud.createRoom({...})
      → 创建 rooms 文档（含 qrCodeFileID 字段占位）
      → 创建 players 文档（A 为 owner）
      → qrCodeService.generateRoomQRCode(roomId, roomCode)
          ├── 成功 → 上传云存储 → 写回 rooms.qrCodeFileID
          └── 失败 → qrCodeFileID 保持 undefined（弱一致）
      → 返回 { roomId, roomCode, playerId, ruleId, qrCodeFileID }

A reLaunch 到房间页，_init 捕获 qrCodeFileID 到 data.shareQrCodeFileID

【A 点分享按钮】
A 点"分享" → 弹窗弹出
  → data.shareQrCodeFileID 已有？→ 直接渲染 QR code
  → 为空？→ loading → 调 cloud.getRoomQRCode(roomCode) 懒生成

【B 扫码加入】
B 微信扫码 → 打开小程序 → 落到 /pages/home/index?joinCode=XXX
  → home onLoad 检测 joinCode
  → home._scanJoin(roomCode) → cloud.joinRoom
      ├── 成功 → reLaunch 房间页
      └── 失败 → modal 显示明确提示（优化 UX）

【房间关闭时清理】
autoCloseTimeout 触发关房
  → status = 'finished'
  → qrCodeFileID: _.remove()
  → qrCodeService.cleanupRoomQRCode(fileID)  ← best-effort，失败不影响关房
```

### 2.2 关键决策

| 项 | 决策 | 理由 |
|---|---|---|
| QR 类型 | `wxacode.get`（小程序码） | 微信扫码直接打开小程序，不是普通 QR |
| QR 内容 | `/pages/home/index?joinCode=XXX` | 36 字符，远低于 128 限制 |
| 生成时机 | createRoom 时同步生成（弱一致） | 弹窗永远秒开 |
| 存储 | 云存储 + `rooms.qrCodeFileID` | 跨设备可用，持久化 |
| 失败处理 | 弱一致：createRoom 永远成功，QR 可重试 | QR 是次要功能，不阻塞核心 |
| 原生转发 | 保留在右上角菜单（`onShareAppMessage`） | 已实现，复用 |
| 弹窗按钮 | 只显示 QR + 关闭（无转发按钮 / 无保存按钮） | 用户决策 |
| 清理时机 | autoCloseTimeout 关房时立即清理 | 用户决策 A 方案 |

---

## 3. 数据模型变更

### 3.1 `rooms` 集合

**新增字段：** `qrCodeFileID` (string, optional)

- 类型：`string` (云存储 fileID，如 `cloud://majing-d6gx0f5mm301172e1.xxx/qrcodes/abc.png`)
- 写入时机：createRoom 时通过 `wxacode.get` + `cloud.uploadFile` 生成
- 清除时机：autoCloseTimeout 关房时
- 兼容性：老房间无此字段，视为 `undefined`，fallback 到懒生成路径

**不需要迁移脚本：** 云数据库是 schemaless，老数据天然兼容。

### 3.2 不变更的字段

`players`, `rounds`, `rules` 集合**不受影响**。

---

## 4. 云函数设计

### 4.1 新增：`cloudfunctions/_shared/qrCodeService.js`

封装 QR 码生成、上传、写回的原子流程。所有错误吞掉返回 `null`/void，由调用方决定降级策略。

```js
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

/**
 * 生成房间小程序码（弱一致：失败返回 null，不抛错）
 * @param {string} roomId - room._id
 * @param {string} roomCode - 6 位数字房间号
 * @returns {Promise<string|null>} 云存储 fileID 或 null
 */
async function generateRoomQRCode(roomId, roomCode) {
  try {
    const wxacodeRes = await cloud.openapi.wxacode.get({
      path: `/pages/home/index?joinCode=${roomCode}`,
      width: 430,
    });
    const uploadRes = await cloud.uploadFile({
      cloudPath: `qrcodes/${roomId}.png`,
      fileContent: wxacodeRes.buffer,
    });
    await db.collection('rooms').doc(roomId).update({
      data: { qrCodeFileID: uploadRes.fileID },
    });
    return uploadRes.fileID;
  } catch (err) {
    console.error('generateRoomQRCode failed:', err.message);
    return null;
  }
}

/**
 * 清理房间小程序码（best-effort：失败不抛错）
 * 注意：调用方需自行负责清除 rooms.qrCodeFileID 字段
 * @param {string} qrCodeFileID - 云存储 fileID
 */
async function cleanupRoomQRCode(qrCodeFileID) {
  if (!qrCodeFileID) return;
  try {
    await cloud.deleteFile({ fileList: [qrCodeFileID] });
  } catch (err) {
    console.error('cleanupRoomQRCode failed:', err.message);
    // 不抛错：清理失败不应阻塞主流程
  }
}

module.exports = { generateRoomQRCode, cleanupRoomQRCode };
```

### 4.2 改动：`cloudfunctions/createRoom/index.js`

在第 7 步（更新 `playerIds`）之后、return 之前插入：

```js
// 8. 生成房间小程序码（弱一致：失败不影响 createRoom 成功）
const { generateRoomQRCode } = require('./_shared/qrCodeService');
const qrCodeFileID = await generateRoomQRCode(roomId, roomCode);
// qrCodeFileID 可能为 null（生成失败）—— 此时 rooms.qrCodeFileID 保持 undefined

return {
  code: 'OK',
  data: { roomId, roomCode, playerId: playerRes._id, ruleId, qrCodeFileID },
};
```

**createRoom 总延迟：** ~500ms（房间+玩家）+ ~1s（QR 生成）= **~1.5s**（失败时 ~500ms）。

### 4.3 改动：`cloudfunctions/autoCloseTimeout/index.js`

**两处 status='finished' 之后各加清理逻辑：**

```js
// 分支 A（空房 5 分钟）和分支 B（30 分钟无活动）都改为：
await db.collection('rooms').doc(room._id).update({
  data: {
    status: ROOM_STATUS.FINISHED,
    closedAt: now,
    closedBy: 'auto-empty',  // 或 'auto-timeout'
    qrCodeFileID: _.remove(),  // ← 新增
  },
});

// 异步清理云存储文件（不阻塞关房主流程）
const { cleanupRoomQRCode } = require('./_shared/qrCodeService');
cleanupRoomQRCode(room.qrCodeFileID).catch(err =>
  console.error('QR cleanup background error:', err.message)
);

closed++;
```

### 4.4 新增：`cloudfunctions/getRoomQRCode/index.js`

Fallback 路径（老房间 / 重试场景）+ 单飞防止并发重复生成。

```js
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const { generateRoomQRCode } = require('./_shared/qrCodeService');

// 单飞缓存：同一 roomCode 并发请求复用同一个 Promise
// 注意：云函数实例可能在多 worker 间调度，inflight 是 per-instance（不是全局）
// 极端情况：跨 worker 的并发仍可能重复生成一次 wxacode，可接受
const inflight = new Map(); // roomCode -> Promise<fileID|null>

exports.main = async (event) => {
  const { roomCode } = event;

  if (typeof roomCode !== 'string' || !/^\d{6}$/.test(roomCode)) {
    return { code: 'INVALID_INPUT', message: '房间号格式错误', detail: 'roomCode' };
  }

  const roomRes = await db.collection('rooms').where({ roomCode }).limit(1).get();
  if (roomRes.data.length === 0) {
    return { code: 'ROOM_NOT_FOUND', message: '房间号不存在' };
  }
  const room = roomRes.data[0];

  // 拒绝已结束房间（QR 已无意义）
  if (room.status !== ROOM_STATUS.ACTIVE) {
    return { code: 'ROOM_FINISHED', message: '本局已结束' };
  }

  // 已有 fileID → 直接返回（秒开路径）
  if (room.qrCodeFileID) {
    return { code: 'OK', data: { fileID: room.qrCodeFileID } };
  }

  // 单飞：并发请求共享一次生成
  if (inflight.has(roomCode)) {
    const fileID = await inflight.get(roomCode);
    return fileID
      ? { code: 'OK', data: { fileID } }
      : { code: 'QR_GEN_FAILED', message: '二维码生成失败，请重试' };
  }

  // 首次/重试生成
  const promise = generateRoomQRCode(room._id, roomCode)
    .finally(() => inflight.delete(roomCode));
  inflight.set(roomCode, promise);

  const fileID = await promise;
  return fileID
    ? { code: 'OK', data: { fileID } }
    : { code: 'QR_GEN_FAILED', message: '二维码生成失败，请重试' };
};
```

### 4.5 改动：`cloudfunctions/_shared/constants.js`

`ERR_CODE` 块新增：

```js
QR_GEN_FAILED: 'QR_GEN_FAILED',  // 二维码生成失败（网络/配额）
```

---

## 5. 前端设计

### 5.1 改动：`miniprogram/services/roomService.js`

新增 `getRoomQRCode` 方法：

```js
function getRoomQRCode({ roomCode }) {
  return callFunction('getRoomQRCode', { roomCode });
}

module.exports = { ..., getRoomQRCode };  // 加到 exports
```

### 5.2 改动：`miniprogram/pages/room/index/index.wxml`

**第 5 行** share-btn 改造：

```xml
<!-- 改前 -->
<text class="share-btn" bind:tap="onShareRoom">分享</text>

<!-- 改后 -->
<text class="share-btn" bind:tap="onOpenSharePopup">分享</text>
```

**WXML 末尾**新增分享弹窗：

```xml
<!-- 分享二维码弹窗 -->
<view class="share-popup-mask" wx:if="{{sharePopupVisible}}" catch:tap="onCloseSharePopup">
  <view class="share-popup" catch:tap="noop">
    <view class="share-popup-title">邀请好友加入</view>
    <view class="share-popup-qrcode">
      <image wx:if="{{shareQrCodeFileID}}"
             class="qrcode-img"
             src="{{shareQrCodeFileID}}"
             mode="aspectFit"
             binderror="onQrCodeImageError"></image>
      <view wx:elif="{{shareQrCodeLoading}}" class="qrcode-status">正在生成二维码...</view>
      <view wx:else class="qrcode-failed">
        <view class="qrcode-status">二维码生成失败</view>
        <view class="qrcode-retry-btn" bind:tap="onRetryQRCode">重试</view>
      </view>
    </view>
    <view class="share-popup-room-code">房间号 {{roomCode}}</view>
    <view class="share-popup-hint">朋友扫一扫即可加入</view>
    <view class="share-popup-close-btn" bind:tap="onCloseSharePopup">关闭</view>
  </view>
</view>
```

### 5.3 改动：`miniprogram/pages/room/index/index.wxss`

末尾追加：

```css
/* === 分享二维码弹窗 === */
.share-popup-mask {
  position: fixed; top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex; align-items: center; justify-content: center;
  z-index: 1000;
}
.share-popup {
  width: 560rpx; background: #fff; border-radius: 24rpx;
  padding: 48rpx 32rpx;
  display: flex; flex-direction: column; align-items: center;
}
.share-popup-title {
  font-size: 32rpx; font-weight: 700; color: #0F7A38; margin-bottom: 32rpx;
}
.share-popup-qrcode {
  width: 400rpx; height: 400rpx;
  background: #F5F5F5; border-radius: 12rpx; overflow: hidden;
  display: flex; align-items: center; justify-content: center;
}
.qrcode-img { width: 400rpx; height: 400rpx; }
.qrcode-status { font-size: 26rpx; color: #999; text-align: center; }
.qrcode-failed { display: flex; flex-direction: column; align-items: center; }
.qrcode-retry-btn {
  margin-top: 20rpx; padding: 12rpx 36rpx;
  background: #0F7A38; color: #fff; border-radius: 12rpx; font-size: 26rpx;
}
.share-popup-room-code {
  font-size: 30rpx; color: #333; font-weight: 700;
  letter-spacing: 4rpx; margin-top: 32rpx;
}
.share-popup-hint { font-size: 24rpx; color: #999; margin-top: 8rpx; margin-bottom: 32rpx; }
.share-popup-close-btn {
  width: 100%; height: 80rpx; border-radius: 16rpx; background: #F5F5F5;
  color: #666; display: flex; align-items: center; justify-content: center;
  font-size: 28rpx;
}
```

### 5.4 改动：`miniprogram/pages/room/index/index.js`

**data 增加字段：**

```js
data: {
  ...
  sharePopupVisible: false,
  shareQrCodeFileID: '',
  shareQrCodeLoading: false,
},
```

**`_init` 内捕获 qrCodeFileID**：

```js
this.setData({ shareQrCodeFileID: room.qrCodeFileID || '' });
```

**新增 5 个方法（删除原 `onShareRoom`）：**

```js
onOpenSharePopup() {
  this.setData({ sharePopupVisible: true });
  if (this.data.shareQrCodeFileID) return;  // 秒开路径
  this._loadQRCode();  // fallback 路径
},

_loadQRCode() {
  const roomCode = roomStore.roomCode;
  if (!roomCode) return;
  this.setData({ shareQrCodeLoading: true });
  roomService.getRoomQRCode({ roomCode })
    .then((res) => {
      if (res.code === 'OK' && res.data && res.data.fileID) {
        this.setData({
          shareQrCodeFileID: res.data.fileID,
          shareQrCodeLoading: false,
        });
      } else {
        this.setData({ shareQrCodeLoading: false });
      }
    })
    .catch((err) => {
      console.error('getRoomQRCode error:', err);
      this.setData({ shareQrCodeLoading: false });
      handleError(err, this);
    });
},

onRetryQRCode() {
  this.setData({ shareQrCodeLoading: true });
  this._loadQRCode();
},

onCloseSharePopup() {
  this.setData({ sharePopupVisible: false });
},

onQrCodeImageError() {
  console.warn('QR code image failed to load');
  this.setData({ shareQrCodeFileID: '', shareQrCodeLoading: false });
  this._loadQRCode();
},

noop() {},
```

**删除** 原 `onShareRoom` 方法（旧假分享弹窗）。

### 5.5 改动：`miniprogram/pages/home/index.js`（扫码失败 UX 优化）

**改 `onLoad` 路由：**

```js
onLoad(options) {
  appStore.init();
  this.setData({
    nickname: appStore.nickname,
    avatarIndex: appStore.avatarIndex,
  });
  if (options && options.joinCode) {
    this._scanJoin(options.joinCode);
  }
},
```

**新增 `_scanJoin` 和 `_showScanJoinError`：**

```js
_scanJoin(roomCode) {
  wx.showLoading({ title: '加入中...' });
  roomService.joinRoom({
    roomCode,
    nickname: appStore.nickname || '',
    avatarIndex: appStore.avatarIndex || 0,
    clientId: appStore.clientId,
    nicknameAuto: !appStore.nickname,
  }).then((res) => {
    wx.hideLoading();
    if (res.code === 'OK') {
      wx.reLaunch({ url: `/pages/room/index/index?roomId=${res.data.roomId}` });
    } else {
      this._showScanJoinError(res.code);
    }
  }).catch((err) => {
    wx.hideLoading();
    this._showScanJoinError(err.code);
  });
},

_showScanJoinError(code) {
  const messages = {
    ROOM_FINISHED: '本局已结束，请找朋友重新邀请',
    ROOM_FULL: '房间已满 4 人',
    ROOM_NOT_FOUND: '房间号无效，请找朋友重新邀请',
  };
  wx.showModal({
    title: '无法加入',
    content: messages[code] || '加入失败，请稍后重试',
    showCancel: false,
    confirmText: '我知道了',
  });
},
```

---

## 6. 边缘场景与错误处理

| # | 场景 | 行为 | 状态 |
|---|---|---|---|
| A | 房间正常，A 点分享 | fileID 已知 → 弹窗秒开 | ✅ |
| B | 房间已关（所有人退出），A 仍能分享 | QR 仍显示；B 扫码 → joinRoom 拒 → 弹"本局已结束" | ✅ |
| C | 房间满 4 人 | QR 仍显示；B 扫码 → joinRoom 拒 → 弹"房间已满 4 人" | ✅ |
| D | createRoom 时 wxacode.get 失败 | qrCodeFileID=undefined；A 点分享 → 弹"生成失败" + 重试 | ✅ |
| E | 4 人同时点分享 | 云函数单飞 → 只生成 1 次；其他 3 个复用 Promise | ✅ |
| F | B 之前是该房间玩家（重入） | joinRoom 命中 clientId 重入分支 → isOnline=true | ✅ |
| G | 老房间无 qrCodeFileID | 第一次点分享 → 弹窗 loading → 懒生成 → 写回 db | ✅ |
| H | 网络断开 / 云存储权限问题 | generateRoomQRCode catch → 返回 null → 弹"重试" | ✅ |
| I | wxacode.get 配额超限 | 同 H | ✅ |
| J | A 在弹窗打开时退出房间 | 弹窗照常显示；A 关闭弹窗后房间页触发 onRoomClosed → 跳 summary | ✅ |
| K | QR code 图片加载失败（云存储文件损坏） | image binderror → 回退到 failed 状态 → 自动重试 | ✅ |
| L | 已结束房间被请求生成 QR | getRoomQRCode 检查 status → 返回 ROOM_FINISHED | ✅ |
| M | 关房时 deleteFile 失败 | cleanupRoomQRCode catch → 静默失败；qrCodeFileID 字段已清，不影响后续 | ✅ |

---

## 7. 清理机制

**触发点：** `autoCloseTimeout` 云函数（空房 5 分钟 / 无活动 30 分钟）

**执行流程：**
```
1. status = 'finished'
2. qrCodeFileID: _.remove()           ← 同步，清字段
3. cleanupRoomQRCode(fileID)          ← 异步删文件，best-effort
```

**关键设计：**
- 字段清除在前，文件删除在后 —— 即使文件删除失败，qrCodeFileID 已为 undefined，后续不会再尝试加载
- 文件删除失败不阻塞关房主流程
- `getRoomQRCode` 检查 status，finished 房间直接拒绝，避免给已结束房间生成无意义 QR

---

## 8. 性能估算

| 操作 | 延迟 | 备注 |
|---|---|---|
| 创建房间（含 QR 生成） | ~1.5s | 一次性；失败时 ~500ms |
| 点分享弹窗（fileID 已知） | < 100ms | 秒开 |
| 点分享弹窗（懒生成老房间） | ~1s | loading 态 |
| B 扫码到进房间 | ~500ms | joinRoom + reLaunch |
| 关房清理 | < 200ms | 异步不阻塞 |
| 云存储占用 | ~5KB / 房间 | 关房时清除 |

---

## 9. 测试策略

**单元测试：** 沿用现有约定（ruleService/scoreService 纯算法测试），本次新增功能涉及云函数 + UI，**不加单元测试**。

**手动测试清单（验收必跑）：**

| # | 测试项 | 预期 |
|---|---|---|
| T1 | A 创建房间 → 进房间 → 点分享 | 弹窗秒开显示 QR code |
| T2 | 另一台手机微信扫码 → 自动进房 | 落到房间页看到 A 和自己 |
| T3 | 模拟 QR 生成失败（手动从 DB 删 qrCodeFileID 并屏蔽 wxacode） | 弹"生成失败" + 重试按钮 |
| T4 | 点重试 → 成功 | 显示 QR code |
| T5 | 房间已关（所有人退）后扫码 | B 看到"本局已结束" modal |
| T6 | 房间满 4 人后扫码 | B 看到"房间已满 4 人" modal |
| T7 | 4 个玩家同时点分享 | 4 个弹窗都正常显示，云函数只生成 1 次 |
| T8 | 老房间（DB 删除 qrCodeFileID 字段）→ 点分享 | 弹窗 loading ~1s → 显示 QR code |
| T9 | 网络断开时点分享 | 弹"生成失败" + 重试 |
| T10 | 弹窗打开时退出房间 | 弹窗照常显示，关闭后跳 summary |
| T11 | 关房后查云存储 qrcodes/ | 该房间的 QR 文件已被删除 |
| T12 | 已结束房间被 getRoomQRCode 请求 | 返回 ROOM_FINISHED |
| T13 | QR image binderror（手动破坏云存储文件） | 弹窗自动 fallback 到重试 |
| T14 | 现有"右上角转发给朋友"功能 | 不受影响，回归通过 |

**回归测试：** 确保 `onShareAppMessage`（右上角原生转发）不受影响。

---

## 10. 上线步骤

1. **上传云函数**（按依赖顺序）：
   - `_shared/qrCodeService.js`（首次部署）
   - `_shared/constants.js`（加 `QR_GEN_FAILED`）
   - `createRoom`（更新）
   - `autoCloseTimeout`（更新）
   - `getRoomQRCode`（新）
2. **发布前端代码**
3. **灰度验证**：体验版 / 预览版跑 T1-T14
4. **正式发布**

---

## 11. 文件清单

### 11.1 新建

- `cloudfunctions/_shared/qrCodeService.js`
- `cloudfunctions/getRoomQRCode/index.js`

### 11.2 修改

**云函数：**
- `cloudfunctions/_shared/constants.js`（+1 错误码）
- `cloudfunctions/createRoom/index.js`（+8 行：QR 生成 + 返回值）
- `cloudfunctions/autoCloseTimeout/index.js`（+5 行 × 2：清理钩子）

**前端：**
- `miniprogram/services/roomService.js`（+3 行：getRoomQRCode）
- `miniprogram/pages/room/index/index.js`（+50 行 / -7 行）
- `miniprogram/pages/room/index/index.wxml`（+1 改 / +20 行弹窗）
- `miniprogram/pages/room/index/index.wxss`（+45 行样式）
- `miniprogram/pages/home/index.js`（+25 行扫码 UX）

**总改动：** ~165 行新增，~7 行删除，跨 8 个文件。

---

## 12. 不在范围内（YAGNI）

- ❌ 分享到朋友圈（`onShareTimeline`）—— 单独 feature
- ❌ 二维码加 logo / 自定义样式 —— 微信会拒
- ❌ 二维码保存到相册 —— 用户决策不需要
- ❌ 弹窗内"转发给朋友"按钮 —— 用户决策不需要
- ❌ 定时清理任务 —— A 方案足够，孤儿可忽略
- ❌ QR code 加密 / 短期有效 —— 业务无此需求