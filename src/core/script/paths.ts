// 内置脚本目录的定位与清单。
//
// 「内置脚本」= 随包分发的 .mjs 脚本，放在 assets/scripts/ 下：
//   aliases.mjs      内置全局函数（别名模块）
//   _runner.mjs      解释器入口：注入全局函数 → 导入并执行脚本
//   manifest.json    脚本清单（名字 + 说明 + 用法）
//   <name>.mjs       具体脚本
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { notFound, specError } from '../errors/index.js';

const HERE = dirname(fileURLToPath(import.meta.url));

export interface ScriptInfo {
  name: string;
  description: string;
  usage: string;
  notes: string;
  path: string;
}

// 定位 assets/scripts/。
// 两种布局都要覆盖：源码跑（src/core/script/paths.ts）与构建产物（dist/core/script/paths.js）——
// 两者到仓库根都是三层，所以同一个相对路径同时成立。
export function scriptsDir(): string {
  const candidates = [
    join(HERE, '..', '..', '..', 'assets', 'scripts'),
    join(process.cwd(), 'assets', 'scripts'),
  ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  throw specError('找不到内置脚本目录 assets/scripts（尝试过: ' + candidates.join(', ') + ')');
}

export function runnerPath(): string {
  const p = join(scriptsDir(), '_runner.mjs');
  if (!existsSync(p)) throw specError('内置脚本解释器缺失: ' + p);
  return p;
}

export function aliasesPath(): string {
  const p = join(scriptsDir(), 'aliases.mjs');
  if (!existsSync(p)) throw specError('别名模块缺失: ' + p);
  return p;
}

interface ManifestEntry {
  name: string;
  description?: string;
  usage?: string;
  notes?: string;
}

function readManifest(): ManifestEntry[] {
  const p = join(scriptsDir(), 'manifest.json');
  if (!existsSync(p)) return [];
  let parsed: { scripts?: ManifestEntry[] };
  try {
    parsed = JSON.parse(readFileSync(p, 'utf8')) as { scripts?: ManifestEntry[] };
  } catch {
    return [];
  }
  return Array.isArray(parsed.scripts) ? parsed.scripts : [];
}

// 清单里的脚本 + 目录里实际存在的 .mjs，两边取并集：
// 清单管说明，目录管真相——加了脚本忘了登记清单，也照样能跑（只是没说明）。
export function listScripts(): ScriptInfo[] {
  const dir = scriptsDir();
  const manifest = new Map(readManifest().map((e) => [e.name, e]));
  const onDisk = readdirSync(dir)
    .filter((f) => f.endsWith('.mjs') && !f.startsWith('_'))
    .map((f) => f.replace(/\.mjs$/, ''))
    .filter((f) => f !== 'aliases');
  const names = [...new Set([...manifest.keys(), ...onDisk])].sort();
  return names.map((name) => {
    const e = manifest.get(name);
    return {
      name,
      description: e?.description ?? '',
      usage: e?.usage ?? '',
      notes: e?.notes ?? '',
      path: join(dir, name + '.mjs'),
    };
  });
}

// 解析脚本目标：内置脚本名，或任意 .mjs 路径（相对当前工作目录）。
export function resolveScript(name: string): { name: string; path: string } {
  const raw = String(name || '').trim();
  if (!raw) throw notFound('缺少脚本名');
  if (raw.endsWith('.mjs') || raw.includes('/') || raw.includes('\\')) {
    const abs = isAbsolute(raw) ? raw : resolve(process.cwd(), raw);
    if (!existsSync(abs)) throw notFound(`脚本不存在: ${abs}`);
    return { name: raw, path: abs };
  }
  const p = join(scriptsDir(), raw + '.mjs');
  if (!existsSync(p)) {
    const available = listScripts()
      .map((s) => s.name)
      .join(', ');
    throw notFound(`未找到内置脚本: ${raw}（可用: ${available || '(无)'}）`);
  }
  return { name: raw, path: p };
}
