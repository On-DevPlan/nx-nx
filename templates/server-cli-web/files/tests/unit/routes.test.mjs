// 路由的唯一真相是文件系统：routes/<名>.ts 声明路由，pages/<名>/index.tsx 是页面本体。
//
// 旧骨架要把同一件事写三遍（后端 core/views.ts、前端 COMPONENTS、测试对账），
// 漏一处不报错、页面悄悄消失。现在只有一处，这条测试守的就是「这一处本身合法」：
//   - 每条路由声明都有对应的 pages/<名>/index.tsx
//   - path 唯一且以 / 开头
//   - page 是函数（否则 Vite 拿不到代码分割点，整个前端会被打进一个 chunk）
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const FRONTEND = join(ROOT, 'src/web/frontend');
const ROUTES = join(FRONTEND, 'routes');
const PAGES = join(FRONTEND, 'pages');

const routeFiles = (await readdir(ROUTES, { withFileTypes: true }))
  .filter((d) => d.isFile() && d.name.endsWith('.ts') && d.name !== 'contract.ts')
  .map((d) => d.name.replace(/\.ts$/, ''))
  .sort();

test('每条 routes/<名>.ts 都有 pages/<名>/index.tsx', () => {
  assert.ok(routeFiles.length > 0, '至少要有一条路由');
  for (const id of routeFiles) {
    assert.ok(
      existsSync(join(PAGES, id, 'index.tsx')),
      `routes/${id}.ts 缺 pages/${id}/index.tsx（路由声明指不到组件）`,
    );
  }
});

test('路由声明里的 page 必须是函数（保住按页代码分割）', () => {
  for (const id of routeFiles) {
    const src = readFileSync(join(ROUTES, id + '.ts'), 'utf8');
    assert.match(src, /page:\s*\(\)\s*=>\s*import\(/, `routes/${id}.ts 的 page 必须写成 () => import(...)`);
    assert.doesNotMatch(src, /page:\s*[^()\s]/, `routes/${id}.ts 的 page 不得是静态引用`);
  }
});

test('path 唯一且以 / 开头', () => {
  const seen = new Map();
  for (const id of routeFiles) {
    const src = readFileSync(join(ROUTES, id + '.ts'), 'utf8');
    const m = /path:\s*'([^']+)'/.exec(src);
    assert.ok(m, `routes/${id}.ts 缺 path 声明`);
    const path = m[1];
    assert.ok(path.startsWith('/'), `routes/${id}.ts 的 path 必须以 / 开头: ${path}`);
    assert.ok(!seen.has(path), `path 重复: ${path}（${seen.get(path)} 与 ${id}）`);
    seen.set(path, id);
  }
});

test('契约文件不该被当成路由（contract.ts 必须存在且导出 definePage）', () => {
  const src = readFileSync(join(ROUTES, 'contract.ts'), 'utf8');
  assert.match(src, /export function definePage/, 'contract.ts 必须导出 definePage');
});

test('默认壳是左侧栏，且 pages.ts 不回头 import layouts.ts（防循环依赖白屏）', () => {
  const home = readFileSync(join(ROUTES, 'home.ts'), 'utf8');
  assert.doesNotMatch(home, /^\s*layout:/m, '首页不该写 layout——要展示默认壳');
  const def = readFileSync(join(FRONTEND, 'app/layout-default.ts'), 'utf8');
  assert.match(def, /DEFAULT_LAYOUT\s*=\s*'sidebar'/, '默认壳必须是 sidebar');
  const pages = readFileSync(join(FRONTEND, 'app/pages.ts'), 'utf8');
  assert.match(pages, /from '\.\/layout-default\.js'/, 'pages.ts 只能读常量文件');
  assert.doesNotMatch(pages, /from '\.\/layouts\.js'/, 'pages.ts 不得 import layouts.ts（会形成 pages→layouts→shell→nav→pages 环）');
});
