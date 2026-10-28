let mockCall;
jest.mock('../../miniprogram/services/cloud', () => ({ callFunction: (...args) => mockCall(...args) }));
jest.mock('../../miniprogram/stores/appStore', () => ({ clientId: 'device' }));
let service, storage;
const op = { roomId: 'r', clientId: 'op-1', playerId: 'a', type: 'manual', scoreChanges: { a: -5, b: 5 } };
const saved = { code: 'OK', data: { _id: 'real', clientId: 'op-1', scoreChanges: op.scoreChanges } };
beforeEach(() => {
  jest.resetModules();
  storage = new Map();
  global.wx = { getStorageSync: key => storage.get(key), setStorageSync: (key, value) => storage.set(key, structuredClone(value)) };
  mockCall = jest.fn();
  service = require('../../miniprogram/services/roundService');
});
afterEach(() => { delete global.wx; });

test('提交响应丢失后查询已成功的记录，不再次记分', async () => {
  mockCall.mockRejectedValueOnce(new Error('timeout')).mockResolvedValueOnce(saved);
  expect(await service.submitRound(op)).toEqual(saved);
  expect(mockCall).toHaveBeenCalledTimes(2);
  expect(mockCall.mock.calls[1][1]).toMatchObject({ clientId: 'op-1', action: 'lookup' });
  expect(service.hasPending('r')).toBe(false);
});

test('查询尚未入账时沿用同一编号重试', async () => {
  mockCall.mockRejectedValueOnce(new Error('timeout')).mockResolvedValueOnce({ code: 'OK', data: null }).mockResolvedValueOnce(saved);
  await service.submitRound(op);
  expect(mockCall.mock.calls.map(c => c[1].clientId)).toEqual(['op-1', 'op-1', 'op-1']);
  expect(mockCall.mock.calls[2][1].scoreChanges).toEqual(op.scoreChanges);
});

test('网络持续失败时保留待确认操作并阻止新编号重复给分，重启后仍可核对', async () => {
  mockCall.mockRejectedValue(new Error('offline'));
  await expect(service.submitRound(op)).rejects.toMatchObject({ code: 'SUBMISSION_UNCONFIRMED' });
  const count = mockCall.mock.calls.length;
  await expect(service.submitRound({ ...op, clientId: 'op-2' })).rejects.toMatchObject({ code: 'SUBMISSION_UNCONFIRMED' });
  expect(mockCall).toHaveBeenCalledTimes(count);
  jest.resetModules();
  service = require('../../miniprogram/services/roundService');
  expect(service.hasPending('r')).toBe(true);
  mockCall.mockResolvedValue(saved);
  const results = await service.reconcilePending('r', true);
  expect(results).toEqual([saved]);
  expect(service.hasPending('r')).toBe(false);
});

test('查询接口失败不能当成原记分失败而清除待确认操作', async () => {
  mockCall.mockRejectedValueOnce(new Error('timeout'))
    .mockRejectedValueOnce(Object.assign(new Error('old backend'), { code: 'INVALID_INPUT' }));
  await expect(service.submitRound(op)).rejects.toMatchObject({ code: 'SUBMISSION_UNCONFIRMED' });
  expect(service.hasPending('r')).toBe(true);
});

test('服务端明确拒绝提交时清除待确认状态，不重试', async () => {
  mockCall.mockRejectedValue(Object.assign(new Error('not yours'), { code: 'FORBIDDEN' }));
  await expect(service.submitRound(op)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  expect(mockCall).toHaveBeenCalledTimes(1);
  expect(service.hasPending('r')).toBe(false);
});

test('无法持久保存操作编号时不向云端提交，避免重启后重复给分', async () => {
  wx.setStorageSync = () => { throw new Error('quota exceeded'); };
  await expect(service.submitRound(op)).rejects.toMatchObject({ code: 'LOCAL_STORAGE_ERROR' });
  expect(mockCall).not.toHaveBeenCalled();
});
