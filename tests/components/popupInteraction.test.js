function loadComponent(name, props = {}) {
  let definition;
  global.Component = value => { definition = value; };
  jest.resetModules();
  require('../../miniprogram/components/' + name + '/index');
  const properties = Object.fromEntries(Object.entries(definition.properties).map(([key, value]) => [key, value.value]));
  const context = {
    properties: { ...properties, ...props }, data: structuredClone(definition.data),
    setData(update) { Object.assign(this.data, update); }, triggerEvent: jest.fn(),
  };
  for (const [key, fn] of Object.entries(definition.methods)) context[key] = fn.bind(context);
  if (definition.lifetimes) definition.lifetimes.attached.call(context);
  return context;
}
beforeEach(() => { global.wx = { getStorageSync: jest.fn(() => '') }; });
afterEach(() => { delete global.Component; delete global.wx; });

describe.each(['score-popup', 'base-score-popup'])('%s 无效输入与确认', name => {
  test.each(['', '0', '-5', '1.5', 'abc', '9007199254740992'])('输入 %s 不允许确认，也不关闭弹窗', value => {
    const component = loadComponent(name);
    component.onInput({ detail: { value } });
    expect(component.data.canConfirm).toBe(false);
    component.onConfirm();
    expect(component.triggerEvent).not.toHaveBeenCalled();
  });
  test('输入、快捷选择和增减均更新确认状态', () => {
    const component = loadComponent(name);
    component.onInput({ detail: { value: '10' } });
    expect(component.data.canConfirm).toBe(true);
    component.onConfirm();
    expect(component.triggerEvent).toHaveBeenCalledWith('confirm', { value: 10 });
    component.onQuickTap({ currentTarget: { dataset: { v: '1' } } });
    component.onDec();
    expect(component.data.canConfirm).toBe(false);
    component.onInc();
    expect(component.data.canConfirm).toBe(true);
  });
});

test('选头像只更新弹窗草稿，取消不发送头像修改或保存事件', () => {
  const component = loadComponent('player-popup', { avatarIndex: 0, nickname: '东风' });
  component.onTapAvatar({ currentTarget: { dataset: { idx: 4 } } });
  expect(component.data.draftAvatarIndex).toBe(4);
  expect(component.data.systemNickname).toBe('红中');
  expect(component.properties.avatarIndex).toBe(0);
  expect(component.triggerEvent).not.toHaveBeenCalled();
  component.onMaskTap();
  expect(component.triggerEvent.mock.calls).toEqual([['close']]);
  const reopened = loadComponent('player-popup', { avatarIndex: 0, nickname: '东风' });
  expect(reopened.data.draftAvatarIndex).toBe(0);
});

test('确认时提交草稿头像；系统昵称与所选头像一致', () => {
  const component = loadComponent('player-popup', { avatarIndex: 0, nickname: '东风' });
  component.onTapAvatar({ currentTarget: { dataset: { idx: 5 } } });
  const log = jest.spyOn(console, 'log').mockImplementation(() => {});
  component.onConfirm();
  expect(component.triggerEvent).toHaveBeenCalledWith('confirm', {
    nickname: '白板', avatarIndex: 5, selectedNicknameType: 'system',
  });
  log.mockRestore();
});

test('编辑以房间当前昵称为准，不被旧的本地自定义昵称覆盖', () => {
  wx.getStorageSync.mockReturnValue('旧昵称');
  const component = loadComponent('player-popup', { avatarIndex: 0, nickname: '新昵称' });
  expect(component.data.selectedNicknameType).toBe('custom');
  expect(component.data.inputNickname).toBe('新昵称');
});
