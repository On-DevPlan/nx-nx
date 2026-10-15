// 设置模块测试：重点在**导航配置的校验**——写坏了头部就少一块或摆错位，
// 所以坏形状 / 不存在的页面 / 跨组重复 / 空组 / 坏 id 都必须明确报错，而不是被静默丢掉。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function withStore() {
  const dir = mkdtempSync(join(tmpdir(), '{{name}}-settings-'));
  process.env.{{envPrefix}}_STORE = join(dir, 'store.json');
}

async function loadModules() {
  const settings = await import('../../src/modules/settings/service.ts');
  const store = await import('../../src/core/store.ts');
  return { settings, store };
}

test('默认设置：navGroups / navHidden 都是空数组（老 store 读一次自动补）', async () => {
  withStore();
  const { settings, store } = await loadModules();
  const s = await store.loadStore();
  assert.deepEqual(s.settings.navGroups, []);
  assert.deepEqual(s.settings.navHidden, []);
  const got = await settings.getSettings();
  assert.ok(got.views.some((v) => v.id === 'home'), 'getSettings 要带上页面清单（头部据此渲染）');
});

test('navGroups：组内顺序原样落盘，不被 order / 字典序重排', async () => {
  withStore();
  const { settings, store } = await loadModules();
  await settings.setSettings({ set: { navGroups: [{ title: '先设置后首页', views: ['settings', 'home'] }] } });
  assert.deepEqual((await store.loadStore()).settings.navGroups[0].views, ['settings', 'home']);
});

test('navGroups：组内重复去重；PATCH 只改传入项', async () => {
  withStore();
  const { settings, store } = await loadModules();
  await settings.setSettings({ set: { navGroups: [{ title: 'A', views: ['home', 'home'] }], navHidden: ['settings'] } });
  let s = await store.loadStore();
  assert.deepEqual(s.settings.navGroups[0].views, ['home']);
  assert.deepEqual(s.settings.navHidden, ['settings']);

  // 只改隐藏 → 分组保持原样
  await settings.setSettings({ set: { navHidden: [] } });
  s = await store.loadStore();
  assert.deepEqual(s.settings.navGroups[0].views, ['home']);
  assert.deepEqual(s.settings.navHidden, []);
});

test('navGroups 校验：坏形状 / 页面不存在 / 跨组重复 / 缺组名 / 空组 —— 都拒绝且不落盘', async () => {
  withStore();
  const { settings, store } = await loadModules();
  const before = JSON.stringify((await store.loadStore()).settings);

  const cases = [
    [{ title: 'x' }, /数组/],
    [[{ views: ['home'] }], /缺少 title/],
    [[{ title: 'A', views: ['nope'] }], /不存在: nope/],
    [[{ title: 'A', views: ['home'] }, { title: 'B', views: ['home'] }], /只能属于一个分组/],
    [[{ title: '空组', views: [] }], /没有任何页面/],
  ];
  for (const [navGroups, re] of cases) {
    await assert.rejects(
      settings.setSettings({ set: { navGroups } }),
      (e) => e.code === 'INVALID_INPUT' && re.test(e.message),
      `应拒绝: ${JSON.stringify(navGroups)}`,
    );
  }
  assert.equal(JSON.stringify((await store.loadStore()).settings), before, '校验失败不得落盘');
});

test('navHidden 校验：页面不存在要报错；字符串（CLI --hidden）也认', async () => {
  withStore();
  const { settings, store } = await loadModules();
  await assert.rejects(
    settings.setSettings({ set: { navHidden: 'nope' } }),
    (e) => e.code === 'INVALID_INPUT' && /不存在/.test(e.message),
  );
  await settings.setSettings({ set: { navHidden: 'home,settings' } });
  assert.deepEqual((await store.loadStore()).settings.navHidden, ['home', 'settings']);
});

test('未知设置项 / 空 patch 都明确报错', async () => {
  withStore();
  const { settings } = await loadModules();
  await assert.rejects(settings.setSettings({ set: { 不存在的项: 1 } }), /未知设置项/);
  await assert.rejects(settings.setSettings({}), /至少要给一项/);
});

test('--dry-run 只演练不落盘', async () => {
  withStore();
  const { settings, store } = await loadModules();
  const r = await settings.setSettings({ set: { navGroups: [{ title: 'A', views: ['home'] }] }, 'dry-run': true });
  assert.equal(r.status, 'skipped');
  assert.deepEqual((await store.loadStore()).settings.navGroups, []);
});

test('navHidden / navOrder：页面必须存在；数组、逗号串、JSON 串三种写法都认', async () => {
  withStore();
  const { settings, store } = await loadModules();

  const a = await settings.setSettings({ set: { navHidden: ['settings'], navOrder: 'home,settings' } });
  assert.deepEqual(a.settings.navHidden, ['settings']);
  assert.deepEqual(a.settings.navOrder, ['home', 'settings']);

  const b = await settings.setSettings({ set: { navOrder: '["settings","home"]' } });
  assert.deepEqual(b.settings.navOrder, ['settings', 'home'], 'CLI 的 JSON 串写法等价于数组');

  await assert.rejects(
    settings.setSettings({ set: { navHidden: 'no_such_page' } }),
    (e) => e.code === 'INVALID_INPUT' && /不存在/.test(e.message),
  );
  await assert.rejects(
    settings.setSettings({ set: { navOrder: '[bad json' } }),
    (e) => e.code === 'INVALID_INPUT',
  );
  assert.deepEqual((await store.loadStore()).settings.navOrder, ['settings', 'home'], '校验失败不得落盘');
});

test('getSettings：带上页面清单（头部与设置页都按它渲染）', async () => {
  withStore();
  const { settings } = await loadModules();
  const d = await settings.getSettings();
  assert.ok(d.views.some((v) => v.id === 'home'));
  assert.ok(d.views.some((v) => v.id === 'settings'));
  assert.match(settings.renderSettings(d), /页面（\d+）/);
});
