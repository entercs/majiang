let mockCreateRoom, mockJoinRoom, mockSnapshot, mockQRCode;
jest.mock('../../miniprogram/services/roomService', () => ({
  createRoom: (...args) => mockCreateRoom(...args),
  joinRoom: (...args) => mockJoinRoom(...args),
  getRoomState: (...args) => mockSnapshot(...args),
  getRoomQRCode: (...args) => mockQRCode(...args),
}));
jest.mock('../../miniprogram/services/errorHandler', () => ({ handleError: jest.fn() }));
let store, appStore;
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
function deferred() { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; }
function loadPage(name) {
  let definition;
  global.Page = value => { definition = value; };
  require('../../miniprogram/pages/' + name + '/index');
  return { ...definition, data: structuredClone(definition.data),
    setData(update) { Object.assign(this.data, update); } };
}
function snapshot(fileID = 'cloud://room-qr') {
  return { room: { _id: 'r', roomCode: '123456', status: 'active', qrCodeFileID: fileID },
    players: [{ _id: 'owner', isOwner: true }], currentPlayerId: 'owner', rule: { baseScore: 1 }, rounds: [] };
}
beforeEach(() => {
  jest.resetModules();
  jest.useFakeTimers();
  global.wx = { getStorageSync: jest.fn(() => ''), showLoading: jest.fn(), hideLoading: jest.fn(),
    reLaunch: jest.fn(), showModal: jest.fn(), hideHomeButton: jest.fn() };
  global.getApp = () => ({ globalData: { pendingJoinCode: '' } });
  store = require('../../miniprogram/stores/roomStore');
  appStore = require('../../miniprogram/stores/appStore');
  Object.assign(appStore, { clientId: 'device-owner', nickname: '东风', avatarIndex: 0 });
  mockCreateRoom = jest.fn().mockResolvedValue({ code: 'OK', data: { roomId: 'r', roomCode: '123456', playerId: 'owner' } });
  mockJoinRoom = jest.fn().mockResolvedValue({ code: 'OK', data: { roomId: 'r' } });
  mockSnapshot = jest.fn().mockResolvedValue(snapshot());
  mockQRCode = jest.fn().mockResolvedValue({ code: 'OK', data: { fileID: 'cloud://retry-qr' } });
});
afterEach(() => { jest.clearAllTimers(); jest.useRealTimers(); delete global.Page; delete global.getApp; delete global.wx; });

test('创建按钮直接创建默认底分房间，并携带打开邀请框标记', async () => {
  const page = loadPage('home');
  page.onCreateRoom();
  expect(mockCreateRoom).toHaveBeenCalledWith({ nickname: '东风', avatarIndex: 0,
    clientId: 'device-owner', baseScore: 1, nicknameAuto: false });
  expect(wx.showModal).not.toHaveBeenCalled();
  expect(page.data.baseScorePopupVisible).toBeUndefined();
  await flush();
  expect(wx.reLaunch).toHaveBeenCalledWith({ url: '/pages/room/index/index?roomId=r&invite=1' });
});

test('连续点击创建时只提交一次，创建失败不跳转', async () => {
  const pending = deferred();
  mockCreateRoom.mockReturnValue(pending.promise);
  const page = loadPage('home');
  page.onCreateRoom();
  page.onCreateRoom();
  expect(mockCreateRoom).toHaveBeenCalledTimes(1);
  pending.resolve({ code: 'INTERNAL_ERROR', message: 'failed' });
  await flush();
  expect(wx.reLaunch).not.toHaveBeenCalled();
  expect(page._creating).toBe(false);
});

test('创建后房间加载成功才打开邀请框，关闭后回前台不会再次弹出', async () => {
  const pending = deferred();
  mockSnapshot.mockReturnValue(pending.promise);
  const page = loadPage('room/index');
  page._startSync = jest.fn();
  page._render = jest.fn();
  page.onLoad({ roomId: 'r', invite: '1' });
  expect(page.data.sharePopupVisible).toBe(false);
  pending.resolve(snapshot());
  await flush();
  expect(page.data.sharePopupVisible).toBe(true);
  expect(page.data.shareQrCodeFileID).toBe('cloud://room-qr');
  expect(mockQRCode).not.toHaveBeenCalled();
  page.onQrCodeLoaded();
  page.onCloseSharePopup();
  page.onShow();
  expect(page.data.sharePopupVisible).toBe(false);
  expect(page._openInviteOnLoad).toBe(false);
  page.onOpenSharePopup();
  expect(page.data.sharePopupVisible).toBe(true);
});

test('普通加入不携带自动邀请标记，进入房间不自动弹框', async () => {
  const home = loadPage('home');
  home._doJoin('123456', '东风');
  await flush();
  expect(wx.reLaunch).toHaveBeenCalledWith({ url: '/pages/room/index/index?roomId=r' });
  const room = loadPage('room/index');
  room._startSync = jest.fn(); room._render = jest.fn();
  room.onLoad({ roomId: 'r' });
  await flush();
  expect(room.data.sharePopupVisible).toBe(false);
});

test('二维码失败后可关闭或重试，重试成功后正常展示', async () => {
  mockSnapshot.mockResolvedValue(snapshot(''));
  mockQRCode.mockRejectedValueOnce(new Error('qr unavailable'));
  const warn = jest.spyOn(console, 'error').mockImplementation(() => {});
  const page = loadPage('room/index');
  page._startSync = jest.fn(); page._render = jest.fn();
  page.onLoad({ roomId: 'r', invite: '1' });
  await flush();
  expect(page.data.sharePopupVisible).toBe(true);
  expect(page.data.shareQrCodeLoading).toBe(true);
  page.onCloseSharePopup();
  expect(page.data.sharePopupVisible).toBe(false);
  page.onOpenSharePopup();
  await flush();
  expect(page.data.shareQrCodeFileID).toBe('cloud://retry-qr');
  page.onQrCodeLoaded();
  expect(page.data.shareQrCodeLoading).toBe(false);
  warn.mockRestore();
});

test('页面卸载后返回的房间加载结果不能再打开邀请框', async () => {
  const pending = deferred();
  mockSnapshot.mockReturnValue(pending.promise);
  const page = loadPage('room/index');
  page._startSync = jest.fn(); page._render = jest.fn();
  page.onLoad({ roomId: 'r', invite: '1' });
  page._unloaded = true;
  pending.resolve(snapshot());
  await flush();
  expect(page.data.sharePopupVisible).toBe(false);
  expect(page._startSync).not.toHaveBeenCalled();
});

test('图片加载失败仅自动重试一次，关闭后取消后续重试', async () => {
  const page = loadPage('room/index');
  page.data.shareQrCodeFileID = 'cloud://room-qr';
  store.roomId = 'r'; store.roomCode = '123456';
  page.onOpenSharePopup();
  await flush();
  page.onQrCodeImageError();
  jest.advanceTimersByTime(1000); await flush();
  page.onQrCodeImageError();
  expect(page.data.shareQrCodeLoading).toBe(false);
  jest.advanceTimersByTime(60000); await flush();
  expect(mockQRCode).not.toHaveBeenCalled();
  page.onRetryQRCode(); await flush();
  page.onQrCodeImageError();
  page.onCloseSharePopup();
  const load = jest.spyOn(page, '_loadQRCode');
  jest.advanceTimersByTime(10000); await flush();
  expect(load).not.toHaveBeenCalled();
});

test('创建结果中的二维码可在房间资料返回前打开，关闭后不被初始化重新打开', async () => {
  store.setRoom({ roomId: 'r', roomCode: '123456', players: [], rule: null });
  store.createdInvite = { roomId: 'r', fileID: 'cloud://room-qr', src: '' };
  const pending = deferred(); mockSnapshot.mockReturnValue(pending.promise);
  const page = loadPage('room/index');
  page._startSync = jest.fn(); page._render = jest.fn();
  page.onLoad({ roomId: 'r', invite: '1' });
  expect(page.data.sharePopupVisible).toBe(true);
  expect(page.data.shareQrCodeLoading).toBe(true);
  page.onCloseSharePopup();
  pending.resolve(snapshot()); await flush();
  expect(page.data.sharePopupVisible).toBe(false);
});
