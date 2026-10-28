const { makeCloud } = require('../helpers/fakeCloud');
let mockCloud;
jest.mock('wx-server-sdk', () => ({
  init: (...args) => mockCloud.init(...args),
  getWXContext: () => mockCloud.getWXContext(),
  database: (...args) => mockCloud.database(...args),
  deleteFile: (...args) => mockCloud.deleteFile(...args),
  get openapi() { return mockCloud.openapi; },
  uploadFile: (...args) => mockCloud.uploadFile(...args),
  DYNAMIC_CURRENT_ENV: 'test',
}), { virtual: true });

function setup(roundCount = 0) {
  jest.resetModules();
  const now = Date.now();
  mockCloud = makeCloud({
    rooms: [{ _id: 'r', roomCode: '123456', ruleId: 'rule', status: 'active', createdAt: now, playerIds: ['a', 'b'] }],
    rules: [{ _id: 'rule', baseScore: 1 }],
    players: [
      { _id: 'a', roomId: 'r', openid: 'wx-a', clientId: 'device-a', isOwner: true, isOnline: true, lastSeenAt: now, joinedAt: now, seatIndex: 0, avatarIndex: 0 },
      { _id: 'b', roomId: 'r', openid: 'wx-b', clientId: 'device-b', isOnline: true, lastSeenAt: now, joinedAt: now, seatIndex: 1, avatarIndex: 1 },
    ],
    rounds: Array.from({ length: roundCount }, (_, i) => ({ _id: 'old-' + i, roomId: 'r',
      roundIndex: i + 1, scoreChanges: { a: -1, b: 1 }, createdBy: 'a', clientId: 'old-op-' + i, createdAt: now })),
  });
  return name => require('../../cloudfunctions/' + name + '/index').main;
}
const pay = (id = 'new-op') => ({ roomId: 'r', playerId: 'a', memberClientId: 'device-a',
  clientId: id, type: 'manual', scoreChanges: { a: -5, b: 5 } });

test('121 条记录跨分页完整返回，分页期间追加不会插入已冻结的快照', async () => {
  const load = setup(121);
  const snapshot = load('getRoomSnapshot');
  const first = await snapshot({ roomId: 'r', memberClientId: 'device-a', heartbeat: true });
  expect(first.data.rounds).toHaveLength(100);
  await load('settleRound')(pay());
  const second = await snapshot({ roomId: 'r', memberClientId: 'device-a', offset: first.data.nextOffset,
    throughRoundIndex: first.data.throughRoundIndex });
  expect(second.data.rounds).toHaveLength(21);
  expect([...first.data.rounds, ...second.data.rounds].reduce((sum, r) => sum + r.scoreChanges.a, 0)).toBe(-121);
  expect(first.data.players.every(p => !('openid' in p) && !('clientId' in p))).toBe(true);
});

test('并发重复请求只记一次，不同请求获得连续序号，旧房间序号可迁移', async () => {
  const settle = setup(25)('settleRound');
  const results = await Promise.all([settle(pay()), settle(pay()), settle(pay('another-op'))]);
  expect(results.every(r => r.code === 'OK')).toBe(true);
  expect(results[0].data._id).toBe(results[1].data._id);
  expect(mockCloud.rows('rounds')).toHaveLength(27);
  expect(mockCloud.rows('rounds').slice(-2).map(r => r.roundIndex)).toEqual([26, 27]);
});

test.each([NaN, Infinity, '5', 1.5, Number.MAX_SAFE_INTEGER + 1])('非法分数 %s 不入账', async value => {
  const settle = setup()('settleRound');
  const res = await settle({ ...pay(), scoreChanges: { a: -value, b: value } });
  expect(res.code).toBe('INVALID_INPUT');
  expect(mockCloud.rows('rounds')).toHaveLength(0);
});

test('不能伪造他人 playerId 或扣他人分数', async () => {
  const settle = setup()('settleRound');
  expect((await settle({ ...pay(), playerId: 'b' })).code).toBe('FORBIDDEN');
  expect((await settle({ ...pay(), scoreChanges: { a: 5, b: -5 } })).code).toBe('FORBIDDEN');
});

test('旧 clientId 恢复时绑定 OPENID，之后不能被别的微信身份接管', async () => {
  const load = setup();
  await mockCloud.database({ throwOnNotFound: false }).collection('players').doc('a').update({ data: { openid: null } });
  expect((await load('getRoomSnapshot')({ roomId: 'r', memberClientId: 'device-a', heartbeat: true })).code).toBe('OK');
  expect(mockCloud.rows('players')[0].openid).toBe('wx-a');
  mockCloud.setOpenid('attacker');
  expect((await load('getRoomSnapshot')({ roomId: 'r', memberClientId: 'device-a' })).code).toBe('NOT_IN_ROOM');
});

test('在线心跳超过 30 分钟仍保护房间，陈旧在线标记按无人归档且保留数据', async () => {
  const load = setup(1);
  const db = mockCloud.database({ throwOnNotFound: false });
  const old = Date.now() - 3600000;
  await db.collection('rooms').doc('r').update({ data: { createdAt: old } });
  await db.collection('rounds').doc('old-0').update({ data: { createdAt: old } });
  expect((await load('autoCloseTimeout')()).data.closed).toBe(0);
  for (const id of ['a', 'b']) await db.collection('players').doc(id).update({ data: { lastSeenAt: old } });
  await db.collection('rooms').doc('r').update({ data: { nextCheckAt: 0 } });
  expect((await load('autoCloseTimeout')()).data.closed).toBe(1);
  expect(mockCloud.rows('rooms')[0].status).toBe('finished');
  expect(mockCloud.rows('players')).toHaveLength(2);
  expect(mockCloud.rows('rounds')).toHaveLength(1);
  expect((await load('settleRound')(pay())).code).toBe('ROOM_FINISHED');
});

test('超过100间房分批清理，下一轮继续处理剩余房间', async () => {
  jest.resetModules();
  const old = Date.now() - 3600000;
  mockCloud = makeCloud({ rooms: Array.from({ length: 121 }, (_, i) => ({ _id: 'r' + i,
    status: 'active', createdAt: old })), players: [], rounds: [] });
  const main = require('../../cloudfunctions/autoCloseTimeout/index').main;
  const first = await main();
  expect(first.data.closed).toBe(100);
  expect(first.data.more).toBe(true);
  expect((await main()).data.closed).toBe(21);
});

test('重复加入不生成新玩家，重入和退出不删除历史记录', async () => {
  const load = setup(2);
  const join = load('joinRoom');
  const args = { roomCode: '123456', clientId: 'device-a', nickname: '东风', avatarIndex: 0 };
  const results = await Promise.all([join(args), join(args)]);
  expect(results.map(r => r.data.playerId)).toEqual(['a', 'a']);
  expect(mockCloud.rows('players')).toHaveLength(2);
  expect((await load('leaveRoom')({ roomId: 'r', playerId: 'a', clientId: 'device-a' })).code).toBe('OK');
  expect(mockCloud.rows('rounds')).toHaveLength(2);
  expect((await join(args)).data.playerId).toBe('a');
});

test('新成员并发重复加入只创建一个身份，关房后不能加入', async () => {
  const load = setup();
  mockCloud.setOpenid('wx-c');
  const join = load('joinRoom');
  const args = { roomCode: '123456', clientId: 'device-c', nickname: '', avatarIndex: 2 };
  const results = await Promise.all([join(args), join(args)]);
  expect(results[0].data.playerId).toBe(results[1].data.playerId);
  expect(mockCloud.rows('players')).toHaveLength(3);
  await mockCloud.database({ throwOnNotFound: false }).collection('rooms').doc('r').update({ data: { status: 'finished' } });
  expect((await join(args)).code).toBe('ROOM_FINISHED');
});

test('首页不把陈旧在线标记算在线，历史十场展示限制不删除玩家', async () => {
  const load = setup();
  await mockCloud.database({ throwOnNotFound: false }).collection('players').doc('a').update({ data: { lastSeenAt: Date.now() - 3600000 } });
  const rooms = await load('getMyRooms')({ clientId: 'device-a' });
  expect(rooms.data.active[0].onlineCount).toBe(1);
  expect(rooms.data.active[0].isOnline).toBe(false);
  expect(mockCloud.rows('players')).toHaveLength(2);
});


test('房主规则更新只写业务字段，恢复默认值移除旧自定义字段', async () => {
  const load = setup();
  const db = mockCloud.database({ throwOnNotFound: false });
  await db.collection('rules').doc('rule').update({ data: { cardTypeFans: { pinghu: 30 }, winTypeFans: { zimo: 10 } } });
  const rule = { ...require('../../miniprogram/services/ruleService').getDefaultRule(), _id: 'evil', roomId: 'evil' };
  const update = load('updateRule');
  expect((await update({ roomId: 'r', rule, memberClientId: 'device-a' })).code).toBe('OK');
  const saved = mockCloud.rows('rules')[0];
  expect(saved._id).toBe('rule');
  expect(saved.cardTypeFans).toBeUndefined();
  expect(saved.winTypeFans).toBeUndefined();
  mockCloud.setOpenid('wx-b');
  expect((await update({ roomId: 'r', rule, memberClientId: 'device-b' })).code).toBe('FORBIDDEN');
});

test('创建房间时原子写入规则、玩家和房间，身份来自 OPENID', async () => {
  const load = setup();
  const result = await load('createRoom')({ clientId: 'device-new', baseScore: 2, avatarIndex: 0 });
  expect(result.code).toBe('OK');
  const room = mockCloud.rows('rooms').find(r => r._id === result.data.roomId);
  expect(room.ownerId).toBe('wx-a');
  expect(mockCloud.rows('rules').find(r => r._id === room.ruleId).roomId).toBe(room._id);
  expect(mockCloud.rows('players')).toHaveLength(3);
  expect(mockCloud.rows('players').find(p => p._id === result.data.playerId).openid).toBe('wx-a');
});

test('记分事务中途失败时不留下半条账，重试仍只写一条', async () => {
  const load = setup();
  const db = mockCloud.database({ throwOnNotFound: false });
  const original = db.runTransaction;
  db.runTransaction = fn => original(async transaction => {
    const originalCollection = transaction.collection;
    transaction.collection = name => {
      const c = originalCollection(name);
      if (name !== 'rooms') return c;
      return { ...c, doc: id => ({ ...c.doc(id), update: async () => { throw new Error('write failure'); } }) };
    };
    return fn(transaction);
  });
  await expect(load('settleRound')(pay())).rejects.toThrow('write failure');
  expect(mockCloud.rows('rounds')).toHaveLength(0);
  db.runTransaction = original;
  expect((await load('settleRound')(pay())).code).toBe('OK');
  expect(mockCloud.rows('rounds')).toHaveLength(1);
});

test('关房检查期间出现新心跳时保留房间', async () => {
  const load = setup();
  const db = mockCloud.database({ throwOnNotFound: false });
  const old = Date.now() - 3600000;
  await db.collection('rooms').doc('r').update({ data: { createdAt: old } });
  for (const id of ['a', 'b']) await db.collection('players').doc(id).update({ data: { lastSeenAt: old } });
  const original = db.runTransaction;
  db.runTransaction = async fn => {
    await db.collection('rooms').doc('r').update({ data: { presenceAt: Date.now() } });
    return original(fn);
  };
  expect((await load('autoCloseTimeout')()).data.closed).toBe(0);
  expect(mockCloud.rows('rooms')[0].status).toBe('active');
});

test('房间清理失败时继续处理其余房间并报告失败', async () => {
  const load = setup();
  const db = mockCloud.database({ throwOnNotFound: false });
  await db.collection('rooms').doc('empty').set({ data: { status: 'active', createdAt: Date.now() - 3600000 } });
  const original = db.runTransaction;
  let calls = 0;
  db.runTransaction = fn => ++calls === 1 ? Promise.reject(new Error('temporary failure')) : original(fn);
  const error = jest.spyOn(console, 'error').mockImplementation(() => {});
  const result = await load('autoCloseTimeout')();
  expect(result.code).toBe('PARTIAL_FAILURE');
  expect(result.data.failures).toHaveLength(1);
  expect(result.data.scanned).toBe(2);
  expect(calls).toBe(2);
  error.mockRestore();
});


test('SDK 默认读取缺失文档抛错，显式关闭后事务可以首次创建文档', async () => {
  const cloud = makeCloud({ rooms: [] });
  await expect(cloud.database().runTransaction(async tx => tx.collection('rooms').doc('new').get()))
    .rejects.toThrow('does not exist');
  const db = cloud.database({ throwOnNotFound: false });
  await db.runTransaction(async tx => {
    expect((await tx.collection('rooms').doc('new').get()).data).toBeNull();
    await tx.collection('rooms').doc('new').set({ data: { status: 'active' } });
  });
  expect(cloud.rows('rooms')).toEqual([{ _id: 'new', status: 'active' }]);
});

test('新协议返回完整总分摘要、限定初始明细；静默同步不扫描历史和规则', async () => {
  const load = setup(501);
  const main = load('getRoomSnapshot');
  const first = await main({ protocol: 2, roomId: 'r', memberClientId: 'device-a' });
  expect(first.data.scoreTotals).toEqual({ a: -501, b: 501 });
  expect(first.data.rounds).toHaveLength(100);
  expect(first.data.historyComplete).toBe(false);
  mockCloud.calls.length = 0;
  const quiet = await main({ protocol: 2, roomId: 'r', memberClientId: 'device-a',
    sinceRoundIndex: 501, knownRevision: 0 });
  expect(quiet.data.rounds).toEqual([]);
  expect(quiet.data.scoreTotals.a).toBe(-501);
  expect(mockCloud.calls.filter(c => c.collection === 'rounds' || c.collection === 'rules')).toEqual([]);
});

test('增量分页固定上界，整百条不多请求空页，期间新增在下次补齐', async () => {
  const load = setup(201);
  const main = load('getRoomSnapshot');
  const first = await main({ protocol: 2, roomId: 'r', memberClientId: 'device-a', sinceRoundIndex: 0 });
  expect(first.data.rounds).toHaveLength(100);
  expect(first.data.nextOffset).toBe(100);
  await load('settleRound')(pay('new'));
  const second = await main({ protocol: 2, roomId: 'r', memberClientId: 'device-a', sinceRoundIndex: 0,
    offset: 100, throughRoundIndex: 200 });
  expect(second.data.rounds).toHaveLength(100);
  expect(second.data.nextOffset).toBeNull();
  const delta = await main({ protocol: 2, roomId: 'r', memberClientId: 'device-a', sinceRoundIndex: 201 });
  expect(delta.data.rounds.map(r => r.roundIndex)).toEqual([202]);
  expect(delta.data.scoreTotals).toEqual({ a: -206, b: 206 });
});

test('lookup 仅确认原操作，不创建账目，重复提交不重复累加总分', async () => {
  const load = setup(5);
  const settle = load('settleRound');
  expect((await settle({ ...pay('x'), action: 'lookup', type: undefined })).data).toBeNull();
  expect(mockCloud.rows('rounds')).toHaveLength(5);
  const first = await settle(pay('x'));
  const lookup = await settle({ ...pay('x'), action: 'lookup', type: undefined });
  expect(lookup.data._id).toBe(first.data._id);
  await settle(pay('x'));
  expect(mockCloud.rows('rooms')[0].scoreTotals).toEqual({ a: -10, b: 10 });
  expect(mockCloud.rows('rounds')).toHaveLength(6);
});

test('总分与记分事务一起回滚，累计超出安全整数时不写账', async () => {
  const load = setup();
  const db = mockCloud.database({ throwOnNotFound: false });
  await db.collection('rooms').doc('r').update({ data: { ledgerSchema: 1, totalsThroughIndex: 0, roundCount: 0,
    scoreTotals: { a: -Number.MAX_SAFE_INTEGER, b: Number.MAX_SAFE_INTEGER } } });
  expect((await load('settleRound')(pay())).code).toBe('INVALID_INPUT');
  expect(mockCloud.rows('rounds')).toHaveLength(0);
});

test('通知只对业务变化发布，心跳不触发通知；各成员通知仅包含自身身份', async () => {
  process.env.ROOM_SYNC_MODE = 'watch';
  try {
    const load = setup();
    const main = load('getRoomSnapshot');
    const state = await main({ protocol: 2, roomId: 'r', memberClientId: 'device-a', subscribe: true, heartbeat: true });
    expect(state.data.sync.mode).toBe('watch');
    expect(mockCloud.rows('roomFeeds')[0]._openid).toBe('wx-a');
    const before = mockCloud.calls.filter(c => c.collection === 'roomFeeds' && c.method === 'set').length;
    await main({ protocol: 2, roomId: 'r', memberClientId: 'device-a', heartbeat: true,
      sinceRoundIndex: 0, knownRevision: 0 });
    expect(mockCloud.calls.filter(c => c.collection === 'roomFeeds' && c.method === 'set')).toHaveLength(before);
    await load('settleRound')(pay());
    const feeds = mockCloud.rows('roomFeeds');
    expect(feeds).toHaveLength(2);
    expect(feeds.every(f => f.revision === 1)).toBe(true);
    expect(feeds.map(f => f._openid).sort()).toEqual(['wx-a', 'wx-b']);
  } finally { delete process.env.ROOM_SYNC_MODE; }
});

test('旧房间成员通过心跳绑定身份后也能收到后续通知', async () => {
  process.env.ROOM_SYNC_MODE = 'watch';
  try {
    const load = setup();
    const db = mockCloud.database({ throwOnNotFound: false });
    await db.collection('players').doc('b').update({ data: { openid: null } });
    const state = load('getRoomSnapshot');
    await state({ protocol: 2, roomId: 'r', memberClientId: 'device-a', heartbeat: true, subscribe: true });
    mockCloud.setOpenid('wx-b');
    await state({ protocol: 2, roomId: 'r', memberClientId: 'device-b', heartbeat: true, subscribe: true });
    mockCloud.setOpenid('wx-a');
    await load('settleRound')(pay());
    expect(mockCloud.rows('roomFeeds').find(f => f._id === 'b').revision).toBe(1);
  } finally { delete process.env.ROOM_SYNC_MODE; }
});

test('开房限频按真实账号，不能通过更换设备编号绕过', async () => {
  const create = setup()('createRoom');
  expect((await create({ clientId: 'first', avatarIndex: 0 })).code).toBe('OK');
  expect((await create({ clientId: 'second', avatarIndex: 0 })).code).toBe('RATE_LIMIT');
});

test('首页十场批量读取，已结束房间不查询在线人数', async () => {
  const load = setup();
  const db = mockCloud.database({ throwOnNotFound: false });
  for (let i = 0; i < 10; i++) {
    await db.collection('players').doc('mine-' + i).set({ data: { roomId: 'room-' + i,
      openid: 'wx-a', clientId: 'device-a', joinedAt: Date.now() + i + 1 } });
    await db.collection('rooms').doc('room-' + i).set({ data: { roomCode: String(i), status: 'finished' } });
  }
  mockCloud.calls.length = 0;
  const result = await load('getMyRooms')({ clientId: 'device-a' });
  expect(result.data.finished).toHaveLength(10);
  expect(mockCloud.calls.filter(c => c.method === 'query')).toHaveLength(2);
});

test('旧版本写入导致摘要序号落后时自动重建，不漏算已成功的账目', async () => {
  const load = setup(5);
  const main = load('getRoomSnapshot');
  await main({ protocol: 2, roomId: 'r', memberClientId: 'device-a' });
  const db = mockCloud.database({ throwOnNotFound: false });
  await db.collection('rounds').doc('old-inflight').set({ data: { roomId: 'r', roundIndex: 6,
    scoreChanges: { a: -2, b: 2 }, createdBy: 'a', createdAt: Date.now() } });
  await db.collection('rooms').doc('r').update({ data: { roundCount: 6 } });
  const state = await main({ protocol: 2, roomId: 'r', memberClientId: 'device-a', sinceRoundIndex: 5 });
  expect(state.data.scoreTotals).toEqual({ a: -7, b: 7 });
  expect(state.data.rounds.map(r => r._id)).toEqual(['old-inflight']);
  expect(mockCloud.rows('rooms')[0].totalsThroughIndex).toBe(6);
});

test('最终排行榜只读总分摘要，不读取历史与规则', async () => {
  const load = setup(501);
  const main = load('getRoomSnapshot');
  await main({ protocol: 2, roomId: 'r', memberClientId: 'device-a' });
  mockCloud.calls.length = 0;
  const state = await main({ protocol: 2, roomId: 'r', memberClientId: 'device-a', summaryOnly: true });
  expect(state.data.scoreTotals.a).toBe(-501);
  expect(state.data.rounds).toEqual([]);
  expect(mockCloud.calls.filter(c => ['rounds', 'rules'].includes(c.collection))).toHaveLength(0);
});

test('定时清理不扫描尚未到检查时间的房间明细', async () => {
  const load = setup();
  await mockCloud.database({ throwOnNotFound: false }).collection('rooms').doc('r')
    .update({ data: { nextCheckAt: Date.now() + 3600000 } });
  mockCloud.calls.length = 0;
  const result = await load('autoCloseTimeout')();
  expect(result.data.scanned).toBe(0);
  expect(mockCloud.calls.every(c => c.collection === 'rooms' && c.method === 'query')).toBe(true);
});

test('同步参数非法值安全回退，校准周期不超过心跳周期', () => {
  const { policy } = require('../../cloudfunctions/_shared/roomSync');
  try {
    process.env.ROOM_POLL_MS = '0'; process.env.ROOM_HEARTBEAT_MS = '15000'; process.env.ROOM_RECONCILE_MS = '60000';
    expect(policy()).toMatchObject({ pollMs: 5000, heartbeatMs: 15000, reconcileMs: 15000 });
    process.env.ROOM_POLL_MS = '5000';
    expect(policy().pollMs).toBe(5000);
    process.env.ROOM_POLL_MS = '60000';
    expect(policy().pollMs).toBe(5000);
    process.env.ROOM_POLL_MS = '1000';
    expect(policy().pollMs).toBe(1000);
  } finally {
    delete process.env.ROOM_POLL_MS; delete process.env.ROOM_HEARTBEAT_MS; delete process.env.ROOM_RECONCILE_MS;
  }
});

test('watch 默认六十秒心跳和校准，poll 保留三十秒心跳，过长配置安全回退', () => {
  const { policy, CHECK_DELAY_MS } = require('../../cloudfunctions/_shared/roomSync');
  const names = ['ROOM_SYNC_MODE', 'ROOM_HEARTBEAT_MS', 'ROOM_RECONCILE_MS'];
  const saved = names.map(name => process.env[name]);
  try {
    names.forEach(name => delete process.env[name]);
    expect(policy()).toMatchObject({ mode: 'poll', pollMs: 5000, heartbeatMs: 30000, reconcileMs: 30000 });
    process.env.ROOM_SYNC_MODE = 'watch';
    expect(policy()).toMatchObject({ mode: 'watch', heartbeatMs: 60000, reconcileMs: 60000 });
    process.env.ROOM_HEARTBEAT_MS = '60000';
    expect(policy().heartbeatMs).toBe(60000);
    process.env.ROOM_HEARTBEAT_MS = '600000';
    process.env.ROOM_RECONCILE_MS = '600000';
    expect(policy()).toMatchObject({ heartbeatMs: 60000, reconcileMs: 60000 });
    expect(CHECK_DELAY_MS).toBe(480000);
  } finally {
    names.forEach((name, index) => {
      if (saved[index] == null) delete process.env[name]; else process.env[name] = saved[index];
    });
  }
});

test('一分钟心跳保留三分钟在线容错，首页与房间一致，失联后仍按期归档', async () => {
  const now = 1800000000000;
  const clock = jest.spyOn(Date, 'now').mockReturnValue(now);
  try {
    const load = setup();
    const db = mockCloud.database({ throwOnNotFound: false });
    for (const id of ['a', 'b']) {
      await db.collection('players').doc(id).update({ data: { lastSeenAt: now - 120000 } });
    }
    const home = await load('getMyRooms')({ clientId: 'device-a' });
    expect(home.data.active[0]).toMatchObject({ onlineCount: 2, isOnline: true });
    const state = await load('getRoomSnapshot')({ roomId: 'r', memberClientId: 'device-a' });
    expect(state.data.players.every(p => p.isOnline)).toBe(true);
    const { isOnline, closeReason } = require('../../cloudfunctions/_shared/roomLifecycle');
    const player = { isOnline: true, lastSeenAt: now };
    expect(isOnline(player, now + 179999)).toBe(true);
    expect(isOnline(player, now + 180000)).toBe(false);
    const room = { status: 'active', createdAt: now, presenceAt: now };
    expect(closeReason(room, [player], now + 479999)).toBeNull();
    expect(closeReason(room, [player], now + 480000)).toBe('auto-empty');
    expect(closeReason({ ...room, emptyAt: now }, [{ ...player, isOnline: false }], now + 300000)).toBe('auto-empty');
  } finally { clock.mockRestore(); }
});
