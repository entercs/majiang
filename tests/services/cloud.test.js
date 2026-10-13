const { callFunction } = require('../../miniprogram/services/cloud');
beforeEach(() => {
  global.wx = { cloud: { callFunction: jest.fn() } };
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => { jest.restoreAllMocks(); delete global.wx; });

test('SDK 普通错误对象保留错误消息、错误码和请求标识', async () => {
  wx.cloud.callFunction.mockRejectedValue({ errCode: -504002, errMsg: 'document does not exist', requestID: 'req-1' });
  await expect(callFunction('joinRoom', { clientId: 'private-device' })).rejects.toMatchObject({
    message: 'document does not exist', code: -504002, requestId: 'req-1',
  });
  expect(console.error).toHaveBeenCalledWith('[cloud.callFunction]', {
    name: 'joinRoom', code: -504002, message: 'document does not exist', requestId: 'req-1',
  });
});

test('业务错误同样带上请求标识，成功结果照常返回', async () => {
  wx.cloud.callFunction.mockResolvedValueOnce({ requestID: 'req-2', result: { code: 'ROOM_FINISHED', message: '本局已结束' } })
    .mockResolvedValueOnce({ result: { code: 'OK', data: { roomId: 'r' } } });
  await expect(callFunction('joinRoom')).rejects.toMatchObject({ code: 'ROOM_FINISHED', requestId: 'req-2' });
  await expect(callFunction('joinRoom')).resolves.toEqual({ code: 'OK', data: { roomId: 'r' } });
});
