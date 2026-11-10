// 注册表与 action 契约的一致性断言。
//
// 这里**不再有**「页面清单 ↔ 组件表 ↔ 模块目录」三方对账 —— 那三方已经合成一个：
// 页面由 src/web/frontend/routes/*.ts 这个文件系统事实决定（见 routes.test.mjs）。
// 剩下的断言只关于 action：模块登记全不全、CLI/HTTP 是否成对、豁免名单是否两边一致。
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

const moduleDirs = (await readdir(join(ROOT, 'src/modules'), { withFileTypes: true }))
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .sort();

test('src/modules 下每个目录都必须登记进运行时注册表（且不能多登记）', async () => {
  const { MODULES } = await import('../../src/runtime/registry.ts');
  assert.deepEqual(MODULES.map((m) => m.id).sort(), moduleDirs, '模块目录与 MODULES 必须一一对应');
});

// ---- 操作成对：CLI ↔ Web 不漏声明 ----

test('action 声明成对：http 必须是路由，或 null + 豁免前缀 / web: false', async () => {
  const { ACTIONS, CLI_ONLY_PREFIXES } = await import('../../src/runtime/registry.ts');
  const { cliPathsOf } = await import('../../src/runtime/spec.ts');

  const exempt = new Set(CLI_ONLY_PREFIXES);
  for (const a of ACTIONS) {
    const paths = cliPathsOf(a);
    assert.ok(paths.length, `action ${a.id} 缺 CLI 命令（Web 操作必须有 CLI 等价）`);

    if (a.http) {
      assert.ok(Array.isArray(a.http) && a.http.length === 2, `action ${a.id} 的 http 必须是 [method, path]`);
      assert.notEqual(a.web, false, `action ${a.id} 同时有 http 与 web: false，语义冲突`);
      continue;
    }

    assert.equal(a.http, null, `action ${a.id} 的 http 必须是路由数组或显式 null`);
    const segment = paths[0][0];
    assert.ok(
      a.web === false || exempt.has(segment),
      `action ${a.id} 是纯 CLI，但没有显式 web: false，也不在豁免前缀（${CLI_ONLY_PREFIXES.join(' / ')}）内`
    );
  }
});

test('eslint 与 runtime 的 CLI-only 豁免前缀一致', async () => {
  const { CLI_ONLY_PREFIXES } = await import('../../src/runtime/registry.ts');
  const cfg = await readFile(join(ROOT, 'eslint.config.js'), 'utf8');
  const block = /cliOnlyPrefixes:\s*\[([^\]]*)\]/.exec(cfg);
  assert.ok(block, 'eslint.config.js 里找不到 local/action-parity 的 cliOnlyPrefixes');
  const lintPrefixes = [...block[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
  assert.deepEqual(lintPrefixes, CLI_ONLY_PREFIXES, '两处豁免前缀必须一致');
});

test('非 GET 操作必须有面板入口（前端引用了 action id 或路由路径）', async () => {
  const { ACTIONS, CLI_ONLY_PREFIXES } = await import('../../src/runtime/registry.ts');
  const { cliPathsOf } = await import('../../src/runtime/spec.ts');

  // 扫整个 src/web：页面与壳都在这里，不再需要单独照顾 modules/<域>/view.*
  const entries = await readdir(join(ROOT, 'src/web'), { recursive: true, withFileTypes: true });
  const chunks = [];
  for (const e of entries) {
    if (!e.isFile()) continue;
    if (!/\.(ts|tsx)$/.test(e.name)) continue;
    chunks.push(await readFile(join(e.parentPath || join(ROOT, 'src/web'), e.name), 'utf8'));
  }
  const frontend = chunks.join('\n');
  const exempt = new Set(CLI_ONLY_PREFIXES);

  for (const a of ACTIONS) {
    if (!a.http) continue;
    const [method, pattern] = a.http;
    if (method === 'GET' || method === 'HEAD') continue;
    if (exempt.has(cliPathsOf(a)[0][0])) continue;

    // 前端可能按 action id（typed client）或按路由路径（api()）调用
    const routePrefix = pattern.replace(/\/:[\w-]+/g, '');
    const refs = [a.id, routePrefix];
    assert.ok(
      refs.some((r) => frontend.includes(r)),
      `写操作 ${a.id}（${method} ${pattern}）在面板前端找不到入口——补 UI，或显式声明 web: false`
    );
  }
});
