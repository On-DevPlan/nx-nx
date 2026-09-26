// eslint 枚举清单的一致性测试。
//
// 背景：分层禁列用不了否定式 glob（eslint 9 的负模式对 `../` 相对路径全部失效，
// 实测记录在 eslint.config.js 注释里），退回枚举式。枚举的经典问题是
// 「新增模块忘补清单 → 静默失效」——这个文件存在的意义就是把静默变响亮：
// 新增 src/modules/<x>/ 而没更新 eslint.config.js 的清单，这里直接红。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

// 聚合器模块：豁免于通用禁列（bootstrap 要引用各业务模块的 service）
const AGGREGATORS = new Set(['system']);

test('lint 清单覆盖全部业务模块（新增模块必须登记 eslint.config.js）', () => {
  const config = readFileSync(join(ROOT, 'eslint.config.js'), 'utf8');

  const dirs = readdirSync(join(ROOT, 'src', 'modules'), { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  const missing = dirs.filter((m) => !AGGREGATORS.has(m) && !config.includes(`src/modules/${m}/**`));

  assert.deepEqual(
    missing,
    [],
    `以下业务模块没有登记进 eslint.config.js 的分层禁列（files 数组），` +
      `它们将不受「模块互依禁令」保护：${missing.join(', ')}\n` +
      `修复：在 eslint.config.js 的通用块 files 里加 'src/modules/<名>/**/*.{js,jsx}'，` +
      `并在 group 里补 '../<名>/*'（供其他模块的禁列引用）。`
  );
});

test('lint 通用块的 group 覆盖全部业务模块（互为禁列）', () => {
  const config = readFileSync(join(ROOT, 'eslint.config.js'), 'utf8');
  const dirs = readdirSync(join(ROOT, 'src', 'modules'), { withFileTypes: true })
    .filter((d) => d.isDirectory() && !AGGREGATORS.has(d.name))
    .map((d) => d.name);

  // 每个业务模块都要出现在某个禁列 group 里（别人不许碰它）
  const notListed = dirs.filter((m) => !config.includes(`'../${m}/*`));
  assert.deepEqual(
    notListed,
    [],
    `以下模块没有被任何禁列 group 提及（别人 import 它不会被打拦）：${notListed.join(', ')}`
  );
});

test('view.jsx 只 import 前端壳与 react（不拖 node 侧代码进浏览器包）', () => {
  // 与 eslint 的前端规则互为备份：这条能在不跑 eslint 的环境下（如 node --test）兜底
  const { globSync } = readdirSyncGlobs();
  for (const file of globSync) {
    const src = readFileSync(file, 'utf8');
    const bad = src.match(/from\s+'[^']*(core|runtime)\/[^']*';/g);
    assert.equal(bad, null, `${file} 引用了 Node 侧代码: ${bad}`);
  }
});

function readdirSyncGlobs() {
  const walk = (dir, acc = []) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p, acc);
      else if (e.name.endsWith('.view.jsx') || e.name === 'view.jsx') acc.push(p);
    }
    return acc;
  };
  return { globSync: walk(join(ROOT, 'src', 'modules')) };
}
