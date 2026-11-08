// 管理空间（namespace）的单元测试：装载 / 方法清单 / 调用 / 堆快照 / bool check。
//
// 空间是「共享面板被装载后的可管理实体」——测试要钉住它的契约：
//   1. 装载后能列出方法（面板里的函数就是方法）
//   2. 状态（堆）只输出可 JSON 表示的部分，不可表示的只报类型
//   3. 能调用方法并拿到结果
//   4. check 动作调用返回 bool 的方法，给出 alive 判定
//
// 一律在临时目录里造面板，绝不碰真实 assets/scripts。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { aliasesPath } from '../../src/core/script/paths.js';
import {
  callSpaceMethod,
  checkSpace,
  introspectSpace,
  resolvePanelPath,
} from '../../src/core/service/namespace.js';

function tmp() {
  return mkdtempSync(join(tmpdir(), 'nxnx-ns-'));
}

/** 造一个面板：显式 defineSpace + 传统 globalThis 两种风格各来一份 */
function panelCase() {
  const dir = tmp();
  const panel = join(dir, 'demo.shared.mjs');
  const aliases = pathToFileURL(aliasesPath()).href;
  writeFileSync(
    panel,
    [
      `import { installAliases } from '${aliases}';`,
      "import { defineSpace } from '" + pathToFileURL(join(aliasesPath(), '..', '_ns.mjs')).href + "';",
      'installAliases(globalThis);',
      "globalThis.API_TOKEN = 'tok_abc123';",
      'globalThis._internalCache = new Map([["k", "v"]]);',
      'globalThis.checkUp = async function checkUp() { return true; };',
      'globalThis.alwaysDown = async function alwaysDown() { return false; };',
      'globalThis.sum = function sum(a, b) { return a + b; };',
      "globalThis.__tests = { 'token 非空': () => API_TOKEN.length > 3 };",
      'export const SPACE = defineSpace({',
      "  name: 'demo',",
      "  description: '演示空间',",
      "  state: { BASE_URL: 'http://127.0.0.1:18999' },",
      '  methods: {',
      '    ping: async function ping() { return { ok: true }; },',
      '  },',
      '});',
    ].join('\n'),
    { encoding: 'utf8' },
  );
  return { dir, panel };
}

test('空间装载：方法清单可列举（面板里的函数 + defineSpace 的 methods）', async () => {
  const { dir, panel } = panelCase();
  try {
    const r = await introspectSpace(panel);
    assert.equal(r.ok, true, r.error);
    const names = (r.methods ?? []).map((m) => m.name);
    // globalThis 上的函数 → 方法
    assert.ok(names.includes('checkUp'), `方法清单缺 checkUp：${names.join(',')}`);
    assert.ok(names.includes('sum'), `方法清单缺 sum：${names.join(',')}`);
    // defineSpace 显式声明的方法 → 方法
    assert.ok(names.includes('ping'), `方法清单缺 ping：${names.join(',')}`);
    // 参数个数与 async 标记要对
    const sum = (r.methods ?? []).find((m) => m.name === 'sum');
    assert.equal(sum?.arity, 2);
    const checkUp = (r.methods ?? []).find((m) => m.name === 'checkUp');
    assert.equal(checkUp?.async, true);
    // 空间有名字
    assert.equal(r.space && r.space.name, 'demo');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('空间堆快照：只输出可 JSON 表示的部分，不可表示的只报类型', async () => {
  const { dir, panel } = panelCase();
  try {
    const r = await introspectSpace(panel);
    assert.equal(r.ok, true, r.error);
    const heap = r.heap ?? [];
    const byKey = new Map(heap.map((h) => [h.key, h]));
    assert.equal(byKey.get('API_TOKEN')?.describe, '"tok_abc123"');
    assert.equal(byKey.get('BASE_URL')?.describe, '"http://127.0.0.1:18999"');
    // Map 报类型与条数，而不是误导性的 {}
    assert.match(byKey.get('_internalCache')?.describe ?? '', /\[Map · 1 项\]/);
    assert.doesNotMatch(byKey.get('_internalCache')?.describe ?? '', /\{\}/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('空间方法可调用：参数与返回值原样回来', async () => {
  const { dir, panel } = panelCase();
  try {
    const r = await callSpaceMethod(panel, 'sum', [2, 3]);
    assert.equal(r.ok, true, r.error);
    assert.equal(r.value, 5);

    const p = await callSpaceMethod(panel, 'ping', []);
    assert.equal(p.ok, true, p.error);
    assert.deepEqual(p.value, { ok: true });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('空间方法不存在时如实报错（不静默返回 undefined）', async () => {
  const { dir, panel } = panelCase();
  try {
    const r = await callSpaceMethod(panel, 'noSuchMethod', []);
    assert.equal(r.ok, false);
    assert.match(r.error ?? '', /没有方法 noSuchMethod/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('空间方法抛错：如实报错并带上调用栈（排错要看得见从哪调进去的）', async () => {
  const dir = tmp();
  const panel = join(dir, 'boom.shared.mjs');
  writeFileSync(
    panel,
    [
      'globalThis.explode = function explode() { throw new Error("业务炸了"); };',
    ].join('\n'),
    { encoding: 'utf8' },
  );
  try {
    const r = await callSpaceMethod(panel, 'explode', []);
    assert.equal(r.ok, false);
    assert.match(r.error ?? '', /业务炸了/);
    assert.ok(Array.isArray(r.stack), '失败时应当带调用栈');
    assert.ok(r.stack.length > 0, '调用栈不该是空的');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('空间 check：bool 方法给出 alive 判定，非 true 一律判不通过', async () => {
  const { dir, panel } = panelCase();
  try {
    const up = await checkSpace(panel, 'checkUp');
    assert.equal(up.alive, true, up.detail);
    assert.match(up.detail, /checkUp/);

    const down = await checkSpace(panel, 'alwaysDown');
    assert.equal(down.alive, false);
    assert.match(down.detail, /非 true/);

    // 方法不存在 → 不通过（保守：宁可不起，也不假装活）
    const missing = await checkSpace(panel, 'nope');
    assert.equal(missing.alive, false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('resolvePanelPath：包内面板按名解析，不存在的面板如实报错', () => {
  const p = resolvePanelPath('demo.shared');
  assert.match(p, /demo\.shared\.mjs$/);
  assert.throws(() => resolvePanelPath('no-such-panel-xyz'), /空间面板不存在/);
});
