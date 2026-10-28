let service, resolveDownload;
beforeEach(() => {
  jest.resetModules(); jest.useFakeTimers();
  global.wx = { cloud: { downloadFile: jest.fn(() => new Promise(resolve => { resolveDownload = resolve; })) } };
  service = require('../../miniprogram/services/qrCodeService');
});
afterEach(() => { jest.useRealTimers(); delete global.wx; });

test('二维码预下载合并并发请求，重复打开复用本地缓存', async () => {
  const a = service.preload('cloud://qr'), b = service.preload('cloud://qr');
  expect(wx.cloud.downloadFile).toHaveBeenCalledTimes(1);
  resolveDownload({ tempFilePath: '/tmp/qr.png' });
  expect(await a).toBe('/tmp/qr.png');
  expect(await b).toBe('/tmp/qr.png');
  expect(await service.preload('cloud://qr')).toBe('/tmp/qr.png');
  expect(wx.cloud.downloadFile).toHaveBeenCalledTimes(1);
});

test('慢下载到达创建等待上限后继续进房，下载完成仍可复用', async () => {
  const prepared = service.prepare('cloud://qr');
  jest.advanceTimersByTime(1200);
  expect(await prepared).toBe('');
  resolveDownload({ tempFilePath: '/tmp/qr.png' });
  await Promise.resolve(); await Promise.resolve();
  expect(await service.preload('cloud://qr')).toBe('/tmp/qr.png');
});
