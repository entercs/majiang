let mockSubmitRound;
let mockUpdatePlayer;
jest.mock('../../miniprogram/services/roundService', () => ({ submitRound: (...args) => mockSubmitRound(...args) }));
jest.mock('../../miniprogram/services/playerService', () => ({ updatePlayer: (...args) => mockUpdatePlayer(...args) }));
jest.mock('../../miniprogram/services/errorHandler', () => ({ handleError: jest.fn() }));
let store, page;
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}
beforeEach(() => {
  jest.resetModules();
  let definition;
  global.Page = value => { definition = value; };
  global.wx = { showToast: jest.fn(), getStorageSync: jest.fn(() => ''), setStorageSync: jest.fn() };
  store = require('../../miniprogram/stores/roomStore');
  store.setRoom({ roomId: 'r', players: [{ _id: 'a', nickname: '东风', avatarIndex: 0 }, { _id: 'b' }],
    currentPlayerId: 'a', rule: {}, isOwner: true });
  require('../../miniprogram/pages/room/index/index');
  page = { ...definition, data: { ...definition.data, popupTarget: { _id: 'b' } },
    setData(update) { Object.assign(this.data, update); }, _render: jest.fn() };
  mockSubmitRound = jest.fn();
  mockUpdatePlayer = jest.fn();
});
afterEach(() => { delete global.Page; delete global.wx; });

test('给分成功提示只在云端确认后显示', async () => {
  const submitted = deferred();
  mockSubmitRound.mockReturnValue(submitted.promise);
  page.onPopupConfirm({ detail: { value: 5 } });
  expect(wx.showToast).not.toHaveBeenCalled();
  const clientId = mockSubmitRound.mock.calls[0][0].clientId;
  submitted.resolve({ code: 'OK', data: { _id: 'saved', clientId, roundIndex: 1, scoreChanges: { a: -5, b: 5 } } });
  await flush();
  expect(wx.showToast).toHaveBeenCalledWith({ title: '给分成功', icon: 'success', duration: 1200 });
  expect(store.getTotalScores()).toEqual({ a: -5, b: 5 });
});

test('给分失败不显示成功提示，并回滚临时分数', async () => {
  mockSubmitRound.mockRejectedValue(new Error('network'));
  page.onPopupConfirm({ detail: { value: 5 } });
  await flush();
  expect(wx.showToast).not.toHaveBeenCalled();
  expect(store.rounds).toHaveLength(0);
});

test('头像确认后的云端保存成功前不修改房间玩家，成功后才更新', async () => {
  const saved = deferred();
  mockUpdatePlayer.mockReturnValue(saved.promise);
  const log = jest.spyOn(console, 'log').mockImplementation(() => {});
  page.onSelfPopupConfirm({ detail: { nickname: '红中', avatarIndex: 4, selectedNicknameType: 'system' } });
  expect(store.players[0].avatarIndex).toBe(0);
  saved.resolve({ code: 'OK' });
  await flush();
  expect(store.players[0].avatarIndex).toBe(4);
  expect(store.players[0].nickname).toBe('红中');
  log.mockRestore();
});
