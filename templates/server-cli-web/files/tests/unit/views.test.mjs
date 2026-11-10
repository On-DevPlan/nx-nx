// 页面的唯一真相是文件系统：views/<名>/route.ts。
//
// 旧骨架要把同一件事写三遍（后端 core/views.ts、前端 COMPONENTS、测试对账），
// 漏一处不报错、页面悄悄消失。现在只有一处，这条测试守的就是「这一处本身合法」：
//   - 每个 view 目录都有 route.ts 与 page.tsx
//   - path 唯一且以 / 开头
//   - page 是函数（否则 Vite 拿不到代码分割点，整个前端会被打进一个 chunk）
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const VIEWS = join(ROOT, 'src/web/frontend/views');

const viewDirs = (await readdir(VIEWS, { withFileTypes: true }))
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .sort();

test('每个 views/<名>/ 都有自己的 route.ts 与 page.tsx', () => {
  assert.ok(viewDirs.length > 0, '至少要有一个页面');
  for (const dir of viewDirs) {
    assert.ok(existsSync(join(VIEWS, dir, 'route.ts')), `views/${dir} 缺 route.ts（不会被路由发现）`);
    assert.ok(existsSync(join(VIEWS, dir, 'page.tsx')), `views/${dir} 缺 page.tsx`);
  }
});

test('route.ts 声明合法：path 唯一、以 / 开头、page 是函数', async () => {
  const defs = [];
  for (const dir of viewDirs) {
    const mod = await import(`../../src/web/frontend/views/${dir}/route.ts`);
    const def = mod.default;
    assert.ok(def, `views/${dir}/route.ts 必须有默认导出`);
    assert.match(def.path, /^\//, `views/${dir}: path 必须以 / 开头`);
    assert.equal(typeof def.page, 'function', `views/${dir}: page 必须是函数，否则代码分割失效`);
    if (def.nav) {
      assert.ok(def.nav.label && typeof def.nav.label === 'string', `views/${dir}: nav.label 必须是非空字符串`);
    }
    defs.push({ dir, path: def.path });
  }

  const paths = defs.map((d) => d.path);
  const dupes = paths.filter((p, i) => paths.indexOf(p) !== i);
  assert.deepEqual(dupes, [], '路由 path 不能重复：' + dupes.join(', '));
});
