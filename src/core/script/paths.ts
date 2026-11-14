// 内置脚本目录的定位与清单。
//
// 「内置脚本」= 随包分发的 .mjs 脚本，放在 assets/scripts/ 下：
//   aliases.mjs      内置全局函数（别名模块）
//   _runner.mjs      解释器入口：注入全局函数 → 导入并执行脚本
//   manifest.json    脚本清单（名字 + 说明 + 用法）
//   <name>.mjs       具体脚本
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { conflict, notFound, specError } from '../errors/index.js';

const HERE = dirname(fileURLToPath(import.meta.url));

export interface ScriptInfo {
  name: string;
  description: string;
  usage: string;
  notes: string;
  path: string;
  /** 共享函数面板（.shared.mjs）：可编辑、不可直接运行（服务组自动装载） */
  shared: boolean;
  /**
   * 脚本的三类角色（同一套后缀约定，列表与运行入口都据此分流）：
   *   long    普通 .mjs：Node 子进程里跑（能碰 fs / 网络 / 常驻）——服务组的主/停脚本
   *   short   .short.mjs：沙箱片段（QuickJS，无 fs / 无网络）——一次性计算与验算
   *   shared  .shared.mjs：共享面板，只声明不作入口
   */
  kind: 'long' | 'short' | 'shared';
}

// 定位 assets/scripts/。
// 两种布局都要覆盖：源码跑（src/core/script/paths.ts）与构建产物（dist/core/script/paths.js）——
// 两者到仓库根都是三层，所以同一个相对路径同时成立。
export function scriptsDir(): string {
  // NX_NX_SCRIPTS 是测试/自定义脚本目录的覆盖点：设了且存在就优先用它。
  const envDir = process.env.NX_NX_SCRIPTS;
  if (envDir) {
    const abs = isAbsolute(envDir) ? envDir : resolve(process.cwd(), envDir);
    if (existsSync(abs)) return abs;
  }
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

// 沙箱解释器：与 _runner.mjs 同一目录，同一套「assets/scripts 随包分发」的约定。
export function sandboxPath(): string {
  const p = join(scriptsDir(), '_sandbox.mjs');
  if (!existsSync(p)) throw specError('沙箱解释器缺失: ' + p);
  return p;
}

// 短脚本执行台账（一行一次运行，JSONL）：
// 「跑过什么、什么时候、多久、产出哪些键、报了什么错」——出问题先翻这里。
// 与服务组日志同一层（~/.nx-nx/），但目录分开：这两类记录的生命周期不一样。
export function scriptRunsLogPath(): string {
  const appDir = process.env.NX_NX_HOME
    ? join(process.env.NX_NX_HOME, '.nx-nx')
    : join(homedir(), '.nx-nx');
  return join(appDir, 'logs', 'script-runs.jsonl');
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
// 清单管说明，目录管真相——加了脚本忘了登记清单，也照样能跑（只是没说明）；
// 反过来，清单里有但磁盘上已删除的条目不列出（否则 UI 会点到幽灵脚本）。
// `.shared.mjs`（共享函数面板）一并列出：可编辑，但运行入口被 resolveScript 拒绝。
export function listScripts(): ScriptInfo[] {
  const dir = scriptsDir();
  const manifest = new Map(readManifest().map((e) => [e.name, e]));
  const onDisk = readdirSync(dir)
    .filter((f) => f.endsWith('.mjs') && !f.startsWith('_'))
    .map((f) => f.replace(/\.mjs$/, ''))
    .filter((f) => f !== 'aliases');
  const names = [...new Set([...manifest.keys(), ...onDisk])]
    .filter((name) => existsSync(join(dir, name + '.mjs')))
    .sort();
  return names.map((name) => {
    const e = manifest.get(name);
    const shared = name.endsWith('.shared');
    const kind = shared ? 'shared' : name.endsWith('.short') ? 'short' : 'long';
    return {
      name,
      description:
        e?.description ??
        (shared ? '共享函数面板（服务组自动装载，不可直接运行）' : kind === 'short' ? '短脚本片段（沙箱执行）' : ''),
      usage: e?.usage ?? '',
      notes: e?.notes ?? '',
      path: join(dir, name + '.mjs'),
      shared,
      kind,
    };
  });
}

// 解析脚本目标：内置脚本名，或任意 .mjs 路径（相对当前工作目录）。
export function resolveScript(name: string): { name: string; path: string } {
  const raw = String(name || '').trim();
  if (!raw) throw notFound('缺少脚本名');
  if (raw.endsWith('.shared') || raw.endsWith('.shared.mjs')) {
    throw conflict('共享函数面板不能作为入口直接执行——它由组内脚本自动装载（每次执行前注入并输出变量快照）');
  }
  if (raw.endsWith('.short') || raw.endsWith('.short.mjs')) {
    throw conflict('短脚本片段要在沙箱里跑：nx-nx js sandbox <名字>（不落 Node 进程，无 fs / 无网络）');
  }
  if (raw.endsWith('.mjs') || raw.includes('/') || raw.includes('\\')) {
    const abs = isAbsolute(raw) ? raw : resolve(process.cwd(), raw);
    if (!existsSync(abs)) throw notFound(`脚本不存在: ${abs}`);
    return { name: raw, path: abs };
  }
  const p = join(scriptsDir(), raw + '.mjs');
  if (!existsSync(p)) {
    if (existsSync(join(scriptsDir(), raw + '.short.mjs'))) {
      throw conflict(`「${raw}」是短脚本片段，要在沙箱里跑：nx-nx js sandbox ${raw}（无 fs / 无网络）`);
    }
    if (existsSync(join(scriptsDir(), raw + '.shared.mjs'))) {
      throw conflict(`「${raw}」是共享函数面板，不能作为入口直接执行（去掉 .shared 后缀的脚本才是入口）`);
    }
    const available = listScripts()
      .map((s) => s.name)
      .join(', ');
    throw notFound(`未找到内置脚本: ${raw}（可用: ${available || '(无)'}）`);
  }
  return { name: raw, path: p };
}
