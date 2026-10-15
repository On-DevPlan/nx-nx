// 一致性断言：把「页面清单 ↔ 组件 ↔ 模块目录 ↔ 注册表 ↔ lint 清单」钉在一起。
//
// 这几处不同步的后果各不相同，但都不会当场报错：
//   清单里有、组件没有 → 头部点进去空白
//   组件有、清单没有   → 那个页面永远进不了头部（等于白写）
//   模块目录有、注册表没有 → CLI/HTTP 全都没有，面板也拿不到
//   lint 清单漏了模块   → 模块之间可以随便互相 import，分层静默失效
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

const moduleDirs = (await readdir(join(ROOT, 'src/modules'), { withFileTypes: true }))
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .sort();

test('core/views 的页面清单 ↔ 前端 COMPONENTS ↔ 模块目录 三方对账', async () => {
  const { VIEWS_META } = await import('../../src/core/views.ts');
  const { COMPONENT_IDS } = await import('../../src/web/frontend/registry.ts');

  const viewIds = VIEWS_META.map((v) => v.id).sort();
  assert.deepEqual([...COMPONENT_IDS].sort(), viewIds, '页面清单与组件表必须一一对应');

  for (const v of VIEWS_META) {
    assert.ok(v.title && typeof v.title === 'string', `页面 ${v.id} 缺 title`);
    assert.equal(typeof v.order, 'number', `页面 ${v.id} 的 order 必须是数字`);
  }

  // 页面 id 与模块目录同名（本骨架的约定：一个模块提供一页）
  for (const id of viewIds) {
    assert.ok(moduleDirs.includes(id), `页面 ${id} 没有对应的模块目录 src/modules/${id}/`);
    assert.ok(
      existsSync(join(ROOT, 'src/modules', id, 'view.tsx')),
      `模块 ${id} 缺 view.tsx——页面清单里登记了它，就得有组件`,
    );
  }
});

test('模块目录 ↔ 后端 MODULES 双向对账；有 view 的模块必须在页面清单里', async () => {
  const { MODULES } = await import('../../src/runtime/registry.ts');
  const { VIEWS_META } = await import('../../src/core/views.ts');

  const registered = MODULES.map((m) => m.id).sort();
  assert.deepEqual(registered, moduleDirs, 'src/modules 下的每个目录都必须登记进运行时注册表（且不能多登记）');

  const viewIds = new Set(VIEWS_META.map((v) => v.id));
  for (const id of moduleDirs) {
    const hasView = existsSync(join(ROOT, 'src/modules', id, 'view.tsx'));
    if (hasView) assert.ok(viewIds.has(id), `模块 ${id} 有 view.tsx，但没登记进 core/views.ts——它永远进不了头部`);
  }
});

test('eslint 的模块清单覆盖全部模块（新增模块必须补两处枚举）', async () => {
  const cfg = await readFile(join(ROOT, 'eslint.config.js'), 'utf8');

  // 1) 模块互依禁列（逐模块枚举，漏补 → 该模块可以随便 import 别人）
  const siblingBlock = /业务模块：模块之间禁止互相值依赖[\s\S]*?\n  \},/.exec(cfg);
  assert.ok(siblingBlock, '找不到业务模块禁列块');
  for (const id of moduleDirs) {
    assert.match(siblingBlock[0], new RegExp(`'../${id}/\\*'`), `禁列里缺 ../${id}/*`);
  }

  // 2) 前端规则的文件清单（视图 tsx 必须被覆盖，否则「前端别导入 node:」那条形同虚设）
  const frontBlock = /前端（含[\s\S]*?\n  \},/.exec(cfg);
  assert.ok(frontBlock, '找不到前端规则块');
  for (const id of moduleDirs) {
    if (!existsSync(join(ROOT, 'src/modules', id, 'view.tsx'))) continue;
    assert.match(frontBlock[0], new RegExp(`src/modules/${id}/\\*\\*/\\*\\.tsx`), `前端规则的文件清单里缺 src/modules/${id}/**/*.tsx`);
  }
});
