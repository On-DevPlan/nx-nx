// 分层边界的硬保证：前后端彻底分离。
//
// 「视图归前端」这条规矩一旦破，坏得很快也很难查：
//   - 前端视图躺在 src/modules/ 下 → 顺手 import ../../core/xxx 的**值**，
//     node: 内置模块被 Vite 打进浏览器包；
//   - 后端模块 import 前端组件 → 形成环，两边都别想单独测；
//   - 视图里的相对路径深度与前端自己的组件不一致 → 搬一次目录断一次 import。
//
// 所以这里不靠 lint 兜底（lint 只能拦住「引了 react」，拦不住「一个纯 tsx 文件」），
// 而是直接把「后端模块目录里不许出现视图文件」钉成断言。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const MODULES_DIR = join(ROOT, 'src', 'modules');
const FRONTEND_DIR = join(ROOT, 'src', 'web', 'frontend');

/** 递归收集某目录下的全部文件（相对路径，正斜杠）。 */
function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(abs));
    else out.push(relative(ROOT, abs).replace(/\\/g, '/'));
  }
  return out;
}

/** 剥掉注释与字符串字面量，只留「真代码」——避免注释里的 import 被误判。 */
function stripCommentsAndStrings(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1')
    .replace(/'(?:[^'\\]|\\.)*'/g, "''")
    .replace(/"(?:[^"\\]|\\.)*"/g, '""')
    .replace(/`(?:[^`\\]|\\.)*`/g, '``');
}

test('后端模块目录里不许出现视图文件（视图归 src/web/frontend/ 管）', () => {
  const offenders = walk(MODULES_DIR).filter((f) => /\.(tsx|jsx)$/.test(f));
  assert.deepEqual(
    offenders,
    [],
    `这些视图文件还在后端模块目录里：\n  ${offenders.join('\n  ')}\n` +
      `修复：把文件搬到 src/web/frontend/page/<域>/，并更新 src/web/frontend/registry.ts 的指向。`
  );
});

test('后端模块不得 import 前端（依赖只能向下）', () => {
  const problems = [];
  for (const file of walk(MODULES_DIR).filter((f) => f.endsWith('.ts'))) {
    const src = stripCommentsAndStrings(readFileSync(join(ROOT, file), 'utf8'));
    const re = /(?:^|\n)\s*import\s+(?!type\s)[^'"]*from\s*['"]([^'"]+)['"]/g;
    for (const m of src.matchAll(re)) {
      const spec = m[1];
      if (spec.includes('web/frontend') || /^\.\..*\/web\//.test(spec)) {
        problems.push(`${file} → ${spec}`);
      }
    }
  }
  assert.deepEqual(
    problems,
    [],
    `后端模块引用了前端代码：\n  ${problems.join('\n  ')}\n` +
      `修复：前端的东西由 src/web/frontend/ 自己持有；后端只提供 /api/*。`
  );
});

test('前端不得值导入后端（node: 内置模块会进浏览器包）', () => {
  const problems = [];
  for (const file of walk(FRONTEND_DIR).filter((f) => f.endsWith('.ts') || f.endsWith('.tsx'))) {
    const src = stripCommentsAndStrings(readFileSync(join(ROOT, file), 'utf8'));
    const re = /(?:^|\n)\s*import\s+(?!type\s)[^'"]*from\s*['"]([^'"]+)['"]/g;
    for (const m of src.matchAll(re)) {
      const spec = m[1];
      const isNodeSide =
        spec.startsWith('node:') ||
        /(^|\/)core\//.test(spec) ||
        /(^|\/)runtime\//.test(spec) ||
        /(^|\/)modules\/[^/]+\/(index|service)\.js$/.test(spec);
      if (isNodeSide) problems.push(`${file} → ${spec}`);
    }
  }
  assert.deepEqual(
    problems,
    [],
    `前端值导入了后端模块：\n  ${problems.join('\n  ')}\n` +
      `修复：改成 import type（类型引用编译期擦除），或经 /api/* 取数据。`
  );
});

test('core 是最底层：不得依赖 modules / runtime / web', () => {
  const problems = [];
  for (const file of walk(join(ROOT, 'src', 'core')).filter((f) => f.endsWith('.ts'))) {
    const src = stripCommentsAndStrings(readFileSync(join(ROOT, file), 'utf8'));
    const re = /(?:^|\n)\s*import\s+(?!type\s)[^'"]*from\s*['"]([^'"]+)['"]/g;
    for (const m of src.matchAll(re)) {
      const spec = m[1];
      if (/\.\.\/(modules|runtime|web)\//.test(spec)) problems.push(`${file} → ${spec}`);
    }
  }
  assert.deepEqual(problems, [], `core 依赖了上层：\n  ${problems.join('\n  ')}`);
});

test('前端视图注册表里的文件真实存在', () => {
  const registry = readFileSync(join(FRONTEND_DIR, 'registry.ts'), 'utf8');
  const problems = [];
  for (const m of registry.matchAll(/import\(['"](\.[^'"]+)['"]\)/g)) {
    const spec = m[1];
    const abs = join(FRONTEND_DIR, spec);
    // 懒加载的路径不带扩展名，逐个候选试。
    const candidates = [abs, `${abs}.tsx`, `${abs}.ts`, `${abs}.jsx`];
    if (!candidates.some((c) => {
      try {
        return statSync(c).isFile();
      } catch {
        return false;
      }
    })) {
      problems.push(spec);
    }
  }
  assert.deepEqual(problems, [], `前端注册表指向了不存在的文件：\n  ${problems.join('\n  ')}`);
});
