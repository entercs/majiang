let mockCallFunction;
jest.mock('../../miniprogram/services/cloud', () => ({ callFunction: (...args) => mockCallFunction(...args) }));
jest.mock('../../miniprogram/stores/appStore', () => ({ clientId: 'device-a' }));
const roomService = require('../../miniprogram/services/roomService');

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
