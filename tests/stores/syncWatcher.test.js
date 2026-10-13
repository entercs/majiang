let mockGetSnapshot;
jest.mock('../../miniprogram/services/roomService', () => ({
  getRoomSnapshot: (...args) => mockGetSnapshot(...args),
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
afterEach(() => { watcher.stop(); jest.useRealTimers(); });

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
  jest.advanceTimersByTime(2000);
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
  expect(mockGetSnapshot).toHaveBeenLastCalledWith('r', { heartbeat: true });
});

test('拉取期间新确认的记录保留，下次用云端权威历史校准', async () => {
  const pending = deferred();
  mockGetSnapshot.mockReturnValueOnce(pending.promise).mockResolvedValue(snapshot([round('real')]));
  watcher.start('r');
  store.replaceRound('temp', round('real', 'temp'));
  pending.resolve(snapshot());
  await flush();
  expect(store.rounds).toHaveLength(1);
  jest.advanceTimersByTime(2000);
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
