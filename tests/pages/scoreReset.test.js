function loadPage(name) {
  let definition;
  global.Page = value => { definition = value; };
  require('../../miniprogram/pages/room/' + name + '/index');
  return { ...definition, data: structuredClone(definition.data),
    setData(update) { Object.assign(this.data, update); } };
}
let store;
beforeEach(() => {
  jest.resetModules();
  global.wx = { showModal: jest.fn(), showToast: jest.fn() };
  store = require('../../miniprogram/stores/roomStore');
  store.rule = { baseScore: 2 };
  store.isOwner = true;
  store.roomId = 'r';
  store.currentPlayerId = 'a';
  store.players = [{ _id: 'a' }, { _id: 'b', nickname: '白板' }];
});
afterEach(() => { delete global.Page; delete global.wx; });

test('黄梅默认七对和碰碰胡为10炮，辅助计算和配置页共用默认值', () => {
  const rule = require('../../miniprogram/rules/huangmei');
  const auto = loadPage('auto-score');
  auto.onLoad();
  const config = loadPage('rule-config');
  config.onLoad();
  for (const key of ['qiyidui', 'pengpenghu']) {
    expect(rule.getCardTypeFan(key)).toBe(10);
    expect(auto.data.hmCardTypes.find(c => c.key === key).fan).toBe(10);
    expect(config.data.cardTypes.find(c => c.key === key).fan).toBe(10);
    auto.setData({ hmCardTypeKeys: [key], baseScoreEditable: 2 });
    auto._recompute();
    expect(auto.data.amount).toBe(20);
    expect(rule.getCardTypeFan(key, { cardTypeFans: { [key]: 15 } })).toBe(15);
  }
});

test.each(['huangmei', 'sichuan'])('%s 辅助算分取消重置保留选择，确认后才重置', ruleType => {
  const page = loadPage('auto-score');
  page.onLoad();
  page.setData({ ruleType, hmCardTypeKeys: ['qiyidui'], scCardType: 'qiyidui', targetId: 'b',
    targetName: '白板', baseScoreEditable: 8 });
  const before = structuredClone(page.data);
  page.onReset();
  expect(page.data).toEqual(before);
  wx.showModal.mock.calls[0][0].success({ confirm: false });
  expect(page.data).toEqual(before);
  expect(wx.showToast).not.toHaveBeenCalled();
  page.onReset();
  wx.showModal.mock.calls[1][0].success({ confirm: true });
  expect(page.data.targetId).toBe('');
  expect(page.data.baseScoreEditable).toBe(2);
  if (ruleType === 'huangmei') expect(page.data.hmCardTypeKeys).toEqual(['pinghu']);
  else expect(page.data.scCardType).toBe('pinghu');
  expect(wx.showToast).toHaveBeenCalledWith({ title: '已重置', icon: 'success', duration: 1000 });
});

test('配置页重置需确认，仅修改草稿，保留已保存的房间规则', () => {
  store.rule = { baseScore: 2, cardTypeFans: { qiyidui: 25, pengpenghu: 30 } };
  const page = loadPage('rule-config');
  page.onLoad();
  const before = structuredClone(page.data);
  page.onReset();
  wx.showModal.mock.calls[0][0].success({ confirm: false });
  expect(page.data).toEqual(before);
  page.onReset();
  wx.showModal.mock.calls[1][0].success({ confirm: true });
  expect(page.data.cardTypes.find(c => c.key === 'qiyidui').fan).toBe(10);
  expect(page.data.cardTypes.find(c => c.key === 'pengpenghu').fan).toBe(10);
  expect(store.rule.cardTypeFans).toEqual({ qiyidui: 25, pengpenghu: 30 });
});

test('非房主不能重置玩法配置', () => {
  store.isOwner = false;
  const page = loadPage('rule-config');
  page.onLoad();
  page.onReset();
  expect(wx.showModal).not.toHaveBeenCalled();
});
