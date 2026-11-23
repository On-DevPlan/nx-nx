// 生成物的新鲜度对账：改了 action 声明却忘了跑 `pnpm gen` → 当场红。
//
// 对账方式：现场重新生成一遍，与入库的文件逐字比对。**不写盘**——
// 测试只报告差异，避免测试过程污染工作区（真要写入由 pnpm gen 负责）。
//
// 这条测试是「action 自动生成规范」能成立的前提：没有它，生成物迟早过期，
// 而过期的清单会让新 action 静默失效（模块装不上它，编译期也不报）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const MODULES_DIR = join(ROOT, 'src', 'modules');

const { generateActionManifests } = await import('../../scripts/gen-actions.mjs');

test('各模块的 action 清单已生成（新增 action 文件后要跑 pnpm gen）', async () => {
  const { manifests, problems } = await generateActionManifests(ROOT);
  assert.deepEqual(problems, [], `action 声明有问题：\n  ${problems.join('\n  ')}`);

  const stale = [];
  for (const m of manifests) {
    const abs = join(ROOT, m.path);
    if (!existsSync(abs)) {
      stale.push(`${m.path}（缺失）`);
      continue;
    }
    if (readFileSync(abs, 'utf8') !== m.body) {
      stale.push(`${m.path}（内容已过期）`);
    }
  }
  assert.deepEqual(
    stale,
    [],
    `以下生成物已过期——改了 action 声明要跑 \`pnpm gen\` 再提交：\n  ${stale.join('\n  ')}`
  );
});

test('action 文件与清单一一对应（清单不能漏收，也不能多收）', async () => {
  const { manifests } = await generateActionManifests(ROOT);
  const problems = [];

  for (const m of manifests) {
    const actionsDir = join(ROOT, m.path.replace(/_manifest\.generated\.ts$/, ''));
    const files = readdirSync(actionsDir).filter((f) => f.endsWith('.ts') && !f.startsWith('_'));
    const imported = (m.body.match(/^import \w+ from '\.\//gm) || []).length;
    if (imported !== files.length) {
      problems.push(`${actionsDir}: action 文件 ${files.length} 个，清单收录 ${imported} 个（跑 pnpm gen）`);
    }
  }

  // 有 actions/ 目录的模块必须有清单
  for (const entry of readdirSync(MODULES_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const actionsDir = join(MODULES_DIR, entry.name, 'actions');
    if (!existsSync(actionsDir)) continue;
    const manifest = join(actionsDir, '_manifest.generated.ts');
    if (!existsSync(manifest)) {
      problems.push(`${actionsDir}: 缺 _manifest.generated.ts（跑 pnpm gen）`);
    }
  }

  assert.deepEqual(problems, [], problems.join('\n'));
});

test('每个 action 文件都导出一个 default（生成器靠它收集）', async () => {
  const problems = [];
  for (const entry of readdirSync(MODULES_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const actionsDir = join(MODULES_DIR, entry.name, 'actions');
    if (!existsSync(actionsDir)) continue;
    for (const file of readdirSync(actionsDir)) {
      if (!file.endsWith('.ts') || file.startsWith('_')) continue;
      const src = readFileSync(join(actionsDir, file), 'utf8');
      if (!/export\s+default\s/.test(src)) {
        problems.push(`${entry.name}/actions/${file}: 没有 default 导出`);
      }
    }
  }
  assert.deepEqual(problems, [], problems.join('\n'));
});
