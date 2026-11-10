// IoC 自动注册的对账：**清单（manifest）与 actions/ 目录必须一致**。
//
// 清单由 `pnpm gen:actions` 扫 actions/ 目录生成（新增一个 action 文件 = 新建文件 +
// 跑一次生成，模块 index.ts 零改动）。这条测试把「清单里的类」与「目录里的类」
// 逐个对账——忘了跑生成就红，而不是等到运行时才发现少了一条 action。
//
// 同时钉住两条形状约定：
//   - 每个 action 类都继承 ActionBase（容器按 `new (deps: Container) => T` 建实例）；
//   - 注册表里的 action 总数 = 各模块清单之和（没有游离在清单之外的 action）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const MODULES_DIR = join(ROOT, 'src', 'modules');

const { ActionBase } = await import(pathToFileURL(join(ROOT, 'src', 'runtime', 'action-base.ts')).href);

function moduleDirs() {
  return readdirSync(MODULES_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
}

async function classesIn(dir) {
  const out = [];
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.ts') && !f.startsWith('_')).sort()) {
    const mod = await import(pathToFileURL(join(dir, file)).href);
    for (const [name, value] of Object.entries(mod)) {
      if (typeof value === 'function' && value.prototype && value.prototype instanceof ActionBase) {
        out.push(name);
      }
    }
  }
  return out.sort();
}

test('每个模块的清单 = 该模块 actions/ 目录里的 ActionBase 子类（新鲜度对账）', async () => {
  for (const dir of moduleDirs()) {
    const actionsDir = join(MODULES_DIR, dir, 'actions');
    let files;
    try {
      files = readdirSync(actionsDir);
    } catch {
      continue; // 该模块没有 actions/ 目录（如纯模块）
    }
    if (!files.some((f) => f.endsWith('.ts') && !f.startsWith('_'))) continue;

    const inDir = await classesIn(actionsDir);
    const manifest = await import(pathToFileURL(join(actionsDir, '_manifest.generated.ts')).href);
    const inManifest = manifest.ACTIONS.map((C) => C.name).sort();

    assert.deepEqual(inManifest, inDir, `${dir} 的清单与 actions/ 目录不一致——运行 pnpm gen`);
  }
});

test('注册表里的 action 总数 = 各模块清单之和（没有游离的 action）', async () => {
  const { registry } = await import(pathToFileURL(join(ROOT, 'src', 'runtime', 'registry.ts')).href);
  let fromManifests = 0;
  for (const dir of moduleDirs()) {
    const actionsDir = join(MODULES_DIR, dir, 'actions');
    try {
      const manifest = await import(pathToFileURL(join(actionsDir, '_manifest.generated.ts')).href);
      fromManifests += manifest.ACTIONS.length;
    } catch {
      // 无清单的模块没有 action
    }
  }
  assert.equal(registry.actions.length, fromManifests, '注册表里的 action 数与清单之和不一致');
});
