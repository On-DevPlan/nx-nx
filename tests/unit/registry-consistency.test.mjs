// action ↔ CLI ↔ HTTP ↔ 前端视图 的四方一致性。
//
// 把「Web 上每个操作都有等价 CLI 命令」从口头约定变成可执行断言。
// 需要对齐的三张表：
//   1. src/runtime/registry.ts 的后端注册表 → 决定 CLI 命令与 HTTP 路由
//   2. src/web/frontend/registry.ts 的前端视图注册表 → 决定面板有哪些页
//   3. 视图里实际调用的 /api 路径 → 必须都有对应路由
//
// 这套断言的价值：任何一条 action 漏了 CLI、路由与视图对不上、或视图调了
// 不存在的接口，都会在**编译后立刻**红，而不是等用户点开面板才发现。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

const { ACTIONS } = await import(pathToFileURL(join(ROOT, 'src', 'runtime', 'registry.js')).href);
const { resolveCommand } = await import(pathToFileURL(join(ROOT, 'src', 'runtime', 'cli.js')).href);
const { cliPathsOf } = await import(pathToFileURL(join(ROOT, 'src', 'runtime', 'spec.js')).href);

/** 递归收集某目录下的全部文件（相对仓库根，正斜杠）。 */
function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(abs));
    else out.push(abs);
  }
  return out;
}

test('每条 action 都声明了 CLI 命令（Web 操作必须有 CLI 等价）', () => {
  const missing = ACTIONS.filter((a) => !a.cli || cliPathsOf(a).length === 0).map((a) => a.id);
  assert.deepEqual(missing, [], `这些 action 没有 CLI 命令：${missing.join(', ')}`);
});

test('action 的 http 要么是路由数组，要么显式 null', () => {
  const bad = ACTIONS.filter((a) => a.http !== null && a.http !== undefined && !Array.isArray(a.http)).map(
    (a) => a.id
  );
  assert.deepEqual(bad, [], `这些 action 的 http 既不是路由数组也不是 null：${bad.join(', ')}`);
});

test('每条 action 的 CLI 路径都能被运行器解析回它自己', () => {
  // 这是「命令真的敲得出来」的零副作用证明：只走命令匹配，不执行任何 action。
  // 匹配算法一改坏（别名竞争、最长匹配失效），这里立刻失败。
  for (const a of ACTIONS) {
    for (const path of cliPathsOf(a)) {
      const hit = resolveCommand(path);
      assert.ok(hit, `命令 ${path.join(' ')} 无法被解析`);
      assert.equal(hit.cmd.id, a.id, `命令 ${path.join(' ')} 被解析到了 ${hit.cmd.id}，而非声明的 ${a.id}`);
      assert.deepEqual(hit.rest, [], `命令 ${path.join(' ')} 解析后仍有剩余参数`);
    }
  }
});

test('HTTP 路由唯一（同一个方法 + 路径不能声明两次）', () => {
  const seen = new Map();
  const problems = [];
  for (const a of ACTIONS) {
    if (!a.http) continue;
    const key = `${a.http[0]} ${a.http[1]}`;
    if (seen.has(key)) problems.push(`${key}（${seen.get(key)} 与 ${a.id}）`);
    else seen.set(key, a.id);
  }
  assert.deepEqual(problems, [], `HTTP 路由重复：\n  ${problems.join('\n  ')}`);
});

test('HTTP 路由没有结构性歧义（不同模式匹配同一批 URL）', () => {
  const segs = (p) => p.split('/').filter(Boolean);
  const segMatch = (a, b) => a.startsWith(':') || b.startsWith(':') || a === b;
  const compatible = (p, q) => {
    const a = segs(p);
    const b = segs(q);
    return a.length === b.length && a.every((s, i) => segMatch(s, b[i]));
  };
  const routes = ACTIONS.filter((a) => a.http).map((a) => ({ id: a.id, method: a.http[0], path: a.http[1] }));
  const problems = [];
  for (let i = 0; i < routes.length; i++) {
    for (let j = i + 1; j < routes.length; j++) {
      const a = routes[i];
      const b = routes[j];
      if (a.method !== b.method) continue;
      if (compatible(a.path, b.path)) problems.push(`${a.id} ${a.method} ${a.path} ≈ ${b.id} ${b.method} ${b.path}`);
    }
  }
  assert.deepEqual(problems, [], `存在结构性歧义的路由：\n  ${problems.join('\n  ')}`);
});

test('视图调用的每个 /api 路径都有对应路由', () => {
  const routes = ACTIONS.filter((a) => a.http).map((a) => a.http);
  const PLATFORM = new Set(['/api/ping', '/api/localtasks/events']);
  const problems = [];
  for (const file of walk(join(ROOT, 'src', 'web', 'frontend'))) {
    if (!/\.(ts|tsx)$/.test(file)) continue;
    const src = readFileSync(file, 'utf8');
    for (const m of src.matchAll(/['"`](\/api\/[^'"`\s]*)['"`]/g)) {
      const raw = m[1];
      const clean = raw.split('?')[0].replace(/\$\{[^}]+\}/g, ':param');
      if (!clean.startsWith('/api/') || PLATFORM.has(clean)) continue;
      const segs = clean.split('/').filter(Boolean);
      const hit = routes.some((r) => {
        const rs = r[1].split('/').filter(Boolean);
        if (rs.length !== segs.length) return false;
        return rs.every((s, i) => s.startsWith(':') || segs[i] === s || segs[i] === ':param');
      });
      if (!hit) problems.push(`${file.replace(ROOT, '')} → ${raw}`);
    }
  }
  assert.deepEqual(problems, [], `这些接口调用没有对应路由：\n  ${problems.join('\n  ')}`);
});

test('前端视图注册表指向的文件真实存在', () => {
  const registry = readFileSync(join(ROOT, 'src', 'web', 'frontend', 'registry.ts'), 'utf8');
  const problems = [];
  for (const m of registry.matchAll(/import\(['"](\.[^'"]+)['"]\)/g)) {
    const abs = join(ROOT, 'src', 'web', 'frontend', m[1]);
    const candidates = [abs, `${abs}.tsx`, `${abs}.ts`];
    if (!candidates.some((c) => {
      try {
        return statSync(c).isFile();
      } catch {
        return false;
      }
    })) {
      problems.push(m[1]);
    }
  }
  assert.deepEqual(problems, [], `前端注册表指向了不存在的文件：\n  ${problems.join('\n  ')}`);
});
