const { groupRoundsBySession, isOngoing, formatTime, formatDateTime, roundToTransfers } = require('../../miniprogram/utils/roundGrouping');

describe('groupRoundsBySession', () => {
  test('空数组返回空', () => {
    expect(groupRoundsBySession([])).toEqual([]);
    expect(groupRoundsBySession(null)).toEqual([]);
  });

  test('单条 round → 1 局', () => {
    const rounds = [{ _id: 'r1', createdAt: 1000, scoreChanges: { A: -5, B: 5 } }];
    const groups = groupRoundsBySession(rounds);
    expect(groups.length).toBe(1);
    expect(groups[0].startTime).toBe(1000);
    expect(groups[0].endTime).toBe(1000);
    expect(groups[0].items.length).toBe(1);
  });

  test('相邻 30s 内 → 同局', () => {
    const rounds = [
      { _id: 'r1', createdAt: 1000, scoreChanges: {} },
      { _id: 'r2', createdAt: 31000, scoreChanges: {} },
    ];
    const groups = groupRoundsBySession(rounds);
    expect(groups.length).toBe(1);
    expect(groups[0].items.length).toBe(2);
    expect(groups[0].startTime).toBe(1000);
    expect(groups[0].endTime).toBe(31000);
  });

  test('间隔 31s → 新局', () => {
    const rounds = [
      { _id: 'r1', createdAt: 1000, scoreChanges: {} },
      { _id: 'r2', createdAt: 32000, scoreChanges: {} },
    ];
    const groups = groupRoundsBySession(rounds);
    expect(groups.length).toBe(2);
    expect(groups[0].items.length).toBe(1);
    expect(groups[1].items.length).toBe(1);
  });

  test('多笔 round 混合：3 笔同局 + 1 笔新局', () => {
    const rounds = [
      { _id: 'r1', createdAt: 1000, scoreChanges: {} },
      { _id: 'r2', createdAt: 5000, scoreChanges: {} },
      { _id: 'r3', createdAt: 10000, scoreChanges: {} },
      { _id: 'r4', createdAt: 50000, scoreChanges: {} },
    ];
    const groups = groupRoundsBySession(rounds);
    expect(groups.length).toBe(2);
    expect(groups[0].items.length).toBe(3);
    expect(groups[1].items.length).toBe(1);
  });

  test('乱序输入也能正确排序分组', () => {
    const rounds = [
      { _id: 'r1', createdAt: 10000, scoreChanges: {} },
      { _id: 'r2', createdAt: 1000, scoreChanges: {} },
      { _id: 'r3', createdAt: 5000, scoreChanges: {} },
    ];
    const groups = groupRoundsBySession(rounds);
    expect(groups.length).toBe(1);
    expect(groups[0].items.map(r => r._id)).toEqual(['r2', 'r3', 'r1']);
  });

  test('自定义窗口宽度', () => {
    const rounds = [
      { _id: 'r1', createdAt: 1000, scoreChanges: {} },
      { _id: 'r2', createdAt: 6000, scoreChanges: {} },
    ];
    // 10s 窗口：间隔 5s → 同局；100s 窗口：5s 也同局
    expect(groupRoundsBySession(rounds, 10000).length).toBe(1);
    expect(groupRoundsBySession(rounds, 100000).length).toBe(1);
    // 3s 窗口：5s 间隔 → 新局
    expect(groupRoundsBySession(rounds, 3000).length).toBe(2);
  });
});

describe('isOngoing', () => {
  test('最后一局刚结束 → false', () => {
    const groups = [{ startTime: 1000, endTime: 1000, items: [] }];
    expect(isOngoing(groups, 1000 + 31000)).toBe(false);
  });

  test('最后一局仍在 30s 内 → true', () => {
    const groups = [{ startTime: 1000, endTime: 1000, items: [] }];
    expect(isOngoing(groups, 1000 + 29000)).toBe(true);
  });

  test('空数组 → false', () => {
    expect(isOngoing([])).toBe(false);
  });
});

describe('formatTime / formatDateTime', () => {
  test('formatTime 补零', () => {
    const ts = new Date(2024, 0, 1, 9, 5, 3).getTime();
    expect(formatTime(ts)).toBe('09:05:03');
  });

  test('formatDateTime 月日补零', () => {
    const ts = new Date(2024, 2, 5, 14, 30, 0).getTime();
    expect(formatDateTime(ts)).toBe('03-05 14:30');
  });
});

describe('roundToTransfers', () => {
  const nameOf = (id) => ({ A: '玩家1', B: '玩家2', C: '玩家3', D: '玩家4' }[id] || id);

  test('manual 1 对 1 出分 → 收分', () => {
    const transfers = roundToTransfers(
      { _id: 'r1', scoreChanges: { A: -5, B: 5 } },
      nameOf
    );
    expect(transfers).toEqual([{ from: '玩家1', to: '玩家2', value: 5 }]);
  });

  test('auto 多对（自摸 1v3）', () => {
    const transfers = roundToTransfers(
      { _id: 'r1', scoreChanges: { A: -2, B: -2, C: -2, D: 6 } },
      nameOf
    );
    expect(transfers.length).toBe(3);
    expect(transfers[0]).toEqual({ from: '玩家1', to: '玩家4', value: 2 });
    expect(transfers[1]).toEqual({ from: '玩家2', to: '玩家4', value: 2 });
    expect(transfers[2]).toEqual({ from: '玩家3', to: '玩家4', value: 2 });
  });

  test('空 scoreChanges → 空数组', () => {
    expect(roundToTransfers({}, nameOf)).toEqual([]);
  });
});
