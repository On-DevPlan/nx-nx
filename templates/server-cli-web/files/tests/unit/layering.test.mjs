// 分层：src/modules/<域> 之间不得互相值依赖。
//
// 这条以前写在 eslint 的 no-restricted-imports 里，靠**逐模块枚举路径**实现：
// 新增模块必须同步去 eslint.config.js 补两处枚举，漏补一处那条约束就静默失效
// （旧测试甚至专门写了一条"你补了枚举没"来盯这件事）。
//
// 判定「这条 import 是不是指向兄弟模块」需要解析真实路径——
// `../home/x` 与 `../../core/x` 在字符串层面长得太像，minimatch 分不开。
// 那是 lint 规则不擅长、而测试很擅长的活：这里直接 resolve 目标文件，
// 看它落在 src/modules 下的哪个目录。新模块零配置，也不会随枚举过期。
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const MODULES = join(ROOT, 'src/modules');

// 只认「带 from 的静态 import/export」，且 `import type` 直接放行（编译后擦除）。
const IMPORT_RE = /^\s*(?:import|export)\s+(type\s+)?[^;]*?from\s+'([^']+)'/gm;

test('src/modules/<域> 之间不得互相值依赖（类型引用允许）', async () => {
  const dirs = (await readdir(MODULES, { withFileTypes: true }))
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  const problems = [];

  for (const dir of dirs) {
    const entries = await readdir(join(MODULES, dir), { recursive: true, withFileTypes: true });
    for (const e of entries) {
      if (!e.isFile() || !/\.tsx?$/.test(e.name)) continue;
      const abs = join(e.parentPath || join(MODULES, dir), e.name);
      const text = await readFile(abs, 'utf8');

      for (const m of text.matchAll(IMPORT_RE)) {
        const isTypeOnly = !!m[1];
        const spec = m[2];
        if (isTypeOnly || !spec.startsWith('.')) continue;

        const target = resolve(dirname(abs), spec);
        const [owner] = relative(MODULES, target).split(sep);
        // owner 为 '' 或 '..' = 指向 modules 之外（core / runtime / 包），允许
        if (owner && owner !== '..' && owner !== dir) {
          problems.push(`${dir}/${relative(join(MODULES, dir), abs)} → ${spec}`);
        }
      }
    }
  }

  assert.deepEqual(problems, [], '模块之间不得做值依赖；共享逻辑请下沉到 src/core/');
});
