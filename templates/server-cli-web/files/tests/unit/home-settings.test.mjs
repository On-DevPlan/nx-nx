// 设置能力测试（设置逻辑归属 home 模块）：重点在**服务层校验的边界**。
//
// 边界只有一条：后端校验**形状**，不校验「页面是否存在」。
// 有哪些页面是前端路由树的事实（src/web/frontend/views/），后端既不知道也不需要知道；
// 拿它去做存在性校验，后果是每加一个页面都要改后端、删一个页面就让整份配置报错。
//
// 摆法自身的矛盾（跨组重复）仍然拒绝——那是与「页面存不存在」无关的数据矛盾。
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
  const home = await import('../../src/modules/home/service.ts');
  const store = await import('../../src/core/store.ts');
  return { home, store };
}

test('默认设置：navGroups / navHidden 都是空数组（老 store 读一次自动补）', async () => {
  withStore();
  const { home, store } = await loadModules();
  const s = await store.loadStore();
  assert.deepEqual(s.settings.navGroups, []);
  assert.deepEqual(s.settings.navHidden, []);
  const got = await home.getSettings();
  assert.deepEqual(Object.keys(got).sort(), ['schema', 'settings'], 'getSettings 只返回设置与说明，不再带页面清单');
});

test('navGroups：含 home 的分组原样落盘，不被 order / 字典序重排', async () => {
  withStore();
  const { home, store } = await loadModules();
  await home.setSettings({ set: { navGroups: [{ title: '系统', views: ['home'] }] } });
  assert.deepEqual((await store.loadStore()).settings.navGroups, [{ title: '系统', views: ['home'] }]);
});

test('navGroups：PATCH 只改传入项（改主题不影响已存分组）', async () => {
  withStore();
  const { home, store } = await loadModules();
  await home.setSettings({ set: { navGroups: [{ title: '系统', views: ['home'] }] } });
  await home.setSettings({ set: { theme: 'dark' } });
  const s = await store.loadStore();
  assert.deepEqual(s.settings.navGroups, [{ title: '系统', views: ['home'] }]);
  assert.equal(s.settings.theme, 'dark');
});

test('navGroups 校验：坏形状 / 缺组名 / 跨组重复 —— 都拒绝且不落盘', async () => {
  withStore();
  const { home, store } = await loadModules();
  const before = JSON.stringify((await store.loadStore()).settings);

  const cases = [
    [{ title: 'x' }, /数组/],
    [[{ views: ['home'] }], /缺少 title/],
    [[{ title: 'A', views: ['home'] }, { title: 'B', views: ['home'] }], /只能属于一个分组/],
  ];
  for (const [navGroups, re] of cases) {
    await assert.rejects(
      home.setSettings({ set: { navGroups } }),
      (e) => e.code === 'INVALID_INPUT' && re.test(e.message),
      `应拒绝: ${JSON.stringify(navGroups)}`,
    );
  }
  assert.equal(JSON.stringify((await store.loadStore()).settings), before, '校验失败不得落盘');
});

test('后端不校验页面存在性：任意 id、空分组都接受（前端负责忽略/提示）', async () => {
  withStore();
  const { home, store } = await loadModules();

  await home.setSettings({ set: { navGroups: [{ title: 'A', views: ['no_such_page'] }] } });
  assert.deepEqual((await store.loadStore()).settings.navGroups, [{ title: 'A', views: ['no_such_page'] }]);

  await home.setSettings({ set: { navGroups: [{ title: 'B', views: [] }] } });
  assert.deepEqual((await store.loadStore()).settings.navGroups, [{ title: 'B', views: [] }], '空分组允许暂存');

  await home.setSettings({ set: { navHidden: 'whatever' } });
  assert.deepEqual((await store.loadStore()).settings.navHidden, ['whatever']);
});

test('navHidden：数组 / 逗号串 / JSON 串都认，并去重保序', async () => {
  withStore();
  const { home, store } = await loadModules();
  await home.setSettings({ set: { navHidden: 'home' } });
  assert.deepEqual((await store.loadStore()).settings.navHidden, ['home']);
  await home.setSettings({ set: { navHidden: 'a,b,a' } });
  assert.deepEqual((await store.loadStore()).settings.navHidden, ['a', 'b'], '逗号串去重保序');
  await home.setSettings({ set: { navHidden: '["x","y"]' } });
  assert.deepEqual((await store.loadStore()).settings.navHidden, ['x', 'y'], 'JSON 串');
});

test('theme：只认 light / dark / auto，坏值拒绝', async () => {
  withStore();
  const { home, store } = await loadModules();
  await home.setSettings({ set: { theme: 'dark' } });
  assert.equal((await store.loadStore()).settings.theme, 'dark');
  await assert.rejects(
    home.setSettings({ set: { theme: 'blue' } }),
    (e) => e.code === 'INVALID_INPUT' && /light \/ dark \/ auto/.test(e.message),
  );
});

test('未知设置项 / 空 patch 都明确报错', async () => {
  withStore();
  const { home } = await loadModules();
  await assert.rejects(home.setSettings({ set: { 不存在的项: 1 } }), /未知设置项/);
  await assert.rejects(home.setSettings({}), /至少要给一项/);
});

test('--dry-run 只演练不落盘', async () => {
  withStore();
  const { home, store } = await loadModules();
  const r = await home.setSettings({ set: { navGroups: [{ title: '系统', views: ['home'] }] }, 'dry-run': true });
  assert.equal(r.status, 'skipped');
  assert.deepEqual((await store.loadStore()).settings.navGroups, []);
});

test('navOrder：可排序；坏 JSON 拒绝', async () => {
  withStore();
  const { home, store } = await loadModules();

  const a = await home.setSettings({ set: { navOrder: 'home' } });
  assert.deepEqual(a.settings.navOrder, ['home']);

  await assert.rejects(
    home.setSettings({ set: { navOrder: '[bad json' } }),
    (e) => e.code === 'INVALID_INPUT',
  );
  assert.deepEqual((await store.loadStore()).settings.navOrder, ['home'], '校验失败不得落盘');
});

test('renderSettings：打印摆法，且说明页面清单来自前端', async () => {
  withStore();
  const { home } = await loadModules();
  const d = await home.getSettings();
  const text = home.renderSettings(d);
  assert.match(text, /隐藏 \d+ 个/);
  assert.match(text, /前端路由树/, '要明确告诉人：页面清单不在后端');
});
