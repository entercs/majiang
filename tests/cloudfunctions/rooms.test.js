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
  expect((await load('autoCloseTimeout')()).data.closed).toBe(1);
  expect(mockCloud.rows('rooms')[0].status).toBe('finished');
  expect(mockCloud.rows('players')).toHaveLength(2);
  expect(mockCloud.rows('rounds')).toHaveLength(1);
  expect((await load('settleRound')(pay())).code).toBe('ROOM_FINISHED');
});

test('扫描超过 100 间房而不截断', async () => {
  jest.resetModules();
  const old = Date.now() - 3600000;
  mockCloud = makeCloud({ rooms: Array.from({ length: 121 }, (_, i) => ({ _id: 'r' + i,
    status: 'active', createdAt: old })), players: [], rounds: [] });
  expect((await require('../../cloudfunctions/autoCloseTimeout/index').main()).data.closed).toBe(121);
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
