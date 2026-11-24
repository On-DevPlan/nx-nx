#!/usr/bin/env node
// 单文件行数门禁（CI 验收工具）：
//
//   ≤ 600     干净
//   601-800   警告区：必须登记在 line-lint-registry.json，登记值即上限——
//              只许降不许升；涨到登记值之上按错误处理
//   801-1000  严禁区：登记也不放行，必须拆分/精简
//   > 1000    严禁：必须拆分/精简
//
// 登记项随文件瘦身而失效：文件 ≤600 后登记变成「过期」，必须移除——
// 这逼 registry 单调收紧，最终空表 = 验收完全成功。
//
// 用法：
//   node scripts/check-lines.mjs          扫全部受控源码文件
//   node scripts/check-lines.mjs --init   把当前 601-800 文件按现状写进 registry（仅建基线用）
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const REGISTRY = join(ROOT, 'scripts', 'line-lint-registry.json');

const LIMIT_OK = 600;      // ≤600 干净
const LIMIT_WARN = 800;    // 601-800 必须登记；>800 严禁
const LIMIT_HARD = 1000;   // >1000 严禁

// 与 eslint.config.js 的 ignores 对齐：构建产物与工具目录不参与。
// 注意走文件系统而不是 git ls-files——新建未跟踪的文件不能漏检，
// 已删未提交的文件也不该读到。
const IGNORED_DIRS = new Set(['node_modules', '.git', 'dist', 'coverage', '.tool', '.claude']);
const IGNORED_PREFIX = ['src/web/public/', 'src/web/frontend/dist/'];
// 受控源码后缀
const SCAN_RE = /\.(ts|tsx|js|jsx|mjs|css)$/;
// codegen 产物不参与行数门禁：形状由生成器决定，瘦身只能靠改生成策略，
// 靠「拆文件」没有意义。
const GENERATED_RE = /\.generated\.ts$/;

function sourceFiles(dir = ROOT, prefix = '') {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${e.name}` : e.name;
    if (e.isDirectory()) {
      if (!IGNORED_DIRS.has(e.name)) out.push(...sourceFiles(join(dir, e.name), rel));
    } else if (
      SCAN_RE.test(e.name) &&
      !GENERATED_RE.test(e.name) &&
      !IGNORED_PREFIX.some((p) => rel.startsWith(p))
    ) {
      out.push(rel);
    }
  }
  return out;
}

/**
 * 统计**有效代码行**：跳过空行与整行注释。
 *
 * 口径必须与 eslint 的 max-lines（skipBlankLines + skipComments）一致——
 * 两把尺子若按不同口径数同一个文件，会出现「eslint 说 590、check-lines 说
 * 620」这种打架（同一件事两把尺子量出两个数，规则就不作数了）。
 * 块注释 /* … *\/ 内的行同样跳过。
 */
export function countLines(text) {
  if (!text) return 0;
  const lines = text.split('\n');
  let count = 0;
  let inBlock = false;
  for (const raw of lines) {
    const line = raw.trim();
    if (inBlock) {
      if (line.includes('*/')) inBlock = false;
      continue;
    }
    if (!line) continue;
    if (line.startsWith('//')) continue;
    if (line.startsWith('/*')) {
      if (!line.includes('*/')) inBlock = true;
      continue;
    }
    count += 1;
  }
  return count;
}

function loadRegistry() {
  if (!existsSync(REGISTRY)) return {};
  const data = JSON.parse(readFileSync(REGISTRY, 'utf8'));
  return data.files || {};
}

export function checkLines() {
  const registry = loadRegistry();
  const errors = [];
  const warnings = [];
  const relaxed = [];
  const seen = new Set();

  for (const file of sourceFiles()) {
    const lines = countLines(readFileSync(join(ROOT, file), 'utf8'));
    seen.add(file);
    if (lines > LIMIT_HARD) {
      errors.push(`${file}: ${lines} 行 > ${LIMIT_HARD}（严禁）——必须拆分/精简，登记不放行`);
    } else if (lines > LIMIT_WARN) {
      errors.push(`${file}: ${lines} 行 > ${LIMIT_WARN}（严禁区）——必须拆分/精简`);
    } else if (lines > LIMIT_OK) {
      const cap = registry[file];
      if (cap === undefined) {
        errors.push(`${file}: ${lines} 行 > ${LIMIT_OK}（警告区）且未登记——请登记或精简`);
      } else if (lines > cap) {
        errors.push(`${file}: ${lines} 行超过登记上限 ${cap}——只许降不许升`);
      } else {
        warnings.push(`${file}: ${lines} 行（已登记，上限 ${cap}）`);
      }
    }
  }

  // 过期登记：文件没了、或已经瘦到 ≤600 —— registry 必须跟着收紧
  for (const [file, cap] of Object.entries(registry)) {
    if (!seen.has(file)) {
      errors.push(`registry: ${file} 已不存在，请移除登记（上限 ${cap}）`);
    } else {
      const lines = countLines(readFileSync(join(ROOT, file), 'utf8'));
      if (lines <= LIMIT_OK) {
        errors.push(`registry: ${file} 已降至 ${lines} 行（≤${LIMIT_OK}），请移除过期登记`);
      } else if (lines < cap) {
        warnings.push(`registry: ${file} ${lines} 行，登记上限 ${cap} 可收紧`);
      }
    }
  }

  return { ok: errors.length === 0, errors, warnings, relaxed, registrySize: Object.keys(registry).length };
}

function initRegistry() {
  const files = {};
  for (const file of sourceFiles()) {
    const lines = countLines(readFileSync(join(ROOT, file), 'utf8'));
    if (lines > LIMIT_OK && lines <= LIMIT_WARN) files[file] = lines;
  }
  writeFileSync(REGISTRY, JSON.stringify({ files }, null, 2) + '\n');
  console.log(`已登记 ${Object.keys(files).length} 个警告文件（${LIMIT_OK + 1}-${LIMIT_WARN}）到 scripts/line-lint-registry.json`);
  for (const [f, n] of Object.entries(files)) console.log(`  ${n} ${f}`);
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  if (process.argv[2] === '--init') {
    initRegistry();
    process.exit(0);
  }
  const r = checkLines();
  console.log(`行数门禁：≤${LIMIT_OK} 干净 / ${LIMIT_OK + 1}-${LIMIT_WARN} 必须登记 / >${LIMIT_WARN} 严禁（当前登记 ${r.registrySize} 项）`);
  if (r.warnings.length) {
    console.log('警告:');
    for (const w of r.warnings) console.log('  ! ' + w);
  }
  if (!r.ok) {
    console.error('发现不合规项:');
    for (const e of r.errors) console.error('  ✗ ' + e);
    process.exit(1);
  }
  console.log('  全部合规：无严禁文件，警告文件均已登记。');
}
