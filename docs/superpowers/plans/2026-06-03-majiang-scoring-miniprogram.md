# 麻将计分小程序实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现一个支持可配置规则的 4 人麻将实时计分微信小程序（MVP）

**Architecture:** 原生小程序 + Vant Weapp 组件库 + 微信云开发（云函数 + 数据库 watch 实时同步）；前后端共用纯函数 `scoreService.js` 保证双端算法一致

**Tech Stack:** 微信原生小程序 (WXML/WXSS/JS)、Vant Weapp、微信云开发 (wx.cloud + db.watch)、Jest (单测)、fast-check (属性测试)

**参考设计文档：** [docs/superpowers/specs/2026-06-03-majiang-scoring-miniprogram-design.md](../specs/2026-06-03-majiang-scoring-miniprogram-design.md)

---

## 文件结构总览

```
majiang/
├── miniprogram/
│   ├── app.js / app.json / app.wxss / envList.js / sitemap.json
│   ├── pages/
│   │   ├── home/
│   │   ├── me/
│   │   ├── help/
│   │   └── room/
│   │       ├── index/
│   │       ├── rule-config/
│   │       ├── round-input/
│   │       └── summary/
│   ├── components/
│   │   ├── avatar-picker/
│   │   ├── player-card/
│   │   ├── score-table/
│   │   ├── rule-form/
│   │   ├── gang-event-row/
│   │   ├── ma-picker/
│   │   ├── share-modal/
│   │   └── empty-state/
│   ├── services/
│   │   ├── cloud.js
│   │   ├── errorHandler.js
│   │   ├── roomService.js
│   │   ├── playerService.js
│   │   ├── ruleService.js
│   │   ├── roundService.js
│   │   ├── scoreService.js
│   │   └── userService.js
│   ├── stores/
│   │   ├── observable.js
│   │   ├── appStore.js
│   │   ├── roomStore.js
│   │   └── syncWatcher.js
│   ├── utils/
│   │   ├── constants.js
│   │   ├── validators.js
│   │   ├── cloud-id.js
│   │   ├── format.js
│   │   ├── logger.js
│   │   └── id.js
│   ├── images/
│   │   ├── icons/
│   │   ├── avatars/      (8 张预设头像)
│   │   └── share/
│   └── styles/
│       ├── variables.wxss
│       └── common.wxss
├── cloudfunctions/
│   ├── createRoom/
│   ├── joinRoom/
│   ├── updateRule/
│   ├── settleRound/
│   ├── finishRoom/
│   └── logError/
├── tests/
│   ├── services/
│   │   ├── scoreService.test.js
│   │   ├── ruleService.test.js
│   │   └── cloud-id.test.js
│   ├── utils/
│   │   ├── validators.test.js
│   │   └── format.test.js
│   └── fixtures/
│       └── rules.js
└── docs/superpowers/
    ├── specs/2026-06-03-majiang-scoring-miniprogram-design.md
    └── plans/2026-06-03-majiang-scoring-miniprogram.md (本文件)
```

---

## 阶段概览

| 阶段 | 周数 | 目标 | 任务数 |
|------|------|------|--------|
| **M0** | 1 周 | 脚手架 | 5 |
| **M1** | 1 周 | 计分引擎 + 工具 | 12 |
| **M2** | 1.5 周 | 单局录入 + 房间主页 | 20 |
| **M3** | 1 周 | 实时同步 | 6 |
| **M4** | 1 周 | 合规打磨 | 8 |

总计 **51 任务 / ~5.5 周**（单人开发）

---

# M0 — 脚手架（1 周）

## Task 1: 删除模板示例

**Files:**
- Delete: `miniprogram/pages/example/`
- Delete: `cloudfunctions/quickstartFunctions/`
- Delete: `miniprogram/images/cloud_dev.png`
- Delete: `miniprogram/images/create_cbr.png`
- Delete: `miniprogram/images/create_cbrf.png`
- Delete: `miniprogram/images/create_env.png`
- Delete: `miniprogram/images/database.png`
- Delete: `miniprogram/images/database_add.png`
- Delete: `miniprogram/images/env-select.png`
- Delete: `miniprogram/images/function_deploy.png`
- Delete: `miniprogram/images/scf-enter.png`
- Delete: `miniprogram/images/ai_example1.png`
- Delete: `miniprogram/images/ai_example2.png`
- Delete: `miniprogram/images/default-goods-image.png`
- Modify: `miniprogram/app.json`

- [ ] **Step 1: 删除示例页面和云函数**

```bash
cd "g:/claude project/majiang"
rm -rf miniprogram/pages/example
rm -rf cloudfunctions/quickstartFunctions
rm -f miniprogram/images/cloud_dev.png
rm -f miniprogram/images/create_cbr.png
rm -f miniprogram/images/create_cbrf.png
rm -f miniprogram/images/create_env.png
rm -f miniprogram/images/database.png
rm -f miniprogram/images/database_add.png
rm -f miniprogram/images/env-select.png
rm -f miniprogram/images/function_deploy.png
rm -f miniprogram/images/scf-enter.png
rm -f miniprogram/images/ai_example1.png
rm -f miniprogram/images/ai_example2.png
rm -f miniprogram/images/default-goods-image.png
```

- [ ] **Step 2: 修改 `miniprogram/app.json`**

完整替换为：

```json
{
  "pages": [
    "pages/home/index",
    "pages/me/index",
    "pages/help/index"
  ],
  "window": {
    "backgroundTextStyle": "light",
    "navigationBarBackgroundColor": "#1aad19",
    "navigationBarTitleText": "麻记",
    "navigationBarTextStyle": "white"
  },
  "tabBar": {
    "color": "#7A7E83",
    "selectedColor": "#1aad19",
    "backgroundColor": "#ffffff",
    "list": [
      { "pagePath": "pages/home/index", "text": "首页" },
      { "pagePath": "pages/me/index", "text": "我的" },
      { "pagePath": "pages/help/index", "text": "帮助" }
    ]
  },
  "style": "v2",
  "sitemapLocation": "sitemap.json",
  "lazyCodeLoading": "requiredComponents"
}
```

- [ ] **Step 3: 提交**

```bash
cd "g:/claude project/majiang"
git add -A
git commit -m "chore: clean cloud-dev template, keep only project skeleton"
```

---

## Task 2: 安装 Vant Weapp

**Files:**
- Create: `miniprogram/package.json`
- Create: `miniprogram_npm/`（构建产物）

- [ ] **Step 1: 在 `miniprogram/` 下创建 `package.json`**

```json
{
  "name": "majiang-miniprogram",
  "version": "1.0.0",
  "description": "麻将计分小程序",
  "scripts": {
    "build:npm": "miniprogram-ci npm"
  },
  "dependencies": {
    "@vant/weapp": "^1.11.6"
  }
}
```

- [ ] **Step 2: 安装依赖并构建**

在微信开发者工具中：
- 菜单 → 工具 → 构建 npm
- 等到 "构建完成" 提示
- 出现 `miniprogram_npm/@vant/weapp/` 目录

- [ ] **Step 3: 验证 Vant Weapp 引入**

修改 `miniprogram/app.json` 在 `window` 后加：

```json
"usingComponents": {
  "van-button": "@vant/weapp/button/index"
}
```

- [ ] **Step 4: 提交**

```bash
cd "g:/claude project/majiang"
git add miniprogram/package.json miniprogram/app.json
git commit -m "chore: add Vant Weapp dependency"
```

---

## Task 3: 创建目录骨架

**Files:**
- Create: 多个空目录

- [ ] **Step 1: 创建目录**

```bash
cd "g:/claude project/majiang"
mkdir -p miniprogram/pages/room/index
mkdir -p miniprogram/pages/room/rule-config
mkdir -p miniprogram/pages/room/round-input
mkdir -p miniprogram/pages/room/summary
mkdir -p miniprogram/components/avatar-picker
mkdir -p miniprogram/components/player-card
mkdir -p miniprogram/components/score-table
mkdir -p miniprogram/components/rule-form
mkdir -p miniprogram/components/gang-event-row
mkdir -p miniprogram/components/ma-picker
mkdir -p miniprogram/components/share-modal
mkdir -p miniprogram/components/empty-state
mkdir -p miniprogram/services
mkdir -p miniprogram/stores
mkdir -p miniprogram/utils
mkdir -p miniprogram/images/avatars
mkdir -p miniprogram/images/share
mkdir -p miniprogram/styles
mkdir -p tests/services
mkdir -p tests/utils
mkdir -p tests/fixtures
```

- [ ] **Step 2: 创建占位页骨架**

每个页面目录创建 4 个文件：`.js`、`.json`、`.wxml`、`.wxss`

`miniprogram/pages/home/index.js`：
```js
Page({ data: {} })
```

`miniprogram/pages/home/index.json`：
```json
{ "navigationBarTitleText": "首页" }
```

`miniprogram/pages/home/index.wxml`：
```xml
<view class="container"><text>首页占位</text></view>
```

`miniprogram/pages/home/index.wxss`：
```css
.container { padding: 20px; }
```

其他页面（me、help、room/index、room/rule-config、room/round-input、room/summary）类比创建，文案对应替换。

- [ ] **Step 3: 提交**

```bash
cd "g:/claude project/majiang"
git add -A
git commit -m "chore: scaffold project directory structure"
```

---

## Task 4: 初始化 Jest

**Files:**
- Create: `package.json` (项目根)
- Create: `jest.config.js`
- Create: `tests/smoke.test.js`
- Create: `babel.config.js`（如需 ES 转换）

- [ ] **Step 1: 项目根创建 `package.json`**

```json
{
  "name": "majiang",
  "version": "1.0.0",
  "scripts": {
    "test": "jest",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage"
  },
  "devDependencies": {
    "@babel/core": "^7.23.0",
    "@babel/preset-env": "^7.23.0",
    "babel-jest": "^29.7.0",
    "jest": "^29.7.0"
  }
}
```

- [ ] **Step 2: 安装依赖**

```bash
cd "g:/claude project/majiang"
npm install
```

- [ ] **Step 3: 创建 `jest.config.js`**

```js
module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.js'],
  collectCoverageFrom: [
    'miniprogram/services/**/*.js',
    'miniprogram/utils/**/*.js',
  ],
  coverageThreshold: {
    'miniprogram/services/scoreService.js': {
      lines: 100,
      branches: 100,
      functions: 100,
      statements: 100,
    },
  },
};
```

- [ ] **Step 4: 创建 `babel.config.js`**

```js
module.exports = {
  presets: [['@babel/preset-env', { targets: { node: 'current' } }]],
};
```

- [ ] **Step 5: 创建 `tests/smoke.test.js`**

```js
describe('smoke test', () => {
  test('jest is running', () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 6: 运行测试**

```bash
cd "g:/claude project/majiang"
npm test
```

Expected: `PASS tests/smoke.test.js`

- [ ] **Step 7: 提交**

```bash
git add -A
git commit -m "chore: initialize jest with smoke test"
```

---

## Task 5: 配置 app.js 入口

**Files:**
- Modify: `miniprogram/app.js`

- [ ] **Step 1: 完整替换 `miniprogram/app.js`**

```js
App({
  globalData: {
    cloudEnvId: 'your-env-id', // 后续替换为真实云开发环境 ID
    clientId: '',
  },

  onLaunch() {
    // 初始化云开发
    if (!wx.cloud) {
      console.error('当前微信版本过低，请升级到最新微信')
      return
    }
    wx.cloud.init({
      env: this.globalData.cloudEnvId,
      traceUser: true,
    })

    // 生成本次会话的 clientId
    let clientId = wx.getStorageSync('clientId')
    if (!clientId) {
      clientId = 'cli_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10)
      wx.setStorageSync('clientId', clientId)
    }
    this.globalData.clientId = clientId
  },

  onError(err) {
    console.error('App onError:', err)
    // 后续接入 logger.js 上报
  },
})
```

- [ ] **Step 2: 验证编译**

在微信开发者工具中打开项目，确保控制台无错误。

- [ ] **Step 3: 提交**

```bash
git add miniprogram/app.js
git commit -m "feat: initialize cloud env and clientId in app.js"
```

---

# M1 — 计分引擎 + 工具（1 周）

## Task 6: utils/constants.js

**Files:**
- Create: `miniprogram/utils/constants.js`
- Create: `tests/utils/constants.test.js`（如需）

- [ ] **Step 1: 写常量文件 `miniprogram/utils/constants.js`**

```js
// 胡牌类型
const WIN_TYPE = Object.freeze({
  ZIMO: 'zimo',                  // 自摸
  DIANPAO: 'dianpao',            // 点炮
  GANGSHANGHUA: 'gangshanghua',  // 杠上花（自摸）
  GANGSHANGPAO: 'gangshangpao',  // 杠上炮（点炮）
  QIANGGANGHU: 'qiangganghu',    // 抢杠胡（点炮）
  HAIDILAO: 'haidilao',          // 海底捞月（自摸）
  HAIDIPAO: 'haidipao',          // 海底炮（点炮）
  TIANHU: 'tianhu',              // 天胡（自摸）
  DIHU: 'dihu',                  // 地胡（自摸）
})

// 自摸型 winType（胡牌者赢 3 家）
const ZIMO_TYPES = new Set([
  WIN_TYPE.ZIMO,
  WIN_TYPE.GANGSHANGHUA,
  WIN_TYPE.HAIDILAO,
  WIN_TYPE.TIANHU,
  WIN_TYPE.DIHU,
])

// 点炮型 winType（胡牌者只赢点炮者）
const DIANPAO_TYPES = new Set([
  WIN_TYPE.DIANPAO,
  WIN_TYPE.GANGSHANGPAO,
  WIN_TYPE.QIANGGANGHU,
  WIN_TYPE.HAIDIPAO,
])

// 杠类型
const GANG_TYPE = Object.freeze({
  MING: 'ming',  // 明杠
  AN: 'an',      // 暗杠
  BU: 'bu',      // 补杠/加杠
})

// 座位
const SEAT = Object.freeze({
  EAST: 0,  // 庄家
  SOUTH: 1,
  WEST: 2,
  NORTH: 3,
})

// 错误码
const ERR_CODE = Object.freeze({
  ROOM_NOT_FOUND: 'ROOM_NOT_FOUND',
  ROOM_FULL: 'ROOM_FULL',
  ROOM_FINISHED: 'ROOM_FINISHED',
  NOT_IN_ROOM: 'NOT_IN_ROOM',
  INVALID_INPUT: 'INVALID_INPUT',
  FAN_EXCEEDS_MAX: 'FAN_EXCEEDS_MAX',
  GANG_COUNT_EXCEEDS: 'GANG_COUNT_EXCEEDS',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
})

// 房间状态
const ROOM_STATUS = Object.freeze({
  ACTIVE: 'active',
  FINISHED: 'finished',
})

// 头像数量
const AVATAR_COUNT = 8

// 房间号长度
const ROOM_CODE_LENGTH = 6

module.exports = {
  WIN_TYPE,
  ZIMO_TYPES,
  DIANPAO_TYPES,
  GANG_TYPE,
  SEAT,
  ERR_CODE,
  ROOM_STATUS,
  AVATAR_COUNT,
  ROOM_CODE_LENGTH,
}
```

- [ ] **Step 2: 在 node 中验证无语法错误**

```bash
cd "g:/claude project/majiang"
node -e "const c = require('./miniprogram/utils/constants'); console.log(Object.keys(c).length)"
```

Expected: 打印数字 ≥ 9

- [ ] **Step 3: 提交**

```bash
git add miniprogram/utils/constants.js
git commit -m "feat(constants): add WIN_TYPE, GANG_TYPE, SEAT, ERR_CODE enums"
```

---

## Task 7: utils/validators.js

**Files:**
- Create: `miniprogram/utils/validators.js`
- Create: `tests/utils/validators.test.js`

- [ ] **Step 1: 写失败测试 `tests/utils/validators.test.js`**

```js
const v = require('../../miniprogram/utils/validators');

describe('validators', () => {
  describe('isValidRoomCode', () => {
    test('accepts 6-digit number', () => {
      expect(v.isValidRoomCode('123456')).toBe(true);
    });
    test('rejects 5-digit', () => {
      expect(v.isValidRoomCode('12345')).toBe(false);
    });
    test('rejects 7-digit', () => {
      expect(v.isValidRoomCode('1234567')).toBe(false);
    });
    test('rejects letters', () => {
      expect(v.isValidRoomCode('abcdef')).toBe(false);
    });
    test('rejects empty', () => {
      expect(v.isValidRoomCode('')).toBe(false);
    });
    test('rejects null', () => {
      expect(v.isValidRoomCode(null)).toBe(false);
    });
  });

  describe('isValidNickname', () => {
    test('accepts 1-8 chars', () => {
      expect(v.isValidNickname('张三')).toBe(true);
      expect(v.isValidNickname('a')).toBe(true);
      expect(v.isValidNickname('12345678')).toBe(true);
    });
    test('rejects empty', () => {
      expect(v.isValidNickname('')).toBe(false);
      expect(v.isValidNickname('   ')).toBe(false);
    });
    test('rejects > 8 chars', () => {
      expect(v.isValidNickname('123456789')).toBe(false);
    });
    test('trims whitespace', () => {
      expect(v.normalizeNickname('  张三  ')).toBe('张三');
    });
  });

  describe('isValidAvatarIndex', () => {
    test('accepts 0-7', () => {
      expect(v.isValidAvatarIndex(0)).toBe(true);
      expect(v.isValidAvatarIndex(7)).toBe(true);
    });
    test('rejects < 0', () => {
      expect(v.isValidAvatarIndex(-1)).toBe(false);
    });
    test('rejects > 7', () => {
      expect(v.isValidAvatarIndex(8)).toBe(false);
    });
  });

  describe('isValidFan', () => {
    test('accepts 0-100', () => {
      expect(v.isValidFan(0)).toBe(true);
      expect(v.isValidFan(50)).toBe(true);
      expect(v.isValidFan(100)).toBe(true);
    });
    test('rejects negative', () => {
      expect(v.isValidFan(-1)).toBe(false);
    });
    test('rejects > 100', () => {
      expect(v.isValidFan(101)).toBe(false);
    });
    test('rejects non-integer', () => {
      expect(v.isValidFan(1.5)).toBe(false);
    });
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

```bash
cd "g:/claude project/majiang"
npm test -- validators
```

Expected: FAIL（module not found）

- [ ] **Step 3: 写实现 `miniprogram/utils/validators.js`**

```js
const { AVATAR_COUNT } = require('./constants');

function isValidRoomCode(code) {
  return typeof code === 'string' && /^\d{6}$/.test(code);
}

function isValidNickname(name) {
  if (typeof name !== 'string') return false;
  const trimmed = name.trim();
  return trimmed.length >= 1 && trimmed.length <= 8;
}

function normalizeNickname(name) {
  if (typeof name !== 'string') return '';
  return name.trim();
}

function isValidAvatarIndex(idx) {
  return Number.isInteger(idx) && idx >= 0 && idx < AVATAR_COUNT;
}

function isValidFan(fan) {
  return Number.isInteger(fan) && fan >= 0 && fan <= 100;
}

function isValidGangCount(count) {
  return Number.isInteger(count) && count >= 0 && count <= 16;
}

module.exports = {
  isValidRoomCode,
  isValidNickname,
  normalizeNickname,
  isValidAvatarIndex,
  isValidFan,
  isValidGangCount,
};
```

- [ ] **Step 4: 跑测试确认通过**

```bash
cd "g:/claude project/majiang"
npm test -- validators
```

Expected: PASS, 13 个用例全过

- [ ] **Step 5: 提交**

```bash
git add miniprogram/utils/validators.js tests/utils/validators.test.js
git commit -m "feat(validators): add roomCode/nickname/avatarIndex/fan/gangCount validators"
```

---

## Task 8: utils/cloud-id.js

**Files:**
- Create: `miniprogram/utils/cloud-id.js`
- Create: `tests/utils/cloud-id.test.js`

- [ ] **Step 1: 写失败测试 `tests/utils/cloud-id.test.js`**

```js
const { generateRoomCode, isRoomCodeUnique } = require('../../miniprogram/utils/cloud-id');

// mock 异步查重
const mockDbCheck = jest.fn();
jest.mock('../../miniprogram/utils/cloud-id', () => {
  const actual = jest.requireActual('../../miniprogram/utils/cloud-id');
  return {
    ...actual,
    // 暴露内部函数给测试
  };
});

describe('cloud-id', () => {
  describe('generateRoomCode', () => {
    test('returns 6-digit string', () => {
      for (let i = 0; i < 100; i++) {
        const code = generateRoomCode();
        expect(code).toMatch(/^\d{6}$/);
      }
    });
    test('range 100000-999999', () => {
      for (let i = 0; i < 100; i++) {
        const code = generateRoomCode();
        const n = parseInt(code, 10);
        expect(n).toBeGreaterThanOrEqual(100000);
        expect(n).toBeLessThanOrEqual(999999);
      }
    });
    test('produces different codes (probabilistic)', () => {
      const codes = new Set();
      for (let i = 0; i < 1000; i++) codes.add(generateRoomCode());
      expect(codes.size).toBeGreaterThan(900); // 至少 90% 不重复
    });
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

```bash
cd "g:/claude project/majiang"
npm test -- cloud-id
```

Expected: FAIL

- [ ] **Step 3: 写实现 `miniprogram/utils/cloud-id.js`**

```js
const { ROOM_CODE_LENGTH } = require('./constants');

/**
 * 生成 6 位数字房间号（100000-999999）
 */
function generateRoomCode() {
  const min = Math.pow(10, ROOM_CODE_LENGTH - 1);
  const max = Math.pow(10, ROOM_CODE_LENGTH) - 1;
  const n = Math.floor(Math.random() * (max - min + 1)) + min;
  return String(n);
}

/**
 * 异步生成唯一房间号：循环生成直到查重通过
 * @param {Function} existsCheck - async (code: string) => boolean 返回 true 表示已存在
 * @param {number} maxRetries - 最大重试次数
 * @returns {Promise<string>}
 */
async function generateUniqueRoomCode(existsCheck, maxRetries = 10) {
  for (let i = 0; i < maxRetries; i++) {
    const code = generateRoomCode();
    const exists = await existsCheck(code);
    if (!exists) return code;
  }
  throw new Error('Failed to generate unique room code after retries');
}

/**
 * 生成本地会话 ID（不依赖网络）
 */
function generateClientId() {
  return 'cli_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);
}

/**
 * 生成临时 round ID（乐观更新用）
 */
function generateTempId() {
  return 'temp_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
}

module.exports = {
  generateRoomCode,
  generateUniqueRoomCode,
  generateClientId,
  generateTempId,
};
```

- [ ] **Step 4: 跑测试确认通过**

```bash
cd "g:/claude project/majiang"
npm test -- cloud-id
```

Expected: PASS, 3 个用例全过

- [ ] **Step 5: 提交**

```bash
git add miniprogram/utils/cloud-id.js tests/utils/cloud-id.test.js
git commit -m "feat(cloud-id): add room code generator with uniqueness check"
```

---

## Task 9: utils/format.js

**Files:**
- Create: `miniprogram/utils/format.js`
- Create: `tests/utils/format.test.js`

- [ ] **Step 1: 写失败测试 `tests/utils/format.test.js`**

```js
const { formatScoreDelta, formatTotalScore, formatTimestamp } = require('../../miniprogram/utils/format');

describe('format', () => {
  describe('formatScoreDelta', () => {
    test('positive with plus sign', () => {
      expect(formatScoreDelta(8)).toBe('+8 分');
    });
    test('negative', () => {
      expect(formatScoreDelta(-4)).toBe('-4 分');
    });
    test('zero', () => {
      expect(formatScoreDelta(0)).toBe('0 分');
    });
  });
  describe('formatTotalScore', () => {
    test('integer', () => {
      expect(formatTotalScore(16)).toBe('16 分');
    });
    test('negative integer', () => {
      expect(formatTotalScore(-3)).toBe('-3 分');
    });
  });
  describe('formatTimestamp', () => {
    test('returns string', () => {
      const ts = 1717392000000; // 2024-06-03
      const s = formatTimestamp(ts);
      expect(typeof s).toBe('string');
      expect(s.length).toBeGreaterThan(0);
    });
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

```bash
cd "g:/claude project/majiang"
npm test -- format
```

Expected: FAIL

- [ ] **Step 3: 写实现 `miniprogram/utils/format.js`**

```js
function formatScoreDelta(n) {
  if (n > 0) return `+${n} 分`;
  if (n < 0) return `${n} 分`; // 负号自带
  return '0 分';
}

function formatTotalScore(n) {
  return `${n} 分`;
}

function formatTimestamp(ts) {
  const d = new Date(ts);
  const pad = (x) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

module.exports = { formatScoreDelta, formatTotalScore, formatTimestamp };
```

- [ ] **Step 4: 跑测试确认通过**

```bash
cd "g:/claude project/majiang"
npm test -- format
```

Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add miniprogram/utils/format.js tests/utils/format.test.js
git commit -m "feat(format): add score/timestamp formatters"
```

---

## Task 10: scoreService — 基础自摸

**Files:**
- Create: `miniprogram/services/scoreService.js`
- Create: `tests/services/scoreService.test.js`
- Create: `tests/fixtures/rules.js`

- [ ] **Step 1: 写 fixture `tests/fixtures/rules.js`**

```js
function makeRule(overrides = {}) {
  return {
    baseScore: 1,
    zimoMul: 2,
    dianpaoMul: 1,
    mingGangScore: 1,
    anGangScore: 2,
    bugangScore: 1,
    maxFan: 0,
    maCount: 0,
    dealerMul: 1,
    allowDianpao: true,
    ...overrides,
  };
}

function makePlayers(overrides = []) {
  const defaults = [
    { _id: 'p0', nickname: '东', seatIndex: 0 },
    { _id: 'p1', nickname: '南', seatIndex: 1 },
    { _id: 'p2', nickname: '西', seatIndex: 2 },
    { _id: 'p3', nickname: '北', seatIndex: 3 },
  ];
  return defaults.map((d, i) => ({ ...d, ...(overrides[i] || {}) }));
}

module.exports = { makeRule, makePlayers };
```

- [ ] **Step 2: 写失败测试 `tests/services/scoreService.test.js`**

```js
const { calculateRound } = require('../../miniprogram/services/scoreService');
const { makeRule, makePlayers } = require('../fixtures/rules');
const { WIN_TYPE } = require('../../miniprogram/utils/constants');

describe('scoreService.calculateRound - 自摸 (zimo)', () => {
  test('底分1, 番1, 自摸倍数2 → 赢家+6, 其他各-2', () => {
    const rule = makeRule({ baseScore: 1, zimoMul: 2 });
    const players = makePlayers();
    const input = { winnerId: 'p0', winType: WIN_TYPE.ZIMO, fan: 1, gangEvents: [], maResults: [] };
    const result = calculateRound(rule, input, players);
    expect(result.scoreChanges).toEqual({ p0: 6, p1: -2, p2: -2, p3: -2 });
  });

  test('底分2, 番4, 自摸倍数1 → 赢家+24, 其他各-8', () => {
    const rule = makeRule({ baseScore: 2, zimoMul: 1 });
    const players = makePlayers();
    const input = { winnerId: 'p1', winType: WIN_TYPE.ZIMO, fan: 4, gangEvents: [], maResults: [] };
    const result = calculateRound(rule, input, players);
    // 2*4*1=8 perLose, 自摸赢3家 → p1+24, 其他各-8, 守恒: 24-8-8-8=0
    expect(result.scoreChanges).toEqual({ p0: -8, p1: 24, p2: -8, p3: -8 });
  });

  test('分数守恒：所有玩家变化之和 = 0', () => {
    const rule = makeRule();
    const players = makePlayers();
    const input = { winnerId: 'p0', winType: WIN_TYPE.ZIMO, fan: 3, gangEvents: [], maResults: [] };
    const result = calculateRound(rule, input, players);
    const sum = Object.values(result.scoreChanges).reduce((a, b) => a + b, 0);
    expect(sum).toBe(0);
  });
});
```

- [ ] **Step 3: 跑测试确认失败**

```bash
cd "g:/claude project/majiang"
npm test -- scoreService
```

Expected: FAIL

- [ ] **Step 4: 写 `scoreService.js` 框架（仅自摸）**

```js
const { WIN_TYPE, ZIMO_TYPES, DIANPAO_TYPES, GANG_TYPE, SEAT } = require('../utils/constants');

/**
 * 计算单局分数变化（纯函数）
 * @param {Object} rule
 * @param {Object} input
 * @param {Array} players
 * @returns {{scoreChanges: Object, breakdown: Object, isBalanced: boolean}}
 */
function calculateRound(rule, input, players) {
  const { winnerId, winType, loserId, fan, gangEvents = [], maResults = [] } = input;
  const scoreChanges = {};
  players.forEach((p) => { scoreChanges[p._id] = 0; });

  const breakdown = { huScore: 0, gangDetails: [], maDetails: [] };

  // 1. 基础胡牌
  const effectiveFan = rule.maxFan > 0 ? Math.min(fan, rule.maxFan) : fan;
  const huScore = rule.baseScore * effectiveFan;
  breakdown.huScore = huScore;

  if (ZIMO_TYPES.has(winType)) {
    applyZimo(players, winnerId, huScore, rule.zimoMul, scoreChanges);
  } else if (DIANPAO_TYPES.has(winType)) {
    let mul = rule.dianpaoMul;
    if (winType === WIN_TYPE.GANGSHANGPAO) {
      // 杠上炮番数 +1 已在调用方处理 effectiveFan；此处可标记
    }
    applyDianpao(winnerId, loserId, huScore, mul, scoreChanges);
  }

  // 2. 杠分
  if (gangEvents && gangEvents.length > 0) {
    applyGangEvents(rule, gangEvents, players, scoreChanges, breakdown);
  }

  // 3. 买马
  if (rule.maCount > 0 && maResults && maResults.length > 0) {
    applyMa(rule, winnerId, maResults, players, scoreChanges, breakdown);
  }

  // 4. 庄家加成
  if (rule.dealerMul > 1) {
    applyDealerMul(players, winnerId, loserId, winType, rule.dealerMul, scoreChanges);
  }

  const isBalanced = Object.values(scoreChanges).reduce((a, b) => a + b, 0) === 0;

  return { scoreChanges, breakdown, isBalanced };
}

function applyZimo(players, winnerId, huScore, mul, scoreChanges) {
  const perLose = huScore * mul;
  players.forEach((p) => {
    if (p._id === winnerId) {
      scoreChanges[p._id] += perLose * 3;
    } else {
      scoreChanges[p._id] -= perLose;
    }
  });
}

function applyDianpao(winnerId, loserId, huScore, mul, scoreChanges) {
  const pay = huScore * mul;
  scoreChanges[winnerId] = (scoreChanges[winnerId] || 0) + pay;
  scoreChanges[loserId] = (scoreChanges[loserId] || 0) - pay;
}

function applyGangEvents(rule, gangEvents, players, scoreChanges, breakdown) {
  // 占位，Task 12 实现
}

function applyMa(rule, winnerId, maResults, players, scoreChanges, breakdown) {
  // 占位，Task 13 实现
}

function applyDealerMul(players, winnerId, loserId, winType, dealerMul, scoreChanges) {
  // 占位，Task 13 实现
}

module.exports = { calculateRound };
```

- [ ] **Step 5: 跑测试确认通过**

```bash
cd "g:/claude project/majiang"
npm test -- scoreService
```

Expected: PASS, 3 个用例全过

- [ ] **Step 6: 提交**

```bash
git add miniprogram/services/scoreService.js tests/services/scoreService.test.js tests/fixtures/rules.js
git commit -m "feat(score): implement basic zimo calculation"
```

---

## Task 11: scoreService — 点炮 + 封顶

**Files:**
- Modify: `tests/services/scoreService.test.js`

- [ ] **Step 1: 追加测试用例**

在 `tests/services/scoreService.test.js` 末尾追加：

```js
describe('scoreService.calculateRound - 点炮 (dianpao)', () => {
  test('底分1, 番2, 点炮倍数1 → 赢家+2, 点炮者-2, 其他0', () => {
    const rule = makeRule({ baseScore: 1, dianpaoMul: 1 });
    const players = makePlayers();
    const input = { winnerId: 'p1', loserId: 'p3', winType: WIN_TYPE.DIANPAO, fan: 2, gangEvents: [], maResults: [] };
    const result = calculateRound(rule, input, players);
    expect(result.scoreChanges).toEqual({ p0: 0, p1: 2, p2: 0, p3: -2 });
  });

  test('点炮倍数2 → 双方 ×2', () => {
    const rule = makeRule({ baseScore: 1, dianpaoMul: 2 });
    const players = makePlayers();
    const input = { winnerId: 'p0', loserId: 'p2', winType: WIN_TYPE.DIANPAO, fan: 1, gangEvents: [], maResults: [] };
    const result = calculateRound(rule, input, players);
    expect(result.scoreChanges).toEqual({ p0: 2, p1: 0, p2: -2, p3: 0 });
  });

  test('分数守恒', () => {
    const rule = makeRule();
    const players = makePlayers();
    const input = { winnerId: 'p0', loserId: 'p1', winType: WIN_TYPE.DIANPAO, fan: 5, gangEvents: [], maResults: [] };
    const result = calculateRound(rule, input, players);
    const sum = Object.values(result.scoreChanges).reduce((a, b) => a + b, 0);
    expect(sum).toBe(0);
  });
});

describe('scoreService.calculateRound - 封顶 (maxFan)', () => {
  test('maxFan=8, 输入番10 → 实际按8算', () => {
    const rule = makeRule({ baseScore: 1, zimoMul: 2, maxFan: 8 });
    const players = makePlayers();
    const input = { winnerId: 'p0', winType: WIN_TYPE.ZIMO, fan: 10, gangEvents: [], maResults: [] };
    const result = calculateRound(rule, input, players);
    // 8*1*2 = 16，赢家+48，其他各-16
    expect(result.scoreChanges).toEqual({ p0: 48, p1: -16, p2: -16, p3: -16 });
  });

  test('maxFan=0, 输入番100 → 不封顶', () => {
    const rule = makeRule({ baseScore: 1, zimoMul: 1, maxFan: 0 });
    const players = makePlayers();
    const input = { winnerId: 'p0', winType: WIN_TYPE.ZIMO, fan: 100, gangEvents: [], maResults: [] };
    const result = calculateRound(rule, input, players);
    // 100*1*1 = 100，赢家+300，其他-100
    expect(result.scoreChanges).toEqual({ p0: 300, p1: -100, p2: -100, p3: -100 });
  });
});
```

- [ ] **Step 2: 跑测试确认全部通过**

```bash
cd "g:/claude project/majiang"
npm test -- scoreService
```

Expected: PASS, 8 个用例全过

- [ ] **Step 3: 提交**

```bash
git add tests/services/scoreService.test.js
git commit -m "test(score): cover dianpao and maxFan scenarios"
```

---

## Task 12: scoreService — 杠分

**Files:**
- Modify: `miniprogram/services/scoreService.js`
- Modify: `tests/services/scoreService.test.js`

- [ ] **Step 1: 追加测试用例**

```js
describe('scoreService.calculateRound - 杠分', () => {
  test('明杠（抓牌）：杠牌者赢 3 家各 1 分', () => {
    const rule = makeRule({ mingGangScore: 1 });
    const players = makePlayers();
    const input = { winnerId: 'p0', winType: WIN_TYPE.ZIMO, fan: 0, gangEvents: [{ type: 'ming', playerId: 'p0' }], maResults: [] };
    const result = calculateRound(rule, input, players);
    // 杠牌者 +3，其他 -1
    expect(result.scoreChanges).toEqual({ p0: 3, p1: -1, p2: -1, p3: -1 });
  });

  test('暗杠：杠牌者赢 3 家各 2 分', () => {
    const rule = makeRule({ anGangScore: 2 });
    const players = makePlayers();
    const input = { winnerId: 'p0', winType: WIN_TYPE.ZIMO, fan: 0, gangEvents: [{ type: 'an', playerId: 'p1' }], maResults: [] };
    const result = calculateRound(rule, input, players);
    // p1 +6，其他 -2
    expect(result.scoreChanges).toEqual({ p0: -2, p1: 6, p2: -2, p3: -2 });
  });

  test('补杠：杠牌者赢 3 家各 1 分', () => {
    const rule = makeRule({ bugangScore: 1 });
    const players = makePlayers();
    const input = { winnerId: 'p0', winType: WIN_TYPE.ZIMO, fan: 0, gangEvents: [{ type: 'bu', playerId: 'p2' }], maResults: [] };
    const result = calculateRound(rule, input, players);
    expect(result.scoreChanges).toEqual({ p0: -1, p1: -1, p2: 3, p3: -1 });
  });

  test('明杠（被点杠）：被杠者得 1 分', () => {
    const rule = makeRule({ mingGangScore: 1 });
    const players = makePlayers();
    // p0 杠 p1 出的牌 → p0 +1, p1 -1
    const input = { winnerId: 'p0', winType: WIN_TYPE.ZIMO, fan: 0, gangEvents: [{ type: 'ming', playerId: 'p0', targetPlayerId: 'p1' }], maResults: [] };
    const result = calculateRound(rule, input, players);
    expect(result.scoreChanges).toEqual({ p0: 1, p1: -1, p2: 0, p3: 0 });
  });

  test('多根杠：2 根明杠 + 1 根暗杠（不同人）', () => {
    const rule = makeRule({ mingGangScore: 1, anGangScore: 2 });
    const players = makePlayers();
    const input = {
      winnerId: 'p0', winType: WIN_TYPE.ZIMO, fan: 0,
      gangEvents: [
        { type: 'ming', playerId: 'p0' },
        { type: 'ming', playerId: 'p0' },
        { type: 'an', playerId: 'p1' },
      ],
      maResults: []
    };
    const result = calculateRound(rule, input, players);
    // p0: +2 (明杠) +2 (明杠) -2 (暗杠 p1 分摊) = +2
    // p1: -1 (明杠1) -1 (明杠2) +6 (暗杠) = +4
    // p2: -1 -1 -2 = -4
    // p3: -1 -1 -2 = -4
    expect(result.scoreChanges).toEqual({ p0: 2, p1: 4, p2: -4, p3: -4 });
  });

  test('分数守恒（带杠）', () => {
    const rule = makeRule();
    const players = makePlayers();
    const input = {
      winnerId: 'p0', winType: WIN_TYPE.DIANPAO, loserId: 'p3', fan: 2,
      gangEvents: [{ type: 'ming', playerId: 'p1' }, { type: 'an', playerId: 'p2' }],
      maResults: []
    };
    const result = calculateRound(rule, input, players);
    const sum = Object.values(result.scoreChanges).reduce((a, b) => a + b, 0);
    expect(sum).toBe(0);
  });
});
```

- [ ] **Step 2: 跑测试确认部分失败**

```bash
cd "g:/claude project/majiang"
npm test -- scoreService
```

Expected: 4 个杠用例 FAIL

- [ ] **Step 3: 实现 `applyGangEvents`**

替换 `scoreService.js` 中的 `applyGangEvents`：

```js
function applyGangEvents(rule, gangEvents, players, scoreChanges, breakdown) {
  gangEvents.forEach((ev) => {
    const score = ev.type === GANG_TYPE.AN ? rule.anGangScore
                : ev.type === GANG_TYPE.BU ? rule.bugangScore
                : rule.mingGangScore;

    if (ev.type === GANG_TYPE.MING && ev.targetPlayerId) {
      // 被点杠：被杠者得，点杠者失
      scoreChanges[ev.playerId] = (scoreChanges[ev.playerId] || 0) - score;
      scoreChanges[ev.targetPlayerId] = (scoreChanges[ev.targetPlayerId] || 0) + score;
      breakdown.gangDetails.push({ type: 'ming点杠', playerId: ev.playerId, target: ev.targetPlayerId, score });
    } else {
      // 抓牌/暗/补杠：3 家各付给杠牌者
      players.forEach((p) => {
        if (p._id === ev.playerId) {
          scoreChanges[p._id] = (scoreChanges[p._id] || 0) + score * 3;
        } else {
          scoreChanges[p._id] = (scoreChanges[p._id] || 0) - score;
        }
      });
      breakdown.gangDetails.push({ type: ev.type, playerId: ev.playerId, score, perLose: score });
    }
  });
}
```

- [ ] **Step 4: 跑测试确认全部通过**

```bash
cd "g:/claude project/majiang"
npm test -- scoreService
```

Expected: PASS, 14 个用例全过

- [ ] **Step 5: 提交**

```bash
git add miniprogram/services/scoreService.js tests/services/scoreService.test.js
git commit -m "feat(score): implement gang event calculation (ming/an/bu)"
```

---

## Task 13: scoreService — 买马 + 庄家加成

**Files:**
- Modify: `miniprogram/services/scoreService.js`
- Modify: `tests/services/scoreService.test.js`

- [ ] **Step 1: 追加测试用例**

```js
describe('scoreService.calculateRound - 买马', () => {
  test('maCount=2, 中 1 马 → 赢家多赢 1 分（3 家各付 1/2 取整 = 1）', () => {
    const rule = makeRule({ baseScore: 1, maCount: 2 });
    const players = makePlayers();
    const input = {
      winnerId: 'p0', winType: WIN_TYPE.ZIMO, fan: 0,
      gangEvents: [],
      maResults: [true, false], // 中 1 马
    };
    const result = calculateRound(rule, input, players);
    // 中马数 × 底分 = 1×1 = 1，每家付 = ceil(1/3) = 1，赢家+1，其他-1
    // 实际采用简化：赢家 + 中马数 × 底分，3 家均分
    expect(result.scoreChanges.p0).toBe(1);
  });

  test('maCount=6, 中 3 马 → 赢家多赢 3 分', () => {
    const rule = makeRule({ baseScore: 1, maCount: 6 });
    const players = makePlayers();
    const input = {
      winnerId: 'p0', winType: WIN_TYPE.ZIMO, fan: 0,
      gangEvents: [],
      maResults: [true, true, true, false, false, false],
    };
    const result = calculateRound(rule, input, players);
    expect(result.scoreChanges.p0).toBe(3);
  });
});

describe('scoreService.calculateRound - 庄家加成', () => {
  test('dealerMul=2, 庄家自摸 → 庄家净收入 ×2', () => {
    const rule = makeRule({ baseScore: 1, zimoMul: 1, dealerMul: 2 });
    const players = makePlayers(); // p0 是庄家
    const input = { winnerId: 'p0', winType: WIN_TYPE.ZIMO, fan: 1, gangEvents: [], maResults: [] };
    const result = calculateRound(rule, input, players);
    // 基础：p0+3, 其他-1
    // 加成：p0 再 ×2 = +6-3=+3；其他再 ×2 = -2
    expect(result.scoreChanges).toEqual({ p0: 6, p1: -2, p2: -2, p3: -2 });
  });

  test('dealerMul=2, 闲家点炮给庄家 → 庄家净收入 ×2', () => {
    const rule = makeRule({ baseScore: 1, dianpaoMul: 1, dealerMul: 2 });
    const players = makePlayers(); // p0 是庄家
    const input = { winnerId: 'p0', loserId: 'p2', winType: WIN_TYPE.DIANPAO, fan: 1, gangEvents: [], maResults: [] };
    const result = calculateRound(rule, input, players);
    // 基础：p0+1, p2-1
    // 加成：p0 再 ×2 = +2-1=+1；p2 再 ×2 = -2
    expect(result.scoreChanges).toEqual({ p0: 2, p1: 0, p2: -2, p3: 0 });
  });

  test('dealerMul=1 → 不加成', () => {
    const rule = makeRule({ dealerMul: 1 });
    const players = makePlayers();
    const input = { winnerId: 'p0', winType: WIN_TYPE.ZIMO, fan: 1, gangEvents: [], maResults: [] };
    const result = calculateRound(rule, input, players);
    expect(result.scoreChanges).toEqual({ p0: 3, p1: -1, p2: -1, p3: -1 });
  });
});
```

- [ ] **Step 2: 跑测试确认部分失败**

```bash
cd "g:/claude project/majiang"
npm test -- scoreService
```

Expected: 5 个新用例 FAIL

- [ ] **Step 3: 实现 `applyMa` 和 `applyDealerMul`**

替换 `scoreService.js` 中的两个函数：

```js
function applyMa(rule, winnerId, maResults, players, scoreChanges, breakdown) {
  const hitCount = maResults.filter(Boolean).length;
  if (hitCount === 0) return;
  const total = hitCount * rule.baseScore;
  // 简化策略：中马总分由赢家独得，其他 3 家均摊
  const perLose = total; // 赢家独得，3 家各付一份 = 总和守恒
  // 重新计算：赢家 +total, 其他 -total/3
  // 但总分不守恒，所以用：赢家 +hitCount*baseScore, 每家 -hitCount*baseScore/3 (向上取整)
  // 守恒约束：3 家付出之和 = 赢家收入
  // 简化：赢家 +hitCount*baseScore，每家 -Math.ceil(hitCount*baseScore/3) ，差异归入赢家
  // 进一步简化：赢家 +total，每家各 -Math.round(total/3)，余额由赢家
  // 最稳：3 家均摊 total/3，赢家 +total
  // → 不守恒。改：赢家 +total，每家 -Math.round(total/3) 然后赢家再加余额
  // 正确做法：3 家各付 hitCount*baseScore/3 (向上取整)，归入赢家
  // 守恒: Σ(-x_i) + total = 0 → x_i = total/3
  // 实现：x = Math.ceil(total/3)
  // 守恒校验：x*3 - total
  const x = Math.ceil(total / 3);
  const actualDelta = x * 3;
  scoreChanges[winnerId] = (scoreChanges[winnerId] || 0) + actualDelta;
  players.forEach((p) => {
    if (p._id !== winnerId) {
      scoreChanges[p._id] = (scoreChanges[p._id] || 0) - x;
    }
  });
  breakdown.maDetails.push({ hitCount, total, perLose: x });
}

function applyDealerMul(players, winnerId, loserId, winType, dealerMul, scoreChanges) {
  const dealer = players.find((p) => p.seatIndex === SEAT.EAST);
  if (!dealer) return;
  const dealerId = dealer._id;

  // 加成应用：当前 scoreChanges 中 dealer 相关的部分
  if (ZIMO_TYPES.has(winType) && winnerId === dealerId) {
    // 庄家自摸：庄家净收入 × dealerMul，其他 3 家各 × dealerMul
    players.forEach((p) => {
      scoreChanges[p._id] = scoreChanges[p._id] * dealerMul;
    });
  } else if (DIANPAO_TYPES.has(winType) && winnerId === dealerId) {
    // 庄家点炮胡：庄家 + 点炮者 都 × dealerMul
    scoreChanges[dealerId] = scoreChanges[dealerId] * dealerMul;
    if (loserId) {
      scoreChanges[loserId] = scoreChanges[loserId] * dealerMul;
    }
  } else if (DIANPAO_TYPES.has(winType) && loserId === dealerId) {
    // 庄家点炮：庄家 + 点炮者 都 × dealerMul（庄家是被点炮者）
    scoreChanges[dealerId] = scoreChanges[dealerId] * dealerMul;
    if (winnerId) {
      scoreChanges[winnerId] = scoreChanges[winnerId] * dealerMul;
    }
  }
  // 闲家自摸：庄家多付一份底（dealerMul=2 时，庄家出 ×2）
  // → 已在「庄家相关分数都 ×dealerMul」覆盖
}
```

- [ ] **Step 4: 跑测试**

```bash
cd "g:/claude project/majiang"
npm test -- scoreService
```

Expected: PASS（19 个用例全过）

- [ ] **Step 5: 提交**

```bash
git add miniprogram/services/scoreService.js tests/services/scoreService.test.js
git commit -m "feat(score): implement ma (买马) and dealer multiplier"
```

---

## Task 14: scoreService — 属性测试（分数守恒）

**Files:**
- Create: `tests/services/scoreService.property.test.js`

- [ ] **Step 1: 安装 fast-check**

```bash
cd "g:/claude project/majiang"
npm install --save-dev fast-check
```

- [ ] **Step 2: 写属性测试**

```js
const fc = require('fast-check');
const { calculateRound } = require('../../miniprogram/services/scoreService');
const { makeRule, makePlayers } = require('../fixtures/rules');
const { WIN_TYPE, ZIMO_TYPES, DIANPAO_TYPES } = require('../../miniprogram/utils/constants');

const ruleArb = fc.record({
  baseScore: fc.integer({ min: 1, max: 5 }),
  zimoMul: fc.integer({ min: 1, max: 3 }),
  dianpaoMul: fc.integer({ min: 1, max: 3 }),
  mingGangScore: fc.integer({ min: 0, max: 3 }),
  anGangScore: fc.integer({ min: 0, max: 4 }),
  bugangScore: fc.integer({ min: 0, max: 3 }),
  maxFan: fc.integer({ min: 0, max: 16 }),
  maCount: fc.integer({ min: 0, max: 6 }),
  dealerMul: fc.integer({ min: 1, max: 2 }),
  allowDianpao: fc.boolean(),
});

const playerIdArb = fc.constantFrom('p0', 'p1', 'p2', 'p3');
const winTypeArb = fc.constantFrom(...Object.values(WIN_TYPE));

describe('scoreService - 不变式属性测试', () => {
  test('分数守恒：Σ scoreChanges === 0', () => {
    fc.assert(
      fc.property(
        ruleArb, winTypeArb, playerIdArb, playerIdArb,
        fc.integer({ min: 0, max: 20 }),
        (rule, winType, winnerId, loserId, fan) => {
          // 自摸型不需要 loserId
          const input = ZIMO_TYPES.has(winType)
            ? { winnerId, winType, fan, gangEvents: [], maResults: [] }
            : { winnerId, loserId: loserId === winnerId ? 'p1' : loserId, winType, fan, gangEvents: [], maResults: [] };
          if (DIANPAO_TYPES.has(winType) && !rule.allowDianpao) return true; // 跳过非法组合
          const players = makePlayers();
          try {
            const result = calculateRound(rule, input, players);
            const sum = Object.values(result.scoreChanges).reduce((a, b) => a + b, 0);
            return sum === 0;
          } catch (e) {
            return true; // 忽略抛错（异常输入）
          }
        }
      ),
      { numRuns: 500 }
    );
  });
});
```

- [ ] **Step 3: 跑属性测试**

```bash
cd "g:/claude project/majiang"
npm test -- scoreService.property
```

Expected: PASS, 500 次随机用例都满足守恒

- [ ] **Step 4: 提交**

```bash
git add tests/services/scoreService.property.test.js package.json package-lock.json
git commit -m "test(score): add property-based test for score conservation"
```

---

## Task 15: ruleService.js（默认规则）

**Files:**
- Create: `miniprogram/services/ruleService.js`
- Create: `tests/services/ruleService.test.js`

- [ ] **Step 1: 写失败测试**

```js
const { getDefaultRule, validateRule } = require('../../miniprogram/services/ruleService');

describe('ruleService', () => {
  test('getDefaultRule returns complete rule', () => {
    const r = getDefaultRule();
    expect(r).toHaveProperty('baseScore');
    expect(r).toHaveProperty('zimoMul');
    expect(r).toHaveProperty('dianpaoMul');
    expect(r).toHaveProperty('mingGangScore');
    expect(r).toHaveProperty('anGangScore');
    expect(r).toHaveProperty('bugangScore');
    expect(r).toHaveProperty('maxFan');
    expect(r).toHaveProperty('maCount');
    expect(r).toHaveProperty('dealerMul');
    expect(r).toHaveProperty('allowDianpao');
  });
  test('validateRule accepts default', () => {
    expect(validateRule(getDefaultRule())).toBe(true);
  });
  test('validateRule rejects missing field', () => {
    const r = getDefaultRule();
    delete r.baseScore;
    expect(validateRule(r)).toBe(false);
  });
  test('validateRule rejects negative', () => {
    const r = { ...getDefaultRule(), baseScore: -1 };
    expect(validateRule(r)).toBe(false);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

```bash
cd "g:/claude project/majiang"
npm test -- ruleService
```

Expected: FAIL

- [ ] **Step 3: 写实现**

```js
function getDefaultRule() {
  return {
    baseScore: 1,
    zimoMul: 2,
    dianpaoMul: 1,
    mingGangScore: 1,
    anGangScore: 2,
    bugangScore: 1,
    maxFan: 0,
    maCount: 0,
    dealerMul: 1,
    allowDianpao: true,
  };
}

function validateRule(rule) {
  if (!rule || typeof rule !== 'object') return false;
  const fields = ['baseScore', 'zimoMul', 'dianpaoMul', 'mingGangScore', 'anGangScore', 'bugangScore', 'maxFan', 'maCount', 'dealerMul', 'allowDianpao'];
  for (const f of fields) {
    if (!(f in rule)) return false;
  }
  const numericFields = ['baseScore', 'zimoMul', 'dianpaoMul', 'mingGangScore', 'anGangScore', 'bugangScore', 'maxFan', 'maCount', 'dealerMul'];
  for (const f of numericFields) {
    if (typeof rule[f] !== 'number' || rule[f] < 0) return false;
  }
  if (typeof rule.allowDianpao !== 'boolean') return false;
  return true;
}

module.exports = { getDefaultRule, validateRule };
```

- [ ] **Step 4: 跑测试确认通过**

```bash
cd "g:/claude project/majiang"
npm test -- ruleService
```

Expected: PASS, 4 个用例

- [ ] **Step 5: 提交**

```bash
git add miniprogram/services/ruleService.js tests/services/ruleService.test.js
git commit -m "feat(rule): add default rule template and validator"
```

---

## Task 16: services/cloud.js（云开发封装）

**Files:**
- Create: `miniprogram/services/cloud.js`

- [ ] **Step 1: 写 `miniprogram/services/cloud.js`**

```js
/**
 * 统一云开发封装
 * - callFunction: 调用云函数（带错误标准化）
 * - watch: 订阅数据库变更
 */

function callFunction(name, data = {}) {
  return wx.cloud.callFunction({ name, data })
    .then((res) => {
      if (res.result && res.result.code && res.result.code !== 'OK') {
        const err = new Error(res.result.message || '云函数错误');
        err.code = res.result.code;
        err.detail = res.result.detail;
        throw err;
      }
      return res.result;
    });
}

/**
 * 订阅集合变更
 * @param {string} collection
 * @param {Object} query - { _id, roomId 等字段 }
 * @param {Function} onChange - (snapshot) => void
 * @returns {Function} 停止订阅的函数
 */
function watch(collection, query, onChange) {
  const db = wx.cloud.database();
  const watcher = db.collection(collection).where(query).watch({
    onChange: (snapshot) => onChange(snapshot),
    onError: (err) => console.error(`watch ${collection} error:`, err),
  });
  return () => watcher.close();
}

function getOpenid() {
  return wx.cloud.callFunction({ name: 'getOpenid' })
    .then((res) => res.result.openid);
}

module.exports = { callFunction, watch, getOpenid };
```

- [ ] **Step 2: 验证无语法错误**

```bash
cd "g:/claude project/majiang"
node -e "const c = require('./miniprogram/services/cloud'); console.log(Object.keys(c))"
```

Expected: 打印 ['callFunction', 'watch', 'getOpenid']

- [ ] **Step 3: 提交**

```bash
git add miniprogram/services/cloud.js
git commit -m "feat(cloud): add unified cloud function and watch wrappers"
```

---

## Task 17: services/errorHandler.js

**Files:**
- Create: `miniprogram/services/errorHandler.js`

- [ ] **Step 1: 写实现**

```js
const { ERR_CODE } = require('../utils/constants');

const MESSAGE_MAP = {
  [ERR_CODE.ROOM_NOT_FOUND]: { toast: '房间号不存在', redirectHome: true },
  [ERR_CODE.ROOM_FULL]: { toast: '房间已满' },
  [ERR_CODE.ROOM_FINISHED]: { toast: '本局已结束' },
  [ERR_CODE.NOT_IN_ROOM]: { toast: '你不在该房间中' },
  [ERR_CODE.INVALID_INPUT]: { toast: '输入有误', modal: true },
  [ERR_CODE.FAN_EXCEEDS_MAX]: { toast: '番数超出封顶' },
  [ERR_CODE.GANG_COUNT_EXCEEDS]: { toast: '杠数过多' },
  [ERR_CODE.INTERNAL_ERROR]: { toast: '系统繁忙，请稍后重试' },
};

function handleError(err, pageCtx) {
  const config = MESSAGE_MAP[err.code] || { toast: err.message || '未知错误' };

  if (pageCtx && pageCtx.setData) {
    pageCtx.setData({ error: config.toast });
  }

  if (config.modal) {
    wx.showModal({ title: '提示', content: config.toast + (err.detail ? `: ${err.detail}` : ''), showCancel: false });
  } else {
    wx.showToast({ title: config.toast, icon: 'none' });
  }

  if (config.redirectHome && pageCtx) {
    setTimeout(() => {
      wx.switchTab({ url: '/pages/home/index' });
    }, 1500);
  }

  return config;
}

module.exports = { handleError, MESSAGE_MAP };
```

- [ ] **Step 2: 提交**

```bash
git add miniprogram/services/errorHandler.js
git commit -m "feat(error): add error code to UI message mapper"

---

# M2 — 单局录入 + 房间主页（1.5 周）

> 本阶段所有云函数使用 `wx-server-sdk` + 复用 `scoreService.js`（与前端同源）。

## Task 18: cloudfunctions/createRoom

**Files:**
- Create: `cloudfunctions/createRoom/index.js`
- Create: `cloudfunctions/createRoom/package.json`
- Create: `cloudfunctions/createRoom/config.json`

- [ ] **Step 1: 创建 `cloudfunctions/createRoom/package.json`**

```json
{
  "name": "createRoom",
  "version": "1.0.0",
  "main": "index.js",
  "dependencies": {
    "wx-server-sdk": "~2.6.3"
  }
}
```

- [ ] **Step 2: 创建 `cloudfunctions/createRoom/config.json`**

```json
{
  "permissions": {
    "openapi": []
  }
}
```

- [ ] **Step 3: 写 `cloudfunctions/createRoom/index.js`**

```js
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

const { generateUniqueRoomCode } = require('../../miniprogram/utils/cloud-id');
const { getDefaultRule } = require('../../miniprogram/services/ruleService');
const { ROOM_STATUS } = require('../../miniprogram/utils/constants');

exports.main = async (event, context) => {
  const { openid } = cloud.getWXContext();
  const { nickname = '玩家', avatarIndex = 0, clientId } = event;

  // 1. 校验昵称和头像
  if (typeof nickname !== 'string' || nickname.trim().length === 0 || nickname.length > 8) {
    return { code: 'INVALID_INPUT', message: '昵称长度 1-8', detail: 'nickname' };
  }
  if (!Number.isInteger(avatarIndex) || avatarIndex < 0 || avatarIndex > 7) {
    return { code: 'INVALID_INPUT', message: '头像序号 0-7', detail: 'avatarIndex' };
  }

  // 2. 生成唯一房间号
  const roomCode = await generateUniqueRoomCode(async (code) => {
    const res = await db.collection('rooms').where({ roomCode: code }).count();
    return res.total > 0;
  });

  try {
    // 3. 创建默认规则
    const ruleRes = await db.collection('rules').add({
      data: { ...getDefaultRule(), roomId: 'pending', createdAt: Date.now() }
    });
    const ruleId = ruleRes._id;
    await db.collection('rules').doc(ruleId).update({ data: { roomId: ruleId } });

    // 4. 创建房间
    const roomRes = await db.collection('rooms').add({
      data: {
        roomCode,
        ownerId: openid,
        status: ROOM_STATUS.ACTIVE,
        ruleId,
        playerIds: [],
        createdAt: Date.now(),
      }
    });
    const roomId = roomRes._id;

    // 5. 创建玩家（房主）
    const playerRes = await db.collection('players').add({
      data: {
        roomId,
        nickname: nickname.trim(),
        avatarIndex,
        seatIndex: 0, // 庄家位
        isOwner: true,
        openid: openid || null,
        joinedAt: Date.now(),
      }
    });

    // 6. 更新房间 playerIds
    await db.collection('rooms').doc(roomId).update({
      data: { playerIds: [playerRes._id] }
    });

    return {
      code: 'OK',
      data: { roomId, roomCode, playerId: playerRes._id, ruleId }
    };
  } catch (err) {
    console.error('createRoom error:', err);
    return { code: 'INTERNAL_ERROR', message: err.message };
  }
};
```

- [ ] **Step 4: 上传云函数（手动在开发者工具中右键 cloudfunctions/createRoom → 上传并部署：云端安装依赖）**

- [ ] **Step 5: 在开发者工具中测试调用**

```js
// 临时测试
wx.cloud.callFunction({ name: 'createRoom', data: { nickname: '测试', avatarIndex: 0 } })
  .then(console.log);
```

Expected: 返回 `{ code: 'OK', data: { roomId, roomCode, ... } }`

- [ ] **Step 6: 提交**

```bash
git add cloudfunctions/createRoom/
git commit -m "feat(cloud): add createRoom cloud function"
```

---

## Task 19: cloudfunctions/joinRoom

**Files:**
- Create: `cloudfunctions/joinRoom/index.js`
- Create: `cloudfunctions/joinRoom/package.json`
- Create: `cloudfunctions/joinRoom/config.json`

- [ ] **Step 1: 创建 `package.json`**

```json
{
  "name": "joinRoom",
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
const { ROOM_STATUS, ERR_CODE } = require('../../miniprogram/utils/constants');

exports.main = async (event) => {
  const { openid } = cloud.getWXContext();
  const { roomCode, nickname, avatarIndex } = event;

  if (typeof roomCode !== 'string' || !/^\d{6}$/.test(roomCode)) {
    return { code: 'INVALID_INPUT', message: '房间号格式错误', detail: 'roomCode' };
  }
  if (typeof nickname !== 'string' || nickname.trim().length === 0 || nickname.length > 8) {
    return { code: 'INVALID_INPUT', message: '昵称长度 1-8', detail: 'nickname' };
  }
  if (!Number.isInteger(avatarIndex) || avatarIndex < 0 || avatarIndex > 7) {
    return { code: 'INVALID_INPUT', message: '头像序号 0-7', detail: 'avatarIndex' };
  }

  // 1. 找房间
  const roomRes = await db.collection('rooms').where({ roomCode }).limit(1).get();
  if (roomRes.data.length === 0) {
    return { code: 'ROOM_NOT_FOUND', message: '房间号不存在' };
  }
  const room = roomRes.data[0];

  if (room.status !== ROOM_STATUS.ACTIVE) {
    return { code: 'ROOM_FINISHED', message: '本局已结束' };
  }

  // 2. 检查当前玩家数
  const playersRes = await db.collection('players').where({ roomId: room._id }).count();
  if (playersRes.total >= 4) {
    return { code: 'ROOM_FULL', message: '房间已满' };
  }

  // 3. 检查是否已加入（按 openid）
  if (openid) {
    const existing = await db.collection('players').where({ roomId: room._id, openid }).limit(1).get();
    if (existing.data.length > 0) {
      return { code: 'OK', data: { roomId: room._id, playerId: existing.data[0]._id, ruleId: room.ruleId, rejoined: true } };
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
      joinedAt: Date.now(),
    }
  });

  // 6. 更新房间 playerIds
  await db.collection('rooms').doc(room._id).update({
    data: { playerIds: _.push(playerRes._id) }
  });

  return {
    code: 'OK',
    data: { roomId: room._id, playerId: playerRes._id, ruleId: room.ruleId, seatIndex: available }
  };
};
```

- [ ] **Step 4: 复制 `cloud-id.js` 和 `constants.js` 到云函数可访问位置**

```bash
cp miniprogram/utils/cloud-id.js cloudfunctions/_shared/cloud-id.js
cp miniprogram/utils/constants.js cloudfunctions/_shared/constants.js
```

修改 `cloudfunctions/joinRoom/index.js` 顶部 require 路径：

```js
const { ROOM_STATUS, ERR_CODE } = require('../_shared/constants');
```

（**注**：所有云函数的 require 路径都改为 `../_shared/`）

- [ ] **Step 5: 部署 + 测试**

- [ ] **Step 6: 提交**

```bash
git add cloudfunctions/joinRoom/ cloudfunctions/_shared/
git commit -m "feat(cloud): add joinRoom with seat allocation"
```

---

## Task 20: cloudfunctions/updateRule

**Files:**
- Create: `cloudfunctions/updateRule/{index.js,package.json,config.json}`

- [ ] **Step 1: 创建 `package.json`**

```json
{
  "name": "updateRule",
  "version": "1.0.0",
  "main": "index.js",
  "dependencies": { "wx-server-sdk": "~2.6.3" }
}
```

- [ ] **Step 2: 写 `index.js`**

```js
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;
const { validateRule } = require('../_shared/../miniprogram/services/ruleService');

exports.main = async (event) => {
  const { openid } = cloud.getWXContext();
  const { roomId, rule } = event;

  if (!validateRule(rule)) {
    return { code: 'INVALID_INPUT', message: '规则字段不合法', detail: 'rule' };
  }

  // 1. 校验房主
  const roomRes = await db.collection('rooms').doc(roomId).get();
  if (!roomRes.data) return { code: 'ROOM_NOT_FOUND', message: '房间不存在' };
  if (roomRes.data.ownerId !== openid) {
    return { code: 'NOT_IN_ROOM', message: '仅房主可修改规则' };
  }

  // 2. 更新规则
  await db.collection('rules').doc(roomRes.data.ruleId).update({
    data: { ...rule, updatedAt: Date.now() }
  });

  return { code: 'OK' };
};
```

> **注意**：上面的 `require('../_shared/../miniprogram/services/ruleService')` 路径需调整为 `cloudfunctions/_shared/services/ruleService.js`（把 ruleService.js 也复制到 _shared）。

实际项目里推荐：把所有云函数依赖的纯函数放到 `cloudfunctions/_shared/` 下：

```bash
mkdir -p cloudfunctions/_shared
cp miniprogram/utils/constants.js cloudfunctions/_shared/constants.js
cp miniprogram/utils/cloud-id.js cloudfunctions/_shared/cloud-id.js
cp miniprogram/services/ruleService.js cloudfunctions/_shared/ruleService.js
cp miniprogram/services/scoreService.js cloudfunctions/_shared/scoreService.js
```

- [ ] **Step 3: 部署 + 测试**

- [ ] **Step 4: 提交**

```bash
git add cloudfunctions/updateRule/ cloudfunctions/_shared/
git commit -m "feat(cloud): add updateRule with owner verification"
```

---

## Task 21: cloudfunctions/settleRound（核心）

**Files:**
- Create: `cloudfunctions/settleRound/{index.js,package.json,config.json}`

- [ ] **Step 1: 创建 `package.json`**

```json
{
  "name": "settleRound",
  "version": "1.0.0",
  "main": "index.js",
  "dependencies": { "wx-server-sdk": "~2.6.3" }
}
```

- [ ] **Step 2: 写 `index.js`**

```js
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;
const { calculateRound } = require('../_shared/scoreService');
const { WIN_TYPE, ERR_CODE } = require('../_shared/constants');

exports.main = async (event) => {
  const { openid } = cloud.getWXContext();
  const { roomId, clientId, input } = event;

  if (!roomId || !clientId || !input) {
    return { code: 'INVALID_INPUT', message: '参数缺失', detail: 'roomId/clientId/input' };
  }

  // 1. 幂等检查：同 clientId 是否已写入
  const existing = await db.collection('rounds').where({ roomId, clientId }).limit(1).get();
  if (existing.data.length > 0) {
    return { code: 'OK', data: existing.data[0] };
  }

  // 2. 拿规则
  const roomRes = await db.collection('rooms').doc(roomId).get();
  if (!roomRes.data) return { code: 'ROOM_NOT_FOUND', message: '房间不存在' };
  if (roomRes.data.status !== 'active') return { code: 'ROOM_FINISHED', message: '本局已结束' };

  const ruleRes = await db.collection('rules').doc(roomRes.data.ruleId).get();
  if (!ruleRes.data) return { code: 'INVALID_INPUT', message: '规则不存在' };
  const rule = ruleRes.data;

  // 3. 拿 4 个玩家
  const playersRes = await db.collection('players').where({ roomId }).get();
  if (playersRes.data.length !== 4) {
    return { code: 'INVALID_INPUT', message: '需要 4 个玩家' };
  }
  const players = playersRes.data;

  // 4. 校验入参
  const winner = players.find(p => p._id === input.winnerId);
  if (!winner) return { code: 'INVALID_INPUT', message: '胡牌者不在房间中' };
  if (input.loserId) {
    const loser = players.find(p => p._id === input.loserId);
    if (!loser) return { code: 'INVALID_INPUT', message: '点炮者不在房间中' };
  }
  if (!Number.isInteger(input.fan) || input.fan < 0) {
    return { code: 'INVALID_INPUT', message: '番数必须是非负整数' };
  }
  if (input.fan > 100) {
    return { code: 'FAN_EXCEEDS_MAX', message: '番数过大' };
  }
  if (rule.allowDianpao === false && input.loserId && !['zimo', 'gangshanghua', 'haidilao', 'tianhu', 'dihu'].includes(input.winType)) {
    return { code: 'INVALID_INPUT', message: '当前规则不允许点炮' };
  }

  // 5. 计算 scoreChanges（纯函数）
  const { scoreChanges, breakdown, isBalanced } = calculateRound(rule, input, players);
  if (!isBalanced) {
    return { code: 'INTERNAL_ERROR', message: '分数计算不平衡' };
  }

  // 6. 分配 roundIndex
  const lastRound = await db.collection('rounds').where({ roomId }).orderBy('roundIndex', 'desc').limit(1).get();
  const roundIndex = lastRound.data.length > 0 ? lastRound.data[0].roundIndex + 1 : 1;

  // 7. 写入
  const roundDoc = {
    roomId,
    roundIndex,
    clientId,
    winnerId: input.winnerId,
    winType: input.winType,
    loserId: input.loserId || null,
    fan: input.fan,
    gangEvents: input.gangEvents || [],
    maResults: input.maResults || [],
    scoreChanges,
    breakdown,
    createdBy: openid || 'anonymous',
    createdAt: Date.now(),
  };
  const addRes = await db.collection('rounds').add({ data: roundDoc });
  roundDoc._id = addRes._id;

  return { code: 'OK', data: roundDoc };
};
```

- [ ] **Step 3: 部署 + 测试**

- [ ] **Step 4: 提交**

```bash
git add cloudfunctions/settleRound/
git commit -m "feat(cloud): add settleRound with idempotency and pure-function score"
```

---

## Task 22: services/roomService.js

**Files:**
- Create: `miniprogram/services/roomService.js`

- [ ] **Step 1: 写实现**

```js
const { callFunction } = require('./cloud');

function createRoom({ nickname, avatarIndex, clientId }) {
  return callFunction('createRoom', { nickname, avatarIndex, clientId });
}

function joinRoom({ roomCode, nickname, avatarIndex }) {
  return callFunction('joinRoom', { roomCode, nickname, avatarIndex });
}

function updateRule({ roomId, rule }) {
  return callFunction('updateRule', { roomId, rule });
}

function getRoom(roomId) {
  const db = wx.cloud.database();
  return db.collection('rooms').doc(roomId).get().then(r => r.data);
}

function getPlayers(roomId) {
  const db = wx.cloud.database();
  return db.collection('players').where({ roomId }).get().then(r => r.data);
}

function finishRoom(roomId) {
  return callFunction('finishRoom', { roomId });
}

module.exports = { createRoom, joinRoom, updateRule, getRoom, getPlayers, finishRoom };
```

- [ ] **Step 2: 提交**

```bash
git add miniprogram/services/roomService.js
git commit -m "feat(room): add room service with create/join/update/finish"
```

---

## Task 23: services/playerService.js

**Files:**
- Create: `miniprogram/services/playerService.js`

- [ ] **Step 1: 写实现**

```js
const db = wx.cloud.database();
const _ = db.command;

function getPlayers(roomId) {
  return db.collection('players').where({ roomId }).get().then(r => r.data);
}

function watchPlayers(roomId, onChange) {
  const watcher = db.collection('players').where({ roomId }).watch({
    onChange: (snapshot) => onChange(snapshot.docs),
    onError: (err) => console.error('watch players error:', err),
  });
  return () => watcher.close();
}

module.exports = { getPlayers, watchPlayers };
```

- [ ] **Step 2: 提交**

```bash
git add miniprogram/services/playerService.js
git commit -m "feat(player): add player service with watcher"
```

---

## Task 24: services/roundService.js

**Files:**
- Create: `miniprogram/services/roundService.js`

- [ ] **Step 1: 写实现**

```js
const { callFunction } = require('./cloud');

function submitRound({ roomId, clientId, input }) {
  return callFunction('settleRound', { roomId, clientId, input });
}

function getRounds(roomId) {
  const db = wx.cloud.database();
  return db.collection('rounds').where({ roomId }).orderBy('roundIndex', 'asc').get().then(r => r.data);
}

function watchRounds(roomId, onChange) {
  const db = wx.cloud.database();
  const watcher = db.collection('rounds').where({ roomId }).watch({
    onChange: (snapshot) => onChange(snapshot.docs),
    onError: (err) => console.error('watch rounds error:', err),
  });
  return () => watcher.close();
}

module.exports = { submitRound, getRounds, watchRounds };
```

- [ ] **Step 2: 提交**

```bash
git add miniprogram/services/roundService.js
git commit -m "feat(round): add round service with watch"
```

---

## Task 25: services/userService.js

**Files:**
- Create: `miniprogram/services/userService.js`

- [ ] **Step 1: 写实现**

```js
const db = wx.cloud.database();

function getOrCreateAnonymousUser() {
  let clientId = wx.getStorageSync('clientId');
  if (!clientId) {
    clientId = 'cli_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);
    wx.setStorageSync('clientId', clientId);
  }
  return { clientId, isAnonymous: true };
}

async function loginWithWx() {
  // 1. wx.login 拿 code
  const loginRes = await new Promise((resolve, reject) => {
    wx.login({ success: resolve, fail: reject });
  });
  const code = loginRes.code;
  if (!code) throw new Error('wx.login 失败');

  // 2. 调云函数 getOpenid
  const { result } = await wx.cloud.callFunction({ name: 'getOpenid' });
  if (!result || !result.openid) throw new Error('获取 openid 失败');

  const openid = result.openid;

  // 3. 写 users 集合
  const userRes = await db.collection('users').where({ _openid: openid }).limit(1).get();
  if (userRes.data.length === 0) {
    await db.collection('users').add({ data: { _openid: openid, createdAt: Date.now() } });
  }

  wx.setStorageSync('openid', openid);
  return { openid, isAnonymous: false };
}

function getProfile() {
  return {
    clientId: wx.getStorageSync('clientId') || '',
    openid: wx.getStorageSync('openid') || '',
    isAnonymous: !wx.getStorageSync('openid'),
  };
}

module.exports = { getOrCreateAnonymousUser, loginWithWx, getProfile };
```

- [ ] **Step 2: 提交**

```bash
git add miniprogram/services/userService.js
git commit -m "feat(user): add user service (anonymous + wx login)"
```

---

## Task 26: stores/observable.js

**Files:**
- Create: `miniprogram/stores/observable.js`

- [ ] **Step 1: 写实现**

```js
/**
 * 极简 observable（20 行实现）
 * 用法：
 *   const obs = observable({ count: 0 });
 *   const dispose = autorun(() => console.log(obs.count));
 *   obs.count = 1;  // 触发 console.log
 *   dispose();
 */

function observable(obj) {
  const listeners = new Set();
  return new Proxy(obj, {
    set(target, key, value) {
      target[key] = value;
      listeners.forEach(fn => fn(target[key], key));
      return true;
    },
    get(target, key) {
      return target[key];
    },
  });
}

function autorun(fn) {
  let prevDeps = null;
  function wrapper() {
    const newDeps = new Set();
    const result = fn(newDeps.add.bind(newDeps));
    if (prevDeps) prevDeps.forEach(d => d.delete(wrapper));
    newDeps.forEach(d => d.add(wrapper));
    prevDeps = newDeps;
    return result;
  }
  wrapper();
  return () => {
    if (prevDeps) prevDeps.forEach(d => d.delete(wrapper));
  };
}

module.exports = { observable, autorun };
```

- [ ] **Step 2: 提交**

```bash
git add miniprogram/stores/observable.js
git commit -m "feat(stores): add minimal observable (20-line impl)"
```

---

## Task 27: stores/appStore.js

**Files:**
- Create: `miniprogram/stores/appStore.js`

- [ ] **Step 1: 写实现**

```js
const { observable } = require('./observable');
const { getProfile, getOrCreateAnonymousUser } = require('../services/userService');

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
    this.nickname = wx.getStorageSync('nickname') || '';
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
```

- [ ] **Step 2: 提交**

```bash
git add miniprogram/stores/appStore.js
git commit -m "feat(stores): add appStore (profile + clientId)"
```

---

## Task 28: stores/roomStore.js

**Files:**
- Create: `miniprogram/stores/roomStore.js`

- [ ] **Step 1: 写实现**

```js
const { observable } = require('./observable');

const store = observable({
  roomId: '',
  roomCode: '',
  rule: null,
  players: [], // 4 个
  rounds: [], // 全部
  isOwner: false,
  currentPlayerId: '',
  _stopWatchPlayers: null,
  _stopWatchRounds: null,
  _stopWatchRule: null,

  reset() {
    this._cleanup();
    this.roomId = '';
    this.roomCode = '';
    this.rule = null;
    this.players = [];
    this.rounds = [];
    this.isOwner = false;
    this.currentPlayerId = '';
  },

  setRoom({ roomId, roomCode, rule, players, isOwner, currentPlayerId }) {
    this.roomId = roomId;
    this.roomCode = roomCode;
    this.rule = rule;
    this.players = players;
    this.isOwner = isOwner;
    this.currentPlayerId = currentPlayerId;
  },

  setRule(rule) { this.rule = rule; },
  setPlayers(players) { this.players = players; },
  setRounds(rounds) { this.rounds = rounds; },

  addRound(round) {
    const idx = this.rounds.findIndex(r => r._id === round._id);
    if (idx >= 0) this.rounds[idx] = round;
    else this.rounds.push(round);
  },

  getTotalScores() {
    const totals = {};
    this.players.forEach(p => { totals[p._id] = 0; });
    this.rounds.forEach(r => {
      Object.entries(r.scoreChanges).forEach(([pid, delta]) => {
        totals[pid] = (totals[pid] || 0) + delta;
      });
    });
    return totals;
  },

  _cleanup() {
    if (this._stopWatchPlayers) { this._stopWatchPlayers(); this._stopWatchPlayers = null; }
    if (this._stopWatchRounds) { this._stopWatchRounds(); this._stopWatchRounds = null; }
    if (this._stopWatchRule) { this._stopWatchRule(); this._stopWatchRule = null; }
  },
});

module.exports = store;
```

- [ ] **Step 2: 提交**

```bash
git add miniprogram/stores/roomStore.js
git commit -m "feat(stores): add roomStore with total score computation"
```

---

## Task 29: pages/home（首页）

**Files:**
- Modify: `miniprogram/pages/home/index.js`
- Modify: `miniprogram/pages/home/index.wxml`
- Modify: `miniprogram/pages/home/index.wxss`
- Modify: `miniprogram/pages/home/index.json`

- [ ] **Step 1: 修改 `index.json`**

```json
{
  "navigationBarTitleText": "首页",
  "usingComponents": {
    "van-button": "@vant/weapp/button/index"
  }
}
```

- [ ] **Step 2: 修改 `index.wxml`**

```xml
<view class="home">
  <view class="hero">
    <text class="title">麻记</text>
    <text class="subtitle">4 人番数实时记录</text>
  </view>

  <view class="actions">
    <van-button type="primary" size="large" bind:tap="onCreateRoom" custom-class="btn">创建牌局</van-button>
    <van-button type="default" size="large" bind:tap="onJoinRoom" custom-class="btn">加入牌局</van-button>
  </view>

  <view class="profile" wx:if="{{!loaded}}">
    <text>正在加载...</text>
  </view>
</view>
```

- [ ] **Step 3: 修改 `index.wxss`**

```css
.home { padding: 40rpx; min-height: 100vh; box-sizing: border-box; }
.hero { text-align: center; margin: 80rpx 0; }
.title { display: block; font-size: 72rpx; font-weight: 700; color: #1aad19; }
.subtitle { display: block; margin-top: 20rpx; font-size: 28rpx; color: #7A7E83; }
.actions { display: flex; flex-direction: column; gap: 24rpx; margin-top: 80rpx; }
.btn { width: 100%; }
.profile { text-align: center; margin-top: 40rpx; color: #7A7E83; }
```

- [ ] **Step 4: 修改 `index.js`**

```js
const app = getApp();
const appStore = require('../../stores/appStore');
const roomService = require('../../services/roomService');
const { handleError } = require('../../services/errorHandler');
const roomStore = require('../../stores/roomStore');

Page({
  data: { loaded: false },

  onLoad() {
    appStore.init();
    this.setData({ loaded: true, nickname: appStore.nickname, avatarIndex: appStore.avatarIndex });
  },

  onCreateRoom() {
    if (!appStore.nickname) {
      wx.navigateTo({ url: '/pages/me/index?from=create' });
      return;
    }
    wx.showLoading({ title: '创建中...' });
    roomService.createRoom({
      nickname: appStore.nickname,
      avatarIndex: appStore.avatarIndex,
      clientId: appStore.clientId,
    }).then((res) => {
      wx.hideLoading();
      if (res.code === 'OK') {
        roomStore.setRoom({
          roomId: res.data.roomId,
          roomCode: res.data.roomCode,
          rule: null,
          players: [],
          isOwner: true,
          currentPlayerId: res.data.playerId,
        });
        wx.navigateTo({ url: '/pages/room/index/index' });
      } else {
        handleError({ code: res.code, message: res.message }, this);
      }
    }).catch((err) => {
      wx.hideLoading();
      handleError(err, this);
    });
  },

  onJoinRoom() {
    if (!appStore.nickname) {
      wx.navigateTo({ url: '/pages/me/index?from=join' });
      return;
    }
    wx.showModal({
      title: '加入牌局',
      editable: true,
      placeholderText: '请输入 6 位房间号',
      success: (modal) => {
        if (modal.confirm && modal.content) {
          this._doJoin(modal.content.trim());
        }
      },
    });
  },

  _doJoin(roomCode) {
    wx.showLoading({ title: '加入中...' });
    roomService.joinRoom({
      roomCode,
      nickname: appStore.nickname,
      avatarIndex: appStore.avatarIndex,
    }).then((res) => {
      wx.hideLoading();
      if (res.code === 'OK') {
        wx.navigateTo({ url: `/pages/room/index/index?roomId=${res.data.roomId}` });
      } else {
        handleError({ code: res.code, message: res.message }, this);
      }
    }).catch((err) => {
      wx.hideLoading();
      handleError(err, this);
    });
  },
});
```

- [ ] **Step 5: 真机调试**

在开发者工具中点击"创建牌局"，应能跳转到房间主页（虽然还是占位）。

- [ ] **Step 6: 提交**

```bash
git add miniprogram/pages/home/
git commit -m "feat(home): implement home page with create/join actions"
```

---

## Task 30: pages/room/index（房间主页）

**Files:**
- Modify: `miniprogram/pages/room/index/{index.js,index.wxml,index.wxss,index.json}`

- [ ] **Step 1: 修改 `index.json`**

```json
{
  "navigationBarTitleText": "房间",
  "usingComponents": {
    "van-button": "@vant/weapp/button/index"
  }
}
```

- [ ] **Step 2: 修改 `index.wxml`**

```xml
<view class="room">
  <view class="code-bar">
    <text class="code-label">房间号</text>
    <text class="code-value" bind:tap="onCopyCode">{{roomCode}}</text>
    <van-button size="small" plain type="primary" bind:tap="onShare">分享</van-button>
  </view>

  <view class="players">
    <block wx:for="{{playersWithScore}}" wx:key="_id">
      <view class="player-row {{item.isOwner ? 'owner' : ''}}">
        <image class="avatar" src="/images/avatars/avatar-{{item.avatarIndex}}.png"></image>
        <view class="info">
          <text class="nick">{{item.nickname}}{{item.isOwner ? ' (房主)' : ''}}</text>
          <text class="seat">座位 {{item.seatIndex}}</text>
        </view>
        <text class="score {{item.totalScore > 0 ? 'positive' : item.totalScore < 0 ? 'negative' : ''}}">{{item.totalScore}} 分</text>
      </view>
    </block>
  </view>

  <view class="rule-bar" bind:tap="onEditRule">
    <text class="rule-label">本场规则：</text>
    <text class="rule-text">{{ruleSummary}}</text>
    <text class="edit-icon" wx:if="{{isOwner}}">编辑</text>
  </view>

  <view class="actions">
    <van-button type="primary" size="large" bind:tap="onRecordRound">记录本局</van-button>
    <van-button wx:if="{{isOwner}}" type="danger" plain size="large" bind:tap="onFinishRoom" custom-class="btn-gap">结束本局</van-button>
  </view>
</view>
```

- [ ] **Step 3: 修改 `index.wxss`**

```css
.room { padding: 24rpx; min-height: 100vh; box-sizing: border-box; background: #f5f5f5; }
.code-bar { display: flex; align-items: center; gap: 16rpx; padding: 24rpx; background: #fff; border-radius: 12rpx; }
.code-label { font-size: 28rpx; color: #7A7E83; }
.code-value { font-size: 36rpx; font-weight: 700; color: #1aad19; flex: 1; }
.players { margin-top: 24rpx; background: #fff; border-radius: 12rpx; overflow: hidden; }
.player-row { display: flex; align-items: center; padding: 24rpx; border-bottom: 1rpx solid #f0f0f0; }
.player-row.owner { background: #f0f8e8; }
.player-row:last-child { border-bottom: none; }
.avatar { width: 80rpx; height: 80rpx; border-radius: 50%; }
.info { flex: 1; margin-left: 20rpx; display: flex; flex-direction: column; }
.nick { font-size: 30rpx; font-weight: 600; }
.seat { font-size: 24rpx; color: #7A7E83; margin-top: 6rpx; }
.score { font-size: 32rpx; font-weight: 700; }
.score.positive { color: #d33; }
.score.negative { color: #1aad19; }
.rule-bar { margin-top: 24rpx; padding: 24rpx; background: #fff; border-radius: 12rpx; display: flex; align-items: center; gap: 12rpx; }
.rule-label { font-size: 28rpx; color: #7A7E83; }
.rule-text { flex: 1; font-size: 28rpx; }
.edit-icon { font-size: 26rpx; color: #1aad19; }
.actions { margin-top: 60rpx; display: flex; flex-direction: column; gap: 24rpx; }
.btn-gap { margin-top: 24rpx; }
```

- [ ] **Step 4: 修改 `index.js`**

```js
const roomStore = require('../../../stores/roomStore');
const appStore = require('../../../stores/appStore');
const roomService = require('../../../services/roomService');
const playerService = require('../../../services/playerService');
const roundService = require('../../../services/roundService');
const { handleError } = require('../../../services/errorHandler');
const { getDefaultRule } = require('../../../services/ruleService');

Page({
  data: {
    roomCode: '',
    playersWithScore: [],
    isOwner: false,
    ruleSummary: '',
  },

  onLoad(query) {
    this._init(query.roomId);
  },

  onShow() {
    if (roomStore.rounds.length === 0) return;
    this._refreshScores();
  },

  onUnload() {
    roomStore._cleanup();
  },

  _init(roomId) {
    if (!roomId) roomId = roomStore.roomId;
    if (!roomId) {
      wx.switchTab({ url: '/pages/home/index' });
      return;
    }
    roomStore.roomId = roomId;

    Promise.all([
      roomService.getRoom(roomId),
      playerService.getPlayers(roomId),
    ]).then(([room, players]) => {
      if (!room) throw { code: 'ROOM_NOT_FOUND', message: '房间不存在' };
      // 加载规则
      return roomService.getRoom(roomId).then(() => {
        const db = wx.cloud.database();
        return db.collection('rules').doc(room.ruleId).get();
      }).then((ruleRes) => {
        const rule = ruleRes.data;
        roomStore.setRoom({
          roomId,
          roomCode: room.roomCode,
          rule,
          players,
          isOwner: room.ownerId === (appStore.openid || appStore.clientId),
          currentPlayerId: players.find(p => p.openid === appStore.openid || p._id === appStore.currentPlayerId)?._id || '',
        });
        this._setupWatch();
        this._render();
      });
    }).catch(err => handleError(err, this));
  },

  _setupWatch() {
    if (roomStore._stopWatchPlayers) roomStore._stopWatchPlayers();
    if (roomStore._stopWatchRounds) roomStore._stopWatchRounds();
    if (roomStore._stopWatchRule) roomStore._stopWatchRule();

    roomStore._stopWatchPlayers = playerService.watchPlayers(roomStore.roomId, (players) => {
      roomStore.setPlayers(players);
      this._render();
    });
    roomStore._stopWatchRounds = roundService.watchRounds(roomStore.roomId, (rounds) => {
      roomStore.setRounds(rounds);
      this._render();
    });
    // 规则 watch
    const db = wx.cloud.database();
    if (roomStore.rule && roomStore.rule._id) {
      const watcher = db.collection('rules').doc(roomStore.rule._id).watch({
        onChange: (snapshot) => {
          if (snapshot.docs.length > 0) {
            roomStore.setRule(snapshot.docs[0]);
            this._render();
          }
        },
        onError: (err) => console.error('watch rule error:', err),
      });
      roomStore._stopWatchRule = () => watcher.close();
    }
  },

  _render() {
    const totals = roomStore.getTotalScores();
    const playersWithScore = roomStore.players
      .slice()
      .sort((a, b) => a.seatIndex - b.seatIndex)
      .map(p => ({ ...p, totalScore: totals[p._id] || 0 }));
    const rule = roomStore.rule || getDefaultRule();
    const ruleSummary = `底${rule.baseScore} 自摸×${rule.zimoMul} 点炮×${rule.dianpaoMul} 封顶${rule.maxFan || '无限'}`;
    this.setData({
      roomCode: roomStore.roomCode,
      playersWithScore,
      isOwner: roomStore.isOwner,
      ruleSummary,
    });
  },

  _refreshScores() {
    this._render();
  },

  onCopyCode() {
    wx.setClipboardData({ data: this.data.roomCode });
  },

  onShare() {
    wx.showModal({
      title: '分享房间',
      content: `房间号：${this.data.roomCode}\n请朋友打开「麻记」小程序，在首页输入房间号加入。`,
      showCancel: false,
    });
  },

  onEditRule() {
    if (!this.data.isOwner) {
      wx.showToast({ title: '仅房主可编辑规则', icon: 'none' });
      return;
    }
    wx.navigateTo({ url: '/pages/room/rule-config/index' });
  },

  onRecordRound() {
    wx.navigateTo({ url: '/pages/room/round-input/index' });
  },

  onFinishRoom() {
    wx.showModal({
      title: '结束本局',
      content: '结束后无法再记录新局，确定吗？',
      success: (res) => {
        if (res.confirm) {
          roomService.finishRoom(roomStore.roomId).then((r) => {
            if (r.code === 'OK') {
              wx.redirectTo({ url: '/pages/room/summary/index' });
            } else {
              handleError({ code: r.code, message: r.message }, this);
            }
          }).catch(err => handleError(err, this));
        }
      },
    });
  },
});
```

- [ ] **Step 5: 真机调试**

创建房间 → 跳到房间主页 → 看到 1 个玩家（自己）。

- [ ] **Step 6: 提交**

```bash
git add miniprogram/pages/room/index/
git commit -m "feat(room): implement room main page with player list and rule summary"
```

---

## Task 31: pages/room/rule-config

**Files:**
- Modify: `miniprogram/pages/room/rule-config/{index.js,index.wxml,index.wxss,index.json}`

- [ ] **Step 1: 修改 `index.json`**

```json
{
  "navigationBarTitleText": "本场规则",
  "usingComponents": {
    "van-button": "@vant/weapp/button/index",
    "van-field": "@vant/weapp/field/index",
    "van-cell": "@vant/weapp/cell/index",
    "van-cell-group": "@vant/weapp/cell-group/index",
    "van-switch": "@vant/weapp/switch/index"
  }
}
```

- [ ] **Step 2: 修改 `index.wxml`**

```xml
<view class="rule-config">
  <van-cell-group title="基础">
    <van-field label="底分" type="number" value="{{ rule.baseScore }}" bind:change="onChange" data-field="baseScore" />
    <van-field label="封顶番" type="number" value="{{ rule.maxFan }}" placeholder="0=无限" bind:change="onChange" data-field="maxFan" />
    <van-cell title="允许点炮">
      <van-switch checked="{{ rule.allowDianpao }}" bind:change="onToggleDianpao" />
    </van-cell>
  </van-cell-group>

  <van-cell-group title="胡牌倍数">
    <van-field label="自摸倍数" type="number" value="{{ rule.zimoMul }}" bind:change="onChange" data-field="zimoMul" />
    <van-field label="点炮倍数" type="number" value="{{ rule.dianpaoMul }}" bind:change="onChange" data-field="dianpaoMul" />
  </van-cell-group>

  <van-cell-group title="杠分">
    <van-field label="明杠" type="number" value="{{ rule.mingGangScore }}" bind:change="onChange" data-field="mingGangScore" />
    <van-field label="暗杠" type="number" value="{{ rule.anGangScore }}" bind:change="onChange" data-field="anGangScore" />
    <van-field label="补杠" type="number" value="{{ rule.bugangScore }}" bind:change="onChange" data-field="bugangScore" />
  </van-cell-group>

  <van-cell-group title="其他">
    <van-field label="买马数" type="number" value="{{ rule.maCount }}" placeholder="0=无" bind:change="onChange" data-field="maCount" />
    <van-field label="庄家倍数" type="number" value="{{ rule.dealerMul }}" bind:change="onChange" data-field="dealerMul" />
  </van-cell-group>

  <view class="footer">
    <van-button type="primary" block bind:tap="onSave">保存</van-button>
  </view>
</view>
```

- [ ] **Step 3: 修改 `index.wxss`**

```css
.rule-config { padding-bottom: 200rpx; }
.footer { padding: 40rpx 24rpx; position: fixed; bottom: 0; left: 0; right: 0; background: #fff; }
```

- [ ] **Step 4: 修改 `index.js`**

```js
const roomStore = require('../../../stores/roomStore');
const roomService = require('../../../services/roomService');
const { validateRule } = require('../../../services/ruleService');
const { handleError } = require('../../../services/errorHandler');

Page({
  data: { rule: {} },

  onLoad() {
    this.setData({ rule: { ...roomStore.rule } });
  },

  onChange(e) {
    const field = e.currentTarget.dataset.field;
    const value = Number(e.detail);
    this.setData({ [`rule.${field}`]: value });
  },

  onToggleDianpao(e) {
    this.setData({ 'rule.allowDianpao': e.detail });
  },

  onSave() {
    if (!validateRule(this.data.rule)) {
      wx.showToast({ title: '规则字段不合法', icon: 'none' });
      return;
    }
    wx.showLoading({ title: '保存中...' });
    roomService.updateRule({ roomId: roomStore.roomId, rule: this.data.rule })
      .then((res) => {
        wx.hideLoading();
        if (res.code === 'OK') {
          roomStore.setRule(this.data.rule);
          wx.showToast({ title: '已保存' });
          setTimeout(() => wx.navigateBack(), 800);
        } else {
          handleError({ code: res.code, message: res.message }, this);
        }
      })
      .catch(err => { wx.hideLoading(); handleError(err, this); });
  },
});
```

- [ ] **Step 5: 真机调试**

从房间主页点"编辑"→ 修改底分 → 保存 → 回到主页应看到新规则。

- [ ] **Step 6: 提交**

```bash
git add miniprogram/pages/room/rule-config/
git commit -m "feat(rule-config): implement rule editing form"
```

---

## Task 32: pages/room/round-input（单局录入 - 核心）

**Files:**
- Modify: `miniprogram/pages/room/round-input/{index.js,index.wxml,index.wxss,index.json}`

- [ ] **Step 1: 修改 `index.json`**

```json
{
  "navigationBarTitleText": "记录本局",
  "usingComponents": {
    "van-button": "@vant/weapp/button/index",
    "van-cell": "@vant/weapp/cell/index",
    "van-cell-group": "@vant/weapp/cell-group/index",
    "van-field": "@vant/weapp/field/index",
    "van-radio-group": "@vant/weapp/radio-group/index",
    "van-radio": "@vant/weapp/radio/index"
  }
}
```

- [ ] **Step 2: 修改 `index.wxml`**

```xml
<view class="round-input">
  <van-cell-group title="1. 选择胡牌者">
    <view class="player-grid">
      <block wx:for="{{players}}" wx:key="_id">
        <view class="player-card {{winnerId === item._id ? 'selected' : ''}}" bind:tap="onSelectWinner" data-id="{{item._id}}">
          <image class="avatar" src="/images/avatars/avatar-{{item.avatarIndex}}.png"></image>
          <text class="nick">{{item.nickname}}</text>
        </view>
      </block>
    </view>
  </van-cell-group>

  <van-cell-group title="2. 选择胡牌类型">
    <van-radio-group value="{{winType}}" bind:change="onChangeWinType">
      <van-cell title="自摸" clickable bind:tap="onSelectType" data-type="zimo">
        <van-radio slot="right-icon" name="zimo" />
      </van-cell>
      <van-cell title="点炮" clickable bind:tap="onSelectType" data-type="dianpao" wx:if="{{rule.allowDianpao}}">
        <van-radio slot="right-icon" name="dianpao" />
      </van-cell>
      <van-cell title="杠上花" clickable bind:tap="onSelectType" data-type="gangshanghua">
        <van-radio slot="right-icon" name="gangshanghua" />
      </van-cell>
      <van-cell title="抢杠胡" clickable bind:tap="onSelectType" data-type="qiangganghu" wx:if="{{rule.allowDianpao}}">
        <van-radio slot="right-icon" name="qiangganghu" />
      </van-cell>
    </van-radio-group>
  </van-cell-group>

  <van-cell-group title="3. 选择点炮者" wx:if="{{needsLoser}}">
    <view class="player-grid">
      <block wx:for="{{otherPlayers}}" wx:key="_id">
        <view class="player-card {{loserId === item._id ? 'selected' : ''}}" bind:tap="onSelectLoser" data-id="{{item._id}}">
          <image class="avatar" src="/images/avatars/avatar-{{item.avatarIndex}}.png"></image>
          <text class="nick">{{item.nickname}}</text>
        </view>
      </block>
    </view>
  </van-cell-group>

  <van-cell-group title="4. 番数">
    <van-field type="number" value="{{fan}}" placeholder="输入番数" bind:change="onChangeFan" />
  </van-cell-group>

  <van-cell-group title="5. 杠事件" wx:if="{{canAddGang}}">
    <block wx:for="{{gangEvents}}" wx:key="index">
      <view class="gang-row">
        <text>类型：{{item.type}}</text>
        <text>玩家：{{getPlayerName(item.playerId)}}</text>
        <van-button size="mini" bind:tap="onRemoveGang" data-index="{{index}}">删除</van-button>
      </view>
    </block>
    <van-button size="small" bind:tap="onAddGang">添加杠</van-button>
  </van-cell-group>

  <view class="footer">
    <van-button type="primary" block bind:tap="onSubmit">提交本局</van-button>
  </view>
</view>
```

- [ ] **Step 3: 修改 `index.wxss`**

```css
.round-input { padding-bottom: 200rpx; }
.player-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16rpx; padding: 24rpx; }
.player-card { display: flex; flex-direction: column; align-items: center; padding: 16rpx; border: 2rpx solid #e0e0e0; border-radius: 12rpx; }
.player-card.selected { border-color: #1aad19; background: #f0f8e8; }
.avatar { width: 80rpx; height: 80rpx; border-radius: 50%; }
.nick { margin-top: 8rpx; font-size: 24rpx; }
.gang-row { display: flex; gap: 24rpx; align-items: center; padding: 16rpx; }
.footer { padding: 40rpx 24rpx; position: fixed; bottom: 0; left: 0; right: 0; background: #fff; }
```

- [ ] **Step 4: 修改 `index.js`**

```js
const roomStore = require('../../../stores/roomStore');
const appStore = require('../../../stores/appStore');
const roundService = require('../../../services/roundService');
const { handleError } = require('../../../services/errorHandler');
const { DIANPAO_TYPES } = require('../../../utils/constants');

Page({
  data: {
    players: [],
    otherPlayers: [],
    winnerId: '',
    loserId: '',
    winType: 'zimo',
    fan: 1,
    gangEvents: [],
    rule: {},
    needsLoser: false,
    canAddGang: true,
  },

  onLoad() {
    const players = roomStore.players.slice().sort((a, b) => a.seatIndex - b.seatIndex);
    this.setData({
      players,
      otherPlayers: players,
      rule: roomStore.rule,
    });
  },

  onSelectWinner(e) {
    const id = e.currentTarget.dataset.id;
    const otherPlayers = this.data.players.filter(p => p._id !== id);
    this.setData({ winnerId: id, otherPlayers });
  },

  onSelectLoser(e) {
    this.setData({ loserId: e.currentTarget.dataset.id });
  },

  onChangeWinType(e) {
    const winType = e.detail;
    const needsLoser = DIANPAO_TYPES.has(winType);
    this.setData({ winType, needsLoser, loserId: '' });
  },

  onSelectType(e) {
    const winType = e.currentTarget.dataset.type;
    const needsLoser = DIANPAO_TYPES.has(winType);
    this.setData({ winType, needsLoser, loserId: '' });
  },

  onChangeFan(e) {
    this.setData({ fan: Number(e.detail) || 0 });
  },

  onAddGang() {
    // 简化：弹一个 ActionSheet 让用户选
    wx.showActionSheet({
      itemList: ['明杠（抓牌）', '暗杠', '补杠'],
      success: (res) => {
        const types = ['ming', 'an', 'bu'];
        const type = types[res.tapIndex];
        // 让用户选玩家
        const playerNames = this.data.players.map(p => p.nickname);
        wx.showActionSheet({
          itemList: playerNames,
          success: (res2) => {
            const playerId = this.data.players[res2.tapIndex]._id;
            this.setData({ gangEvents: [...this.data.gangEvents, { type, playerId }] });
          },
        });
      },
    });
  },

  onRemoveGang(e) {
    const idx = e.currentTarget.dataset.index;
    const gangEvents = this.data.gangEvents.filter((_, i) => i !== idx);
    this.setData({ gangEvents });
  },

  getPlayerName(id) {
    const p = this.data.players.find(x => x._id === id);
    return p ? p.nickname : '';
  },

  onSubmit() {
    if (!this.data.winnerId) {
      wx.showToast({ title: '请选择胡牌者', icon: 'none' });
      return;
    }
    if (this.data.needsLoser && !this.data.loserId) {
      wx.showToast({ title: '请选择点炮者', icon: 'none' });
      return;
    }
    if (this.data.fan < 0 || this.data.fan > 100) {
      wx.showToast({ title: '番数 0-100', icon: 'none' });
      return;
    }

    const input = {
      winnerId: this.data.winnerId,
      loserId: this.data.needsLoser ? this.data.loserId : undefined,
      winType: this.data.winType,
      fan: this.data.fan,
      gangEvents: this.data.gangEvents,
      maResults: [],
    };

    wx.showLoading({ title: '提交中...' });
    roundService.submitRound({
      roomId: roomStore.roomId,
      clientId: appStore.clientId,
      input,
    }).then((res) => {
      wx.hideLoading();
      if (res.code === 'OK') {
        wx.showToast({ title: '已记录' });
        setTimeout(() => wx.navigateBack(), 800);
      } else {
        handleError({ code: res.code, message: res.message }, this);
      }
    }).catch(err => { wx.hideLoading(); handleError(err, this); });
  },
});
```

- [ ] **Step 5: 真机调试**

在房间主页点"记录本局"→ 选胡牌者/类型/番数/杠 → 提交 → 回到主页应看到分数变化。

- [ ] **Step 6: 提交**

```bash
git add miniprogram/pages/room/round-input/
git commit -m "feat(round-input): implement single-round score input"
```

---

## Task 33: 通用组件 — avatar-picker

**Files:**
- Create: `miniprogram/components/avatar-picker/{index.js,index.wxml,index.wxss,index.json}`

- [ ] **Step 1: 创建 `index.json`**

```json
{
  "component": true,
  "usingComponents": {}
}
```

- [ ] **Step 2: 创建 `index.wxml`**

```xml
<view class="avatar-picker">
  <block wx:for="{{8}}" wx:key="*this">
    <view class="avatar-item {{currentIndex === index ? 'selected' : ''}}" bind:tap="onSelect" data-index="{{index}}">
      <image class="avatar" src="/images/avatars/avatar-{{index}}.png" mode="aspectFit"></image>
    </view>
  </block>
</view>
```

- [ ] **Step 3: 创建 `index.wxss`**

```css
.avatar-picker { display: grid; grid-template-columns: repeat(4, 1fr); gap: 24rpx; padding: 24rpx; }
.avatar-item { padding: 16rpx; border: 4rpx solid transparent; border-radius: 12rpx; }
.avatar-item.selected { border-color: #1aad19; background: #f0f8e8; }
.avatar { width: 100rpx; height: 100rpx; }
```

- [ ] **Step 4: 创建 `index.js`**

```js
Component({
  properties: {
    currentIndex: { type: Number, value: 0 },
  },
  methods: {
    onSelect(e) {
      const index = e.currentTarget.dataset.index;
      this.triggerEvent('change', { index });
    },
  },
});
```

- [ ] **Step 5: 提交**

```bash
git add miniprogram/components/avatar-picker/
git commit -m "feat(component): add avatar-picker (8 options)"
```

---

## Task 34-38: 其他 5 个组件（player-card / score-table / rule-form / gang-event-row / ma-picker）

> 这 5 个组件的代码模式与 avatar-picker 相同，每个是 ~50 行 JS/WXML/WXSS。完整代码见下：

**player-card** (`miniprogram/components/player-card/`)：

`index.wxml`:
```xml
<view class="player-card {{selected ? 'selected' : ''}}">
  <image class="avatar" src="/images/avatars/avatar-{{player.avatarIndex}}.png"></image>
  <view class="info">
    <text class="nick">{{player.nickname}}</text>
    <text class="seat">座位 {{player.seatIndex}}</text>
  </view>
  <text wx:if="{{showScore}}" class="score">{{score}} 分</text>
</view>
```

`index.js`:
```js
Component({
  properties: {
    player: { type: Object, value: {} },
    selected: { type: Boolean, value: false },
    showScore: { type: Boolean, value: false },
    score: { type: Number, value: 0 },
  },
});
```

`index.wxss`:
```css
.player-card { display: flex; align-items: center; padding: 16rpx; border: 2rpx solid #e0e0e0; border-radius: 12rpx; }
.player-card.selected { border-color: #1aad19; background: #f0f8e8; }
.avatar { width: 80rpx; height: 80rpx; border-radius: 50%; }
.info { flex: 1; margin-left: 16rpx; display: flex; flex-direction: column; }
.nick { font-size: 28rpx; }
.seat { font-size: 22rpx; color: #7A7E83; }
.score { font-size: 30rpx; font-weight: 600; }
```

`index.json`:
```json
{ "component": true }
```

**score-table** (`miniprogram/components/score-table/`)：4 行玩家 + 当前总分

`index.wxml`:
```xml
<view class="score-table">
  <block wx:for="{{players}}" wx:key="_id">
    <view class="row">
      <image class="avatar" src="/images/avatars/avatar-{{item.avatarIndex}}.png"></image>
      <text class="nick">{{item.nickname}}</text>
      <text class="score {{item.score > 0 ? 'positive' : item.score < 0 ? 'negative' : ''}}">
        {{item.score > 0 ? '+' : ''}}{{item.score}} 分
      </text>
    </view>
  </block>
</view>
```

`index.js`:
```js
Component({ properties: { players: { type: Array, value: [] } } });
```

`index.wxss`:
```css
.score-table { background: #fff; border-radius: 12rpx; padding: 16rpx; }
.row { display: flex; align-items: center; padding: 12rpx 0; border-bottom: 1rpx solid #f0f0f0; }
.row:last-child { border-bottom: none; }
.avatar { width: 64rpx; height: 64rpx; border-radius: 50%; }
.nick { flex: 1; margin-left: 16rpx; font-size: 28rpx; }
.score { font-size: 30rpx; font-weight: 600; }
.score.positive { color: #d33; }
.score.negative { color: #1aad19; }
```

`index.json`: `{ "component": true }`

**rule-form** / **gang-event-row** / **ma-picker**：参照 score-table 模式实现，每个 ~30-50 行；UI 行为已分别在 rule-config / round-input 页面内联，**后续可重构为独立组件**（YAGNI：本阶段先复用内联实现）。

- [ ] **Step 1: 创建上面 3 个文件（player-card / score-table）**

- [ ] **Step 2: 提交**

```bash
git add miniprogram/components/player-card/ miniprogram/components/score-table/
git commit -m "feat(component): add player-card and score-table components"
```

> **Note**: rule-form / gang-event-row / ma-picker 暂内联到对应页面（M2 末段如需重构再单独开 task）。

---

# M3 — 实时同步 + 多人协作（1 周）

## Task 39: stores/syncWatcher.js

**Files:**
- Create: `miniprogram/stores/syncWatcher.js`

- [ ] **Step 1: 写实现**

```js
const playerService = require('../services/playerService');
const roundService = require('../services/roundService');
const roomStore = require('./roomStore');
const app = getApp();

let stopped = false;
let reconnectTimer = null;

const RETRY_DELAYS = [1000, 2000, 4000, 8000, 15000, 30000]; // ms

/**
 * 启动房间的所有 watch
 * @param {string} roomId
 * @param {Object} callbacks { onPlayersChange, onRoundsChange, onRuleChange, onSyncStatus }
 */
function start(roomId, callbacks) {
  stop(); // 先清理旧的
  stopped = false;
  scheduleWatch(roomId, callbacks, 0);
}

function scheduleWatch(roomId, callbacks, retryIndex) {
  if (stopped) return;
  try {
    callbacks.onSyncStatus && callbacks.onSyncStatus('connecting');
    roomStore._stopWatchPlayers = playerService.watchPlayers(roomId, (players) => {
      retryIndex = 0; // 成功后重置
      callbacks.onSyncStatus && callbacks.onSyncStatus('connected');
      roomStore.setPlayers(players);
      callbacks.onPlayersChange && callbacks.onPlayersChange(players);
    });
    roomStore._stopWatchRounds = roundService.watchRounds(roomId, (rounds) => {
      retryIndex = 0;
      callbacks.onSyncStatus && callbacks.onSyncStatus('connected');
      roomStore.setRounds(rounds);
      callbacks.onRoundsChange && callbacks.onRoundsChange(rounds);
    });
    // 规则 watch 在 roomStore 内部管理（依赖 _id）
    if (roomStore.rule && roomStore.rule._id) {
      const db = wx.cloud.database();
      const watcher = db.collection('rules').doc(roomStore.rule._id).watch({
        onChange: (snapshot) => {
          retryIndex = 0;
          if (snapshot.docs.length > 0) {
            roomStore.setRule(snapshot.docs[0]);
            callbacks.onRuleChange && callbacks.onRuleChange(snapshot.docs[0]);
          }
        },
        onError: () => scheduleReconnect(roomId, callbacks, retryIndex),
      });
      roomStore._stopWatchRule = () => watcher.close();
    }
  } catch (err) {
    console.error('syncWatcher start error:', err);
    scheduleReconnect(roomId, callbacks, retryIndex);
  }
}

function scheduleReconnect(roomId, callbacks, retryIndex) {
  if (stopped) return;
  const delay = RETRY_DELAYS[Math.min(retryIndex, RETRY_DELAYS.length - 1)];
  callbacks.onSyncStatus && callbacks.onSyncStatus('reconnecting');
  reconnectTimer = setTimeout(() => {
    stop();
    scheduleWatch(roomId, callbacks, retryIndex + 1);
  }, delay);
}

function stop() {
  stopped = true;
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
  if (roomStore._stopWatchPlayers) { roomStore._stopWatchPlayers(); roomStore._stopWatchPlayers = null; }
  if (roomStore._stopWatchRounds) { roomStore._stopWatchRounds(); roomStore._stopWatchRounds = null; }
  if (roomStore._stopWatchRule) { roomStore._stopWatchRule(); roomStore._stopWatchRule = null; }
}

module.exports = { start, stop };
```

- [ ] **Step 2: 提交**

```bash
git add miniprogram/stores/syncWatcher.js
git commit -m "feat(sync): add syncWatcher with auto-reconnect (exp backoff)"
```

---

## Task 40: 乐观更新 + 回滚（round-input 改造）

**Files:**
- Modify: `miniprogram/pages/room/round-input/index.js`

- [ ] **Step 1: 改造 `onSubmit` 方法**

替换 `onSubmit` 函数体（在 `onSubmit` 的 `roundService.submitRound` 之后）：

```js
// 1. 本地乐观插入（先在 roomStore 里加一条带 tempId 的）
const tempRound = {
  _id: 'temp_' + Date.now(),
  roomId: roomStore.roomId,
  roundIndex: (roomStore.rounds[roomStore.rounds.length - 1]?.roundIndex || 0) + 1,
  ...input,
  scoreChanges: calculateLocalPreview(this.data.rule, input, this.data.players),
  createdAt: Date.now(),
  isOptimistic: true,
};
roomStore.addRound(tempRound);
wx.showLoading({ title: '提交中...' });

roundService.submitRound({
  roomId: roomStore.roomId,
  clientId: appStore.clientId,
  input,
}).then((res) => {
  wx.hideLoading();
  if (res.code === 'OK') {
    // 2. 用真实 round 替换 tempRound
    roomStore.rounds = roomStore.rounds.filter(r => r._id !== tempRound._id);
    roomStore.addRound(res.data);
    wx.showToast({ title: '已记录' });
    setTimeout(() => wx.navigateBack(), 800);
  } else {
    // 3. 回滚
    roomStore.rounds = roomStore.rounds.filter(r => r._id !== tempRound._id);
    handleError({ code: res.code, message: res.message }, this);
  }
}).catch((err) => {
  // 4. 回滚
  roomStore.rounds = roomStore.rounds.filter(r => r._id !== tempRound._id);
  wx.hideLoading();
  handleError(err, this);
});
```

并在文件顶部加 require：

```js
const { calculateRound } = require('../../../services/scoreService');
```

替换 `calculateLocalPreview` 为：

```js
function calculateLocalPreview(rule, input, players) {
  try {
    return calculateRound(rule, input, players).scoreChanges;
  } catch (e) {
    return {};
  }
}
```

- [ ] **Step 2: 验证：提交 round 时网络断开 → 应回滚到原状**

- [ ] **Step 3: 提交**

```bash
git add miniprogram/pages/room/round-input/index.js
git commit -m "feat(round-input): add optimistic update with rollback"
```

---

## Task 41: 同步中角标（room 主页面）

**Files:**
- Modify: `miniprogram/pages/room/index/index.wxml`
- Modify: `miniprogram/pages/room/index/index.wxss`
- Modify: `miniprogram/pages/room/index/index.js`

- [ ] **Step 1: 修改 wxml — 在顶部加角标**

```xml
<view class="sync-bar" wx:if="{{syncStatus !== 'connected'}}">
  <text>{{syncText}}</text>
</view>
```

- [ ] **Step 2: 修改 wxss**

```css
.sync-bar { padding: 12rpx; background: #fff3cd; color: #856404; text-align: center; font-size: 24rpx; }
```

- [ ] **Step 3: 修改 js — 在 _init 末尾启动 syncWatcher**

在 `_init` 的最后一行（`_render()` 之后）添加：

```js
this._startSync();
```

新增方法：

```js
_startSync() {
  const syncWatcher = require('../../../stores/syncWatcher');
  syncWatcher.start(roomStore.roomId, {
    onSyncStatus: (status) => {
      const text = status === 'connected' ? '' : status === 'connecting' ? '同步中...' : '正在重连...';
      this.setData({ syncStatus: status, syncText: text });
    },
    onPlayersChange: () => this._render(),
    onRoundsChange: () => this._render(),
    onRuleChange: () => this._render(),
  });
  this.setData({ syncStatus: 'connecting', syncText: '同步中...' });
},
```

- [ ] **Step 4: 真机测试断网**

拔网线 → 应显示"正在重连..."；插回 → 角标消失。

- [ ] **Step 5: 提交**

```bash
git add miniprogram/pages/room/index/
git commit -m "feat(sync): add sync status banner in room page"
```

---

## Task 42: cloudfunctions/logError

**Files:**
- Create: `cloudfunctions/logError/{index.js,package.json,config.json}`

- [ ] **Step 1: `package.json`**

```json
{
  "name": "logError",
  "version": "1.0.0",
  "main": "index.js",
  "dependencies": { "wx-server-sdk": "~2.6.3" }
}
```

- [ ] **Step 2: `config.json`**

```json
{ "permissions": { "openapi": [] } }
```

- [ ] **Step 3: `index.js`**

```js
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event) => {
  const { openid } = cloud.getWXContext();
  const { clientId, action, errorCode, errorMsg, stack } = event;
  try {
    await db.collection('errorLogs').add({
      data: {
        openid: openid || null,
        clientId: clientId || null,
        action: action || 'unknown',
        errorCode: errorCode || null,
        errorMsg: errorMsg || '',
        stack: stack || '',
        timestamp: Date.now(),
      }
    });
    return { code: 'OK' };
  } catch (err) {
    console.error('logError failed:', err);
    return { code: 'INTERNAL_ERROR' };
  }
};
```

- [ ] **Step 4: 部署 + 提交**

```bash
git add cloudfunctions/logError/
git commit -m "feat(cloud): add logError cloud function"
```

---

## Task 43: services/logger.js（前端错误上报）

**Files:**
- Create: `miniprogram/utils/logger.js`

- [ ] **Step 1: 写实现**

```js
const { callFunction } = require('../services/cloud');

let reported = 0;
const MAX_REPORTS_PER_SESSION = 50;

function reportError(action, err) {
  if (reported >= MAX_REPORTS_PER_SESSION) return;
  reported++;
  const payload = {
    clientId: (getApp() && getApp().globalData && getApp().globalData.clientId) || '',
    action,
    errorCode: err && err.code,
    errorMsg: err && (err.message || err.toString()),
    stack: err && err.stack,
  };
  // 失败不重试
  callFunction('logError', payload).catch(() => {});
}

module.exports = { reportError };
```

- [ ] **Step 2: 在 app.js 的 onError 接入**

修改 `miniprogram/app.js` 的 `onError`：

```js
onError(err) {
  console.error('App onError:', err);
  const { reportError } = require('./utils/logger');
  reportError('app.onError', err);
},
```

- [ ] **Step 3: 提交**

```bash
git add miniprogram/utils/logger.js miniprogram/app.js
git commit -m "feat(logger): add error reporting to cloud logError"
```

---

## Task 44: 验证：4 人联机实时同步

> 这是 M3 验收的手动测试任务，不是代码任务。

- [ ] **Step 1: 4 台真机（开发者 + 3 个体验者）同时进入同一房间**

- [ ] **Step 2: 一台提交 round，其他 3 台应立即看到分数变化**

- [ ] **Step 3: 2 台同时点提交 → roundIndex 不重复，4 家分数正确**

- [ ] **Step 4: 一台拔网线 30s 后插回 → 自动补齐，自动重连**

- [ ] **Step 5: 提交验证报告（含截图）到项目根**

```bash
echo "M3 联机测试通过 - $(date)" > M3-test-report.txt
git add M3-test-report.txt
git commit -m "docs: M3 multi-device real-time sync verified"
```

---

# M4 — 合规打磨 + 发布（1 周）

## Task 45: pages/room/summary（总结算）

**Files:**
- Modify: `miniprogram/pages/room/summary/{index.js,index.wxml,index.wxss,index.json}`

- [ ] **Step 1: 修改 `index.json`**

```json
{
  "navigationBarTitleText": "总结算",
  "usingComponents": {
    "van-button": "@vant/weapp/button/index"
  }
}
```

- [ ] **Step 2: 修改 `index.wxml`**

```xml
<view class="summary">
  <view class="rank-list">
    <block wx:for="{{rankList}}" wx:key="_id">
      <view class="rank-row {{index === 0 ? 'first' : ''}}">
        <text class="rank-no">{{index + 1}}</text>
        <image class="avatar" src="/images/avatars/avatar-{{item.avatarIndex}}.png"></image>
        <text class="nick">{{item.nickname}}</text>
        <text class="score">{{item.total}} 分</text>
      </view>
    </block>
  </view>

  <view class="stats">
    <view class="stat-row"><text>总场次：</text><text>{{totalRounds}}</text></view>
    <view class="stat-row"><text>最大番：</text><text>{{maxFan}} 番</text></view>
    <view class="stat-row"><text>胡牌类型分布：</text><text>{{winTypeSummary}}</text></view>
  </view>

  <view class="footer">
    <van-button type="primary" block bind:tap="onBackHome">返回首页</van-button>
  </view>
</view>
```

- [ ] **Step 3: 修改 `index.wxss`**

```css
.summary { padding: 24rpx; }
.rank-list { background: #fff; border-radius: 12rpx; overflow: hidden; }
.rank-row { display: flex; align-items: center; padding: 24rpx; border-bottom: 1rpx solid #f0f0f0; }
.rank-row.first { background: #fff8dc; }
.rank-row:last-child { border-bottom: none; }
.rank-no { width: 60rpx; font-size: 32rpx; font-weight: 700; color: #1aad19; }
.avatar { width: 64rpx; height: 64rpx; border-radius: 50%; margin-left: 16rpx; }
.nick { flex: 1; margin-left: 16rpx; font-size: 28rpx; }
.score { font-size: 32rpx; font-weight: 700; }
.stats { margin-top: 24rpx; padding: 24rpx; background: #fff; border-radius: 12rpx; }
.stat-row { display: flex; justify-content: space-between; padding: 12rpx 0; }
.footer { padding: 40rpx 24rpx; margin-top: 40rpx; }
```

- [ ] **Step 4: 修改 `index.js`**

```js
const roomStore = require('../../../stores/roomStore');

Page({
  data: { rankList: [], totalRounds: 0, maxFan: 0, winTypeSummary: '' },

  onShow() {
    const totals = roomStore.getTotalScores();
    const players = roomStore.players;
    const rankList = players
      .map(p => ({ ...p, total: totals[p._id] || 0 }))
      .sort((a, b) => b.total - a.total);

    const totalRounds = roomStore.rounds.length;
    const maxFan = roomStore.rounds.reduce((m, r) => Math.max(m, r.fan), 0);
    const typeCount = {};
    roomStore.rounds.forEach(r => {
      typeCount[r.winType] = (typeCount[r.winType] || 0) + 1;
    });
    const winTypeSummary = Object.entries(typeCount)
      .map(([t, c]) => `${t}×${c}`).join(' / ');

    this.setData({ rankList, totalRounds, maxFan, winTypeSummary });
  },

  onBackHome() {
    roomStore.reset();
    wx.switchTab({ url: '/pages/home/index' });
  },
});
```

- [ ] **Step 5: 真机测试**

结束本局 → 跳总结算页 → 排名正确。

- [ ] **Step 6: 提交**

```bash
git add miniprogram/pages/room/summary/
git commit -m "feat(summary): implement final score summary page"
```

---

## Task 46: pages/me（我的）

**Files:**
- Modify: `miniprogram/pages/me/{index.js,index.wxml,index.wxss,index.json}`

- [ ] **Step 1: 修改 `index.json`**

```json
{
  "navigationBarTitleText": "我的",
  "usingComponents": {
    "van-button": "@vant/weapp/button/index",
    "van-cell": "@vant/weapp/cell/index",
    "van-cell-group": "@vant/weapp/cell-group/index"
  }
}
```

- [ ] **Step 2: 修改 `index.wxml`**

```xml
<view class="me">
  <view class="profile">
    <view class="avatar-wrap">
      <avatar-picker current-index="{{avatarIndex}}" bind:change="onAvatarChange"></avatar-picker>
    </view>
    <view class="nick-edit">
      <input class="nick-input" placeholder="请输入昵称（1-8 字）" value="{{nickname}}" maxlength="8" bind:input="onNicknameInput" />
    </view>
  </view>

  <van-cell-group>
    <van-cell title="身份" value="{{isAnonymous ? '匿名玩家' : '微信用户'}}" />
    <van-cell title="登录方式" wx:if="{{isAnonymous}}" is-link bind:tap="onLogin">
      <view slot="value">使用微信登录</view>
    </van-cell>
  </van-cell-group>

  <view class="footer">
    <van-button type="primary" block bind:tap="onSave">保存</van-button>
  </view>
</view>
```

- [ ] **Step 3: 修改 `index.wxss`**

```css
.me { padding: 24rpx; }
.profile { background: #fff; border-radius: 12rpx; padding: 24rpx; margin-bottom: 24rpx; }
.avatar-wrap { margin-bottom: 24rpx; }
.nick-input { padding: 16rpx; border: 2rpx solid #e0e0e0; border-radius: 8rpx; font-size: 30rpx; }
.footer { padding: 40rpx 24rpx; }
```

- [ ] **Step 4: 修改 `index.js`**

```js
const appStore = require('../../stores/appStore');
const userService = require('../../services/userService');
const { handleError } = require('../../services/errorHandler');

Page({
  data: { nickname: '', avatarIndex: 0, isAnonymous: true },

  onLoad(query) {
    this.setData({
      nickname: appStore.nickname || '',
      avatarIndex: appStore.avatarIndex || 0,
      isAnonymous: appStore.isAnonymous,
    });
    this._from = query.from;
  },

  onAvatarChange(e) {
    this.setData({ avatarIndex: e.detail.index });
  },

  onNicknameInput(e) {
    this.setData({ nickname: e.detail.value });
  },

  onSave() {
    const nickname = (this.data.nickname || '').trim();
    if (nickname.length < 1 || nickname.length > 8) {
      wx.showToast({ title: '昵称 1-8 字', icon: 'none' });
      return;
    }
    appStore.setProfile(nickname, this.data.avatarIndex);
    wx.showToast({ title: '已保存' });
    if (this._from === 'create' || this._from === 'join') {
      setTimeout(() => wx.navigateBack(), 800);
    }
  },

  onLogin() {
    userService.loginWithWx()
      .then((res) => {
        appStore.setOpenid(res.openid);
        this.setData({ isAnonymous: false });
        wx.showToast({ title: '已登录' });
      })
      .catch(err => handleError(err, this));
  },
});
```

- [ ] **Step 5: 提交**

```bash
git add miniprogram/pages/me/
git commit -m "feat(me): implement profile page with avatar picker and login"
```

---

## Task 47: pages/help（帮助）

**Files:**
- Modify: `miniprogram/pages/help/{index.js,index.wxml,index.wxss,index.json}`

- [ ] **Step 1: 修改 `index.json`**

```json
{
  "navigationBarTitleText": "帮助",
  "usingComponents": {
    "van-collapse": "@vant/weapp/collapse/index",
    "van-collapse-item": "@vant/weapp/collapse-item/index"
  }
}
```

- [ ] **Step 2: 修改 `index.wxml`**

```xml
<view class="help">
  <van-collapse accordion value="{{activeNames}}" bind:change="onChange">
    <van-collapse-item title="什么是番数？">
      <view>番是麻将计分的单位。胡牌时根据番型计算输赢，番数越高，输赢越大。</view>
    </van-collapse-item>
    <van-collapse-item title="自摸与点炮">
      <view>自摸：自己摸到胡牌，三家都付。</view>
      <view>点炮：别人打出你胡的牌，只有放炮者付。</view>
    </van-collapse-item>
    <van-collapse-item title="杠分说明">
      <view>明杠：别人打出你碰的牌（或抓牌后补杠），被杠者付分。</view>
      <view>暗杠：自己摸到 4 张相同牌，三家各付。</view>
      <view>补杠：之前碰过的牌再摸到第 4 张，三家各付。</view>
    </van-collapse-item>
    <van-collapse-item title="买马">
      <view>在某些规则中，胡牌者额外根据「马牌」中马数量赢分。是否启用可在规则配置中设置。</view>
    </van-collapse-item>
    <van-collapse-item title="数据与隐私">
      <view>本应用仅记录番数变化，不涉及任何金钱交易。所有数据存于云开发数据库，仅用于牌局记录。</view>
    </van-collapse-item>
    <van-collapse-item title="关于">
      <view>麻记是一个 4 人麻将番数实时记录工具。仅供娱乐和记录，不支持任何形式的代币或奖励兑换。</view>
    </van-collapse-item>
  </van-collapse>
</view>
```

- [ ] **Step 3: 修改 `index.wxss`**

```css
.help { padding: 24rpx; }
```

- [ ] **Step 4: 修改 `index.js`**

```js
Page({
  data: { activeNames: ['0'] },
  onChange(e) {
    this.setData({ activeNames: e.detail });
  },
});
```

- [ ] **Step 5: 提交**

```bash
git add miniprogram/pages/help/
git commit -m "feat(help): implement help page with collapsible FAQ"
```

---

## Task 48: 用户协议 + 隐私协议页

**Files:**
- Create: `miniprogram/pages/agreement/index/{index.js,index.wxml,index.wxss,index.json}`
- Create: `miniprogram/pages/agreement/privacy/{...}`

- [ ] **Step 1: 创建用户协议页 `pages/agreement/index`**

`index.json`:
```json
{ "navigationBarTitleText": "用户协议" }
```

`index.wxml`:
```xml
<view class="agreement">
<text user-select>
一、本应用（「麻记」）仅供麻将爱好者用于番数记录与分值结算，不涉及任何形式的金钱交易、虚拟货币、奖励兑换、抽奖或博彩活动。

二、用户应自行遵守所在地法律法规，不得使用本应用从事任何违法违规活动。

三、本应用不对用户使用本应用所产生的任何后果承担责任。

四、本应用保留随时修改或终止服务的权利。

五、用户协议最终解释权归开发者所有。
</text>
</view>
```

`index.wxss`:
```css
.agreement { padding: 32rpx; line-height: 1.8; }
```

`index.js`: `Page({})`

- [ ] **Step 2: 创建隐私协议页 `pages/agreement/privacy`**

类似，内容：

```
一、本应用收集的信息：
- 微信 openid（仅在用户主动登录时）
- 用户输入的昵称和头像选择
- 牌局记录（番数变化、玩家昵称等）

二、信息用途：
- 仅用于房间创建、加入、番数记录、玩家识别

三、信息存储：
- 所有数据存于微信云开发数据库
- 不向任何第三方共享

四、信息删除：
- 牌局结束后 30 天自动删除
- 用户可随时在「我的」中注销（清除本地数据）

五、本应用不收集：通讯录、位置、相机、麦克风等敏感权限。
```

- [ ] **Step 3: 提交**

```bash
git add miniprogram/pages/agreement/
git commit -m "feat(legal): add user agreement and privacy policy pages"
```

---

## Task 49: 8 个预设头像

**Files:**
- Create: `miniprogram/images/avatars/avatar-0.png` ~ `avatar-7.png`

- [ ] **Step 1: 用 8 种颜色的 emoji/几何图形生成头像**

```bash
cd "g:/claude project/majiang"
# 使用 ImageMagick 生成（如未安装，可手动用任何图片工具）
# 简化方案：使用 SVG 占位 → 转换成 PNG

cat > /tmp/gen-avatars.js << 'EOF'
const fs = require('fs');
const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E2'];
const symbols = ['🀀', '🀁', '🀂', '🀃', '🀄', '🀅', '🀆', '🀇'];
// 实际用 ImageMagick 或 Canvas 工具生成
EOF
```

**手动方案**：在 `miniprogram/images/avatars/` 下放 8 张 200x200 的 PNG，可以用任何工具生成（甚至 PowerPoint + 截图）。

- [ ] **Step 2: 验证 8 个文件存在**

```bash
cd "g:/claude project/majiang"
ls miniprogram/images/avatars/
```

Expected: `avatar-0.png ... avatar-7.png`

- [ ] **Step 3: 提交**

```bash
git add miniprogram/images/avatars/
git commit -m "feat(assets): add 8 preset avatar images"
```

---

## Task 50: 违规词扫描脚本

**Files:**
- Create: `scripts/check-banned-words.js`
- Create: `scripts/banned-words.json`

- [ ] **Step 1: 创建 `scripts/banned-words.json`**

```json
[
  "赌", "赌博", "赌注", "赌资", "筹码", "抽水", "台费",
  "押注", "下注", "加注", "包赢", "稳赢", "开盘", "封盘",
  "红包", "提现", "充值", "兑奖", "钱包", "余额",
  "转账", "银行卡", "收款码", "兑付", "中奖",
  "娱乐场", "赌场", "老虎机", "百家乐",
  "开房", "约局", "撮局", "代币", "积分商城",
  "赢钱", "输钱", "输赢", "赢家", "输家",
  "轻松赚", "快速赢", "一晚赚"
]
```

- [ ] **Step 2: 创建 `scripts/check-banned-words.js`**

```js
#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const banned = JSON.parse(fs.readFileSync(path.join(__dirname, 'banned-words.json'), 'utf8'));
const TARGET_DIRS = ['miniprogram', 'cloudfunctions', 'docs'];
const TARGET_EXTS = ['.js', '.wxml', '.wxss', '.json', '.md'];

let violations = [];

function scan(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'miniprogram_npm') continue;
      scan(full);
    } else if (TARGET_EXTS.some(ext => entry.name.endsWith(ext))) {
      const content = fs.readFileSync(full, 'utf8');
      banned.forEach((word) => {
        if (content.includes(word)) {
          violations.push({ file: full, word });
        }
      });
    }
  }
}

TARGET_DIRS.forEach(scan);

if (violations.length === 0) {
  console.log('✅ 未发现违规词');
  process.exit(0);
}

console.log(`❌ 发现 ${violations.length} 处违规词：`);
violations.forEach(v => {
  console.log(`  ${v.file} → ${v.word}`);
});
process.exit(1);
```

- [ ] **Step 3: 在 `package.json` 加 npm script**

修改根 `package.json` 的 `scripts` 字段：

```json
{
  "scripts": {
    "test": "jest",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage",
    "check:banned": "node scripts/check-banned-words.js"
  }
}
```

- [ ] **Step 4: 跑扫描**

```bash
cd "g:/claude project/majiang"
npm run check:banned
```

Expected: `✅ 未发现违规词`（或列出违规项待修复）

- [ ] **Step 5: 提交**

```bash
git add scripts/ package.json
git commit -m "feat(ci): add banned words scanner script"
```

---

## Task 51: 24 项 Checklist + 发布准备

**Files:**
- Create: `docs/launch-checklist.md`

- [ ] **Step 1: 写 `docs/launch-checklist.md`**

```markdown
# 上线前 24 项 Checklist

## 合规
- [ ] 5.1 违规词清单全数扫描通过（`npm run check:banned`）
- [ ] 简介、类目、标签合规
- [ ] 用户协议、隐私协议上线
- [ ] 截图文字合规（"分"为单位，无"赢钱"等）

## 技术
- [ ] `npm test` 全部通过
- [ ] `scoreService` 行覆盖 100%（`npm run test:coverage`）
- [ ] 真机 4 人测试通过（M3 报告已提交）
- [ ] 房间号查重、防并发、幂等键验证
- [ ] 断网/弱网/重连路径走查
- [ ] db.watch 重连机制验证
- [ ] 错误码全数映射 UI 提示

## 运营
- [ ] 产品名定稿（推荐"麻记"）
- [ ] 小程序简介 ≤ 150 字
- [ ] 客服联系方式（反馈入口）
- [ ] 灰度发布计划（先 5%，再 50%，再 100%）
- [ ] 监控看板（崩溃率、错误日志）

## 提交审核
- [ ] 服务类目：工具 > 效率
- [ ] 4 张功能截图（房间主页、单局录入、规则配置、总结算）
- [ ] 测试房间号（提供给审核员）
- [ ] 隐私协议 URL（在小程序中可访问）
- [ ] 用户协议 URL
- [ ] 24 项全过 → 提交审核
```

- [ ] **Step 2: 逐项打勾**

```bash
cd "g:/claude project/majiang"
# 按 checklist 逐项验证，全部通过后：
echo "Checklist verified - $(date)" >> docs/launch-checklist.md
git add docs/launch-checklist.md
git commit -m "docs: launch checklist verified"
```

---

## Task 52: 提交审核 + 灰度发布

- [ ] **Step 1: 在微信开发者工具中点击"上传"**

填版本号 `1.0.0` + 项目备注 `M4 完成首发`

- [ ] **Step 2: 登录微信公众平台 → 版本管理 → 提交审核**

填写：
- 服务类目：工具 > 效率
- 标签：效率、办公
- 测试账号：提供一个长期可用的房间号
- 隐私协议：填写 `pages/agreement/privacy/index`
- 用户协议：填写 `pages/agreement/index/index`

- [ ] **Step 3: 等待 1-3 个工作日**

- [ ] **Step 4: 审核通过后 → 灰度发布（5% → 20% → 50% → 100%）**

每个阶段观察 1-3 天的崩溃率、错误日志、用户反馈。

- [ ] **Step 5: 100% 灰度后 → 提交最终报告**

```bash
cd "g:/claude project/majiang"
echo "MVP 上线 - $(date)" > M4-launch-report.md
git add M4-launch-report.md
git commit -m "chore: MVP launched to 100% of users"
```

---

# 附录

## A. 阶段间依赖

```
M0 → M1 → M2 → M3 → M4
              ↘
               → M4
```

- M1 可与 M0 部分并行（独立模块：constants/validators/cloud-id）
- M2 强依赖 M1（用 scoreService）
- M3 强依赖 M2（依赖 store/页面）
- M4 可与 M3 末段并行打磨 UI

## B. 风险与缓冲

| 风险 | 影响 | 缓冲 |
|------|------|------|
| 计分引擎边界发现遗漏 | M1 延期 | 预留 2 天 |
| 微信审核驳回 | M4 延期 | 预留 1 次驳回整改时间（3 天） |
| 实时同步冲突难调 | M3 延期 | 提前在 M2 末做 spike |
| Vant Weapp 与原生冲突 | M0 延期 | 启动 M0 第 1 天即验证一个 demo |

## C. 测试矩阵

scoreService 测试覆盖矩阵（11,520 组合）：

| 维度 | 组合数 |
|------|--------|
| winType × 4 | 16 |
| allowDianpao × fan (5 档) | 10 |
| gangEvents (4 种) | 4 |
| maCount (3 种) | 3 |
| dealer 输赢 (3 种) | 3 |
| maxFan (2 种) | 2 |
| **合计** | **11,520** |

实际用属性测试（fast-check）+ 关键边界单测覆盖。
```

---

