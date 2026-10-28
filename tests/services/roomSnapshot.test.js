let mockCallFunction;
jest.mock('../../miniprogram/services/cloud', () => ({ callFunction: (...args) => mockCallFunction(...args) }));
jest.mock('../../miniprogram/stores/appStore', () => ({ clientId: 'device-a' }));
const roomService = require('../../miniprogram/services/roomService');

test('通知监听与失败读取均显式限制当前用户，单次失败只诊断一次', async () => {
  let callbacks;
  const close = jest.fn();
  const query = {
    watch: jest.fn(options => { callbacks = options; return { close }; }),
    get: jest.fn().mockResolvedValue({ data: [{ _id: 'member-a', _openid: 'owner' }] }),
  };
  const where = jest.fn(() => query);
  const collection = jest.fn(() => ({ where }));
  const previousWx = global.wx;
  global.wx = { cloud: { database: () => ({ collection }) } };
  const log = jest.spyOn(console, 'warn').mockImplementation(() => {});
  try {
    const change = jest.fn(), failed = jest.fn();
    const stop = roomService.watchRoom('member-a', change, failed);
    expect(collection).toHaveBeenCalledWith('roomFeeds');
    expect(where).toHaveBeenCalledWith({ _id: 'member-a', _openid: '{openid}' });
    callbacks.onChange({ docs: [{ revision: 2 }] });
    expect(change).toHaveBeenCalledWith({ revision: 2 });
    const error = { errCode: -402002, errMsg: 'watch failed' };
    callbacks.onError(error); callbacks.onError(error);
    for (let i = 0; i < 8; i++) await Promise.resolve();
    expect(failed).toHaveBeenCalledWith(error);
    expect(query.get).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith('房间通知读取诊断', {
      readable: true, exists: true, hasOwner: true,
    });
    stop(); expect(close).toHaveBeenCalledTimes(1);
  } finally { global.wx = previousWx; log.mockRestore(); }
});

test('分页传递固定边界，只有首页发送心跳，完整收集121笔', async () => {
  mockCallFunction = jest.fn()
    .mockResolvedValueOnce({ data: { rounds: Array.from({ length: 100 }, (_, i) => ({ _id: i })),
      throughRoundIndex: 121, nextOffset: 100, rule: { baseScore: 1 } } })
    .mockResolvedValueOnce({ data: { rounds: Array.from({ length: 21 }, (_, i) => ({ _id: i + 100 })), nextOffset: null } });
  const result = await roomService.getRoomSnapshot('r', { heartbeat: true });
  expect(result.rounds).toHaveLength(121);
  expect(mockCallFunction.mock.calls[1][1]).toEqual({ roomId: 'r', memberClientId: 'device-a',
    heartbeat: false, offset: 100, throughRoundIndex: 121 });
  expect(result.rule.baseScore).toBe(1);
});

test('任意分页失败必须报错，不能把截断数据当成完整快照', async () => {
  mockCallFunction = jest.fn().mockResolvedValueOnce({ data: { rounds: [], throughRoundIndex: 121, nextOffset: 100 } })
    .mockRejectedValueOnce(new Error('network'));
  await expect(roomService.getRoomSnapshot('r')).rejects.toThrow('network');
});

test('新协议请求合并相同参数的并发调用，协议游标只读取增量', async () => {
  let resolve;
  mockCallFunction = jest.fn(() => new Promise(done => { resolve = done; }));
  const options = { sinceRoundIndex: 500, knownRevision: 10, heartbeat: false };
  const a = roomService.getRoomState('r', options), b = roomService.getRoomState('r', options);
  expect(mockCallFunction).toHaveBeenCalledTimes(1);
  resolve({ data: { protocol: 2, rounds: [], scoreTotals: { a: -5 }, totalsThrough: 500, nextOffset: null } });
  expect((await a).scoreTotals).toEqual({ a: -5 });
  expect(await b).toEqual(await a);
  expect(mockCallFunction.mock.calls[0][1]).toMatchObject({ protocol: 2, sinceRoundIndex: 500, knownRevision: 10 });
});

test('不同前后台会话不复用旧请求，客户端作用域不会发送到云端', async () => {
  const pending = [];
  mockCallFunction = jest.fn(() => new Promise(resolve => pending.push(resolve)));
  const a = roomService.getRoomState('r', { requestScope: 1 });
  const b = roomService.getRoomState('r', { requestScope: 2 });
  expect(mockCallFunction).toHaveBeenCalledTimes(2);
  expect(mockCallFunction.mock.calls[0][1]).not.toHaveProperty('requestScope');
  for (const resolve of pending) resolve({ data: { rounds: [], nextOffset: null } });
  await Promise.all([a, b]);
});
