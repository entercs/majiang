let mockGetSnapshot;
jest.mock('../../miniprogram/services/roomService', () => ({
  getRoomState: (...args) => mockGetSnapshot(...args),
}));
let store, watcher;
const round = (_id, clientId = _id) => ({ _id, clientId, roundIndex: 1, scoreChanges: { a: -5, b: 5 } });
const snapshot = (rounds = [], status = 'active') => ({ room: { status }, players: [{ _id: 'a' }, { _id: 'b' }], rule: { baseScore: 2 }, rounds });
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}
beforeEach(() => {
  jest.resetModules();
  jest.useFakeTimers();
  store = require('../../miniprogram/stores/roomStore');
  store.roomId = 'r';
  watcher = require('../../miniprogram/stores/syncWatcher');
  mockGetSnapshot = jest.fn().mockResolvedValue(snapshot());
});
afterEach(() => { watcher.stop(); jest.useRealTimers(); jest.restoreAllMocks(); });

test('云端确认和本地确认交错时不会重复计分', async () => {
  store.addRound({ ...round('temp'), isOptimistic: true });
  mockGetSnapshot.mockResolvedValue(snapshot([round('real', 'temp')]));
  watcher.start('r');
  await flush();
  store.replaceRound('temp', round('real', 'temp'));
  expect(store.rounds).toHaveLength(1);
  expect(store.getTotalScores()).toEqual({ a: -5, b: 5 });
});

test('慢网络不重叠轮询，旧房间请求不覆盖新房间', async () => {
  const old = deferred();
  mockGetSnapshot.mockReturnValueOnce(old.promise).mockResolvedValue(snapshot([round('new')]));
  watcher.start('r');
  jest.advanceTimersByTime(10000);
  expect(mockGetSnapshot).toHaveBeenCalledTimes(1);
  store.roomId = 'new-room';
  watcher.start('new-room');
  await flush();
  old.resolve(snapshot([round('old')]));
  await flush();
  expect(store.rounds.map(r => r._id)).toEqual(['new']);
});

test('同步失败显示重连，下一次成功恢复', async () => {
  const callback = jest.fn();
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  mockGetSnapshot.mockRejectedValueOnce(new Error('offline')).mockResolvedValue(snapshot([round('real')]));
  watcher.start('r', { onSyncStatus: callback });
  await flush();
  expect(callback).toHaveBeenLastCalledWith('reconnecting');
  jest.advanceTimersByTime(5000);
  await flush();
  expect(callback).toHaveBeenLastCalledWith('connected');
  expect(store.rounds).toHaveLength(1);
  warn.mockRestore();
});

test('切后台停止心跳，旧请求失效，回前台立即恢复', async () => {
  const old = deferred();
  mockGetSnapshot.mockReturnValueOnce(old.promise).mockResolvedValue(snapshot([round('fresh')]));
  watcher.start('r');
  watcher.suspend();
  old.resolve(snapshot([round('stale')]));
  await flush();
  expect(store.rounds).toHaveLength(0);
  jest.advanceTimersByTime(60000);
  expect(mockGetSnapshot).toHaveBeenCalledTimes(1);
  watcher.resume();
  await flush();
  expect(store.rounds[0]._id).toBe('fresh');
  expect(mockGetSnapshot).toHaveBeenLastCalledWith('r', expect.objectContaining({ heartbeat: true }));
});

test('拉取期间新确认的记录保留，下次用云端权威历史校准', async () => {
  const pending = deferred();
  mockGetSnapshot.mockReturnValueOnce(pending.promise).mockResolvedValue(snapshot([round('real')]));
  watcher.start('r');
  store.replaceRound('temp', round('real', 'temp'));
  pending.resolve(snapshot());
  await flush();
  expect(store.rounds).toHaveLength(1);
  jest.advanceTimersByTime(5000);
  await flush();
  expect(store.rounds).toHaveLength(1);
});

test('收到关闭状态前先更新最终战绩，再通知页面', async () => {
  store.addRound({ ...round('unconfirmed'), isOptimistic: true });
  const close = jest.fn(() => expect(store.getTotalScores()).toEqual({ a: -5, b: 5 }));
  mockGetSnapshot.mockResolvedValue(snapshot([round('last')], 'finished'));
  watcher.start('r', { onRoomClosed: close });
  await flush();
  expect(close).toHaveBeenCalledTimes(1);
  jest.advanceTimersByTime(10000);
  expect(mockGetSnapshot).toHaveBeenCalledTimes(1);
});

test('切换房间清空旧计分状态', () => {
  store.rounds = [round('old')];
  store.setRoom({ roomId: 'new', players: [], rule: {}, currentPlayerId: 'c' });
  expect(store.rounds).toHaveLength(0);
});

test('服务端摘要不与已包含的历史或未确认临时记录重复累计', () => {
  store.players = [{ _id: 'a' }, { _id: 'b' }];
  store.setServerTotals({ a: -5, b: 5 }, 1);
  store.rounds = [round('saved'), { ...round('pending'), isOptimistic: true }];
  expect(store.getTotalScores()).toEqual({ a: -5, b: 5 });
  store.acceptRound('pending', { data: { ...round('confirmed'), roundIndex: 2 },
    meta: { scoreTotals: { a: -10, b: 10 }, throughRoundIndex: 2 } });
  expect(store.getTotalScores()).toEqual({ a: -10, b: 10 });
  store.setServerTotals({ a: 0, b: 0 }, 0);
  expect(store.getTotalScores()).toEqual({ a: -10, b: 10 });
});

test('复用初始化快照不立即二次请求', async () => {
  watcher.start('r', {}, snapshot());
  await flush();
  expect(mockGetSnapshot).not.toHaveBeenCalled();
  jest.advanceTimersByTime(4999); await flush();
  expect(mockGetSnapshot).not.toHaveBeenCalled();
  jest.advanceTimersByTime(1); await flush();
  expect(mockGetSnapshot).toHaveBeenCalledTimes(1);
});

test('同步持续失败逐步退避，而不是每五秒不断请求', async () => {
  mockGetSnapshot.mockRejectedValue(new Error('offline'));
  watcher.start('r'); await flush();
  jest.advanceTimersByTime(5000); await flush();
  expect(mockGetSnapshot).toHaveBeenCalledTimes(2);
  jest.advanceTimersByTime(5000); await flush();
  expect(mockGetSnapshot).toHaveBeenCalledTimes(2);
  jest.advanceTimersByTime(5500); await flush();
  expect(mockGetSnapshot).toHaveBeenCalledTimes(3);
});

test('推送模式空闲时不进行五秒轮询，突发通知合并增量读取', async () => {
  let notify;
  const close = jest.fn();
  const roomService = require('../../miniprogram/services/roomService');
  roomService.watchRoom = jest.fn((id, fn) => { notify = fn; fn({ revision: 0 }); return close; });
  const initial = { ...snapshot(), protocol: 2, watchId: 'a', throughRoundIndex: 0, totalsThrough: 0,
    revision: 0, scoreTotals: { a: 0, b: 0 }, sync: { mode: 'watch', reconcileMs: 30000 } };
  store.revision = 0; store.syncCursor = 0;
  watcher.start('r', {}, initial);
  jest.advanceTimersByTime(10000); await flush();
  expect(mockGetSnapshot).not.toHaveBeenCalled();
  mockGetSnapshot.mockResolvedValue({ ...initial, rounds: [round('new')], revision: 3,
    throughRoundIndex: 1, totalsThrough: 1, scoreTotals: { a: -5, b: 5 } });
  notify({ revision: 1 }); notify({ revision: 2 }); notify({ revision: 3 });
  jest.advanceTimersByTime(100); await flush();
  expect(mockGetSnapshot).toHaveBeenCalledTimes(1);
  expect(store.getTotalScores()).toEqual({ a: -5, b: 5 });
  notify({ revision: 3 });
  jest.advanceTimersByTime(100); await flush();
  expect(mockGetSnapshot).toHaveBeenCalledTimes(1);
  watcher.suspend();
  expect(close).toHaveBeenCalledTimes(1);
});

test('通知连接失效后自动回退增量轮询，不丢失更新', async () => {
  const roomService = require('../../miniprogram/services/roomService');
  let failed;
  roomService.watchRoom = jest.fn((id, fn, onError) => { failed = onError; return jest.fn(); });
  watcher.start('r', {}, { ...snapshot(), sync: { mode: 'watch', reconcileMs: 30000 }, watchId: 'a' });
  const log = jest.spyOn(console, 'warn').mockImplementation(() => {});
  failed({ errCode: 'connection-limit' });
  mockGetSnapshot.mockResolvedValue(snapshot([round('fallback')]));
  jest.advanceTimersByTime(4999); await flush();
  expect(mockGetSnapshot).not.toHaveBeenCalled();
  jest.advanceTimersByTime(1); await flush();
  expect(store.rounds[0]._id).toBe('fallback');
  expect(mockGetSnapshot).toHaveBeenCalledTimes(1);
  log.mockRestore();
});

test('六十秒静置才校准并续心跳，期间记分通知仍立即拉取', async () => {
  const roomService = require('../../miniprogram/services/roomService');
  let notify;
  roomService.watchRoom = jest.fn((id, fn) => { notify = fn; fn({ revision: 0 }); return jest.fn(); });
  const initial = { ...snapshot(), revision: 0, watchId: 'a',
    sync: { mode: 'watch', reconcileMs: 60000, heartbeatMs: 60000 } };
  mockGetSnapshot.mockResolvedValue(initial);
  watcher.start('r', {}, initial);
  jest.advanceTimersByTime(59999); await flush();
  expect(mockGetSnapshot).not.toHaveBeenCalled();
  jest.advanceTimersByTime(1); await flush();
  expect(mockGetSnapshot).toHaveBeenCalledTimes(1);
  expect(mockGetSnapshot).toHaveBeenLastCalledWith('r', expect.objectContaining({ heartbeat: true }));
  notify({ revision: 1 });
  jest.advanceTimersByTime(100); await flush();
  expect(mockGetSnapshot).toHaveBeenCalledTimes(2);
  expect(mockGetSnapshot).toHaveBeenLastCalledWith('r', expect.objectContaining({ heartbeat: false }));
});

function watchSnapshot() {
  return { ...snapshot(), revision: 0, watchId: 'a', sync: {
    mode: 'watch', pollMs: 5000, reconcileMs: 60000, heartbeatMs: 60000,
  } };
}
function captureWatches() {
  const attempts = [];
  require('../../miniprogram/services/roomService').watchRoom = jest.fn((id, onChange, onError) => {
    const attempt = { onChange, onError, close: jest.fn() };
    attempts.push(attempt);
    return attempt.close;
  });
  mockGetSnapshot.mockResolvedValue(watchSnapshot());
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'info').mockImplementation(() => {});
  return attempts;
}

test('回退后持续五秒轮询，三十秒时重新订阅，确认连接成功后停止轮询', async () => {
  const attempts = captureWatches();
  watcher.start('r', {}, watchSnapshot());
  attempts[0].onError({ code: 'temporary-error' });
  expect(attempts[0].close).toHaveBeenCalledTimes(1);
  await jest.advanceTimersByTimeAsync(29999);
  expect(attempts).toHaveLength(1);
  expect(mockGetSnapshot).toHaveBeenCalledTimes(5);
  expect(mockGetSnapshot).toHaveBeenLastCalledWith('r', expect.objectContaining({ subscribe: false }));
  await jest.advanceTimersByTimeAsync(1);
  expect(attempts).toHaveLength(2);
  expect(mockGetSnapshot).toHaveBeenLastCalledWith('r', expect.objectContaining({ subscribe: true }));
  // 重连仍在初始化时继续轮询，不把创建监听对象当作成功。
  await jest.advanceTimersByTimeAsync(5000);
  expect(mockGetSnapshot).toHaveBeenCalledTimes(7);
  attempts[1].onChange({ revision: 0 });
  await jest.advanceTimersByTimeAsync(59999);
  expect(mockGetSnapshot).toHaveBeenCalledTimes(7);
  await jest.advanceTimersByTimeAsync(1);
  expect(mockGetSnapshot).toHaveBeenCalledTimes(8);
  // 恢复后再次断开，退避从三十秒重新开始。
  attempts[1].onError({ code: 'another-error' });
  await jest.advanceTimersByTimeAsync(30000);
  expect(attempts).toHaveLength(3);
});

test('连续初始化失败按三十、六十、一百二十秒及五分钟退避', async () => {
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  const watchRoom = jest.fn(() => { throw new Error('connection-limit'); });
  require('../../miniprogram/services/roomService').watchRoom = watchRoom;
  mockGetSnapshot.mockResolvedValue(watchSnapshot());
  watcher.start('r', {}, watchSnapshot());
  expect(watchRoom).toHaveBeenCalledTimes(1);
  for (const [index, delay] of [30000, 60000, 120000, 300000, 300000].entries()) {
    await jest.advanceTimersByTimeAsync(delay - 1);
    expect(watchRoom).toHaveBeenCalledTimes(index + 1);
    await jest.advanceTimersByTimeAsync(1);
    expect(watchRoom).toHaveBeenCalledTimes(index + 2);
  }
});

test('监听无回调时十秒超时并关闭，重试不会叠加连接', async () => {
  const attempts = captureWatches();
  watcher.start('r', {}, watchSnapshot());
  await jest.advanceTimersByTimeAsync(10000);
  expect(attempts[0].close).toHaveBeenCalledTimes(1);
  await jest.advanceTimersByTimeAsync(30000);
  expect(attempts).toHaveLength(2);
  const calls = mockGetSnapshot.mock.calls.length;
  attempts[0].onChange({ revision: 100 });
  attempts[0].onError({ code: 'stale-error' });
  await jest.advanceTimersByTimeAsync(100);
  expect(mockGetSnapshot).toHaveBeenCalledTimes(calls);
  expect(attempts[1].close).not.toHaveBeenCalled();
  attempts[1].onChange({ revision: 0 });
  await jest.advanceTimersByTimeAsync(10000);
  expect(attempts[1].close).not.toHaveBeenCalled();
});

test('切后台取消重试，回前台立即订阅，停止后旧回调不再触发恢复', async () => {
  const attempts = captureWatches();
  watcher.start('r', {}, watchSnapshot());
  attempts[0].onError({ code: 'offline' });
  watcher.suspend();
  await jest.advanceTimersByTimeAsync(60000);
  expect(attempts).toHaveLength(1);
  expect(mockGetSnapshot).not.toHaveBeenCalled();
  watcher.resume(); await flush();
  expect(attempts).toHaveLength(2);
  watcher.stop();
  expect(attempts[1].close).toHaveBeenCalledTimes(1);
  attempts[1].onError({ code: 'late-error' });
  attempts[1].onChange({ revision: 999 });
  const calls = mockGetSnapshot.mock.calls.length;
  await jest.advanceTimersByTimeAsync(600000);
  expect(attempts).toHaveLength(2);
  expect(mockGetSnapshot).toHaveBeenCalledTimes(calls);
});

test('服务端改为 poll 后取消 watch 恢复尝试', async () => {
  const attempts = captureWatches();
  watcher.start('r', {}, watchSnapshot());
  attempts[0].onError({ code: 'offline' });
  mockGetSnapshot.mockResolvedValue({ ...watchSnapshot(), sync: { mode: 'poll', pollMs: 5000 } });
  await jest.advanceTimersByTimeAsync(120000);
  expect(attempts).toHaveLength(1);
  expect(mockGetSnapshot).toHaveBeenCalledTimes(24);
});
