// 内置脚本的业务真相源：列出脚本、列出内置全局函数、跑脚本。
//
// 与「项目生成」「skill 安装」这些域一样，这里只做编排：
// 脚本本身住在 assets/scripts/（纯 .mjs，零构建），解释器（_runner.mjs）也是。
// Node 侧只负责把「哪个脚本 + 哪些参数」翻译成一次子进程调用。
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { delimiter, join, isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import { badInput, conflict, notFound } from '../errors/index.js';
import { parseParams, type ScriptParam } from './params.js';
import {
  aliasesPath,
  listScripts,
  resolveScript,
  runnerPath,
  scriptsDir,
  type ScriptInfo,
} from './paths.js';

export interface AliasInfo {
  name: string;
  group: string;
  desc: string;
}

export interface ScriptRunResult {
  script: string;
  path: string;
  code: number;
  stdout: string;
  stderr: string;
  /** 共享面板的变量堆（装载过面板时才有）：可 JSON 化的产出清单 */
  heap?: { key: string; type: string; describe: string }[];
}

export function scripts(): ScriptInfo[] {
  return listScripts();
}

// ---- 脚本源码编辑（Web 工作台 / CLI 共用） ----

export interface ScriptContent {
  name: string;
  path: string;
  content: string;
}

interface ManifestEntry {
  name: string;
  description?: string;
  usage?: string;
  notes?: string;
}

// 只允许编辑 assets/scripts/ 下的用户脚本：
// 拒绝路径分隔符、盘符、`..`、隐藏文件、清单、解释器与别名模块。
function editableScript(name: unknown): { name: string; path: string } {
  const n = String(name ?? '').trim().replace(/\.mjs$/i, '');
  if (!n) throw badInput('缺少脚本名');
  if (/[\\/:*?"<>|\x00-\x1f]/.test(n) || n === '.' || n === '..' || n.startsWith('_') || n.startsWith('.')) {
    throw badInput(`非法脚本名: ${n}`);
  }
  if (n.endsWith('.') || n.endsWith(' ')) throw badInput(`非法脚本名: ${n}`);
  if (n === 'aliases' || n === 'manifest') throw badInput(`不能编辑内置文件: ${n}`);
  return { name: n, path: join(scriptsDir(), n + '.mjs') };
}

// 先写临时文件再改名：保存过程中崩掉也不会留下半截脚本。
function atomicWrite(path: string, text: string): void {
  const tmp = `${path}.tmp-${process.pid}-${Date.now()}`;
  writeFileSync(tmp, text, 'utf8');
  renameSync(tmp, path);
}

// manifest 由路径模块读、由这里写；读写两边都容忍缺失/损坏的清单。
function updateManifest(mutate: (entries: ManifestEntry[]) => ManifestEntry[]): void {
  const p = join(scriptsDir(), 'manifest.json');
  let parsed: { scripts?: ManifestEntry[] } = { scripts: [] };
  if (existsSync(p)) {
    try {
      parsed = JSON.parse(readFileSync(p, 'utf8')) as { scripts?: ManifestEntry[] };
    } catch {
      parsed = { scripts: [] };
    }
  }
  const entries = Array.isArray(parsed.scripts) ? parsed.scripts : [];
  parsed.scripts = mutate([...entries]);
  atomicWrite(p, JSON.stringify(parsed, null, 2) + '\n');
}

function defaultScript(name: string): string {
  return [
    `// ${name} —— 随包脚本；内置全局函数可直接用，不需要 import。`,
    '// 可用函数清单: nx-nx script aliases',
    '',
    `log(${JSON.stringify(`hello from ${name}`)});`,
    '',
  ].join('\n');
}

export function readScript(name: unknown): ScriptContent {
  const target = editableScript(name);
  if (!existsSync(target.path)) throw notFound(`脚本不存在: ${target.name}`);
  return { ...target, content: readFileSync(target.path, 'utf8') };
}

export function saveScript(name: unknown, content: unknown): ScriptContent {
  const target = editableScript(name);
  if (!existsSync(target.path)) throw notFound(`脚本不存在: ${target.name}`);
  const text = String(content ?? '');
  atomicWrite(target.path, text);
  return { ...target, content: text };
}

// 脚本声明的参数表（`@param` 注释）——供面板渲染输入框、CLI 对照 flag 名
export function readParams(name: unknown): ScriptParam[] {
  const target = editableScript(name);
  if (!existsSync(target.path)) throw notFound(`脚本不存在: ${target.name}`);
  return parseParams(readFileSync(target.path, 'utf8'));
}

export interface CreateScriptInput {
  name: unknown;
  description?: unknown;
  usage?: unknown;
  content?: unknown;
}

export function createScript(input: CreateScriptInput): ScriptContent {
  const target = editableScript(input.name);
  if (existsSync(target.path)) throw conflict(`脚本已存在: ${target.name}`);
  const text = String(input.content ?? defaultScript(target.name));
  writeFileSync(target.path, text, 'utf8');
  updateManifest((entries) => {
    const next = entries.filter((e) => e.name !== target.name);
    next.push({
      name: target.name,
      description: String(input.description ?? ''),
      usage: String(input.usage ?? ''),
      notes: '',
    });
    return next;
  });
  return { ...target, content: text };
}

export function deleteScript(name: unknown): { name: string; path: string } {
  const target = editableScript(name);
  if (!existsSync(target.path)) throw notFound(`脚本不存在: ${target.name}`);
  unlinkSync(target.path);
  updateManifest((entries) => entries.filter((e) => e.name !== target.name));
  return target;
}

// 内置全局函数（别名模块）的清单——直接从 aliases.mjs 读，文档与实现同源。
export async function aliases(): Promise<AliasInfo[]> {
  const mod = (await import(pathToFileURL(aliasesPath()).href)) as { ALIASES?: AliasInfo[] };
  return Array.isArray(mod.ALIASES) ? mod.ALIASES : [];
}

// CLI/HTTP 的 flag 形态 → 子进程 argv 形态。
//   --force            → '--force'
//   --root D:\a\b      → '--root=D:\a\b'（等号连写，值里的空格不会散成两个 token）
export function flagTokens(flags: Record<string, unknown>): string[] {
  const out: string[] = [];
  for (const [k, v] of Object.entries(flags)) {
    if (v === true) out.push(`--${k}`);
    else if (v === false || v === undefined || v === null) continue;
    else out.push(`--${k}=${String(v)}`);
  }
  return out;
}

interface ExecResult {
  code: number;
  stdout: string;
  stderr: string;
}

function execNode(argv: string[], cwd?: string, extraEnv?: NodeJS.ProcessEnv): Promise<ExecResult> {
  return new Promise((resolvePromise) => {
    const child = spawn(process.execPath, argv, {
      cwd: cwd || process.cwd(),
      env: extraEnv ? { ...process.env, ...extraEnv } : process.env,
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (d: string) => {
      stdout += d;
    });
    child.stderr.on('data', (d: string) => {
      stderr += d;
    });
    child.on('error', (err) => {
      stderr += String(err.message || err);
      resolvePromise({ code: 1, stdout, stderr });
    });
    child.on('close', (code) => {
      resolvePromise({ code: typeof code === 'number' ? code : 1, stdout, stderr });
    });
  });
}

// 跑一个脚本：内置脚本名，或任意 .mjs 路径。
// 脚本在自己的子进程里跑：全局副作用与崩溃都被关在那个进程里。
// opts.shared：共享函数面板名（如 demo.shared）——runner 会先装载它，再执行目标脚本。
// opts.sharedImports：面板之间互相依赖时，先装载这些面板（它们的空间即可被 useSpace 取到）。
// opts.env：附加环境变量（如 NX_HTTP_LOG_DIR / NX_NX_SERVE_PORT）。
export async function runScript(
  name: string,
  opts: { args?: string[]; cwd?: string; shared?: string; sharedImports?: string[]; env?: NodeJS.ProcessEnv } = {},
): Promise<ScriptRunResult> {
  const target = resolveScript(name);
  const runner = runnerPath();
  const argv = [runner, target.path, ...(opts.args ?? [])];
  const extraEnv: NodeJS.ProcessEnv = {};
  if (opts.shared) {
    extraEnv['NX_SHARED_PANEL'] = resolveSharedPanel(opts.shared);
    if (opts.sharedImports?.length) {
      extraEnv['NX_NS_IMPORTS'] = opts.sharedImports.map((p) => resolveSharedPanel(p)).join(delimiter);
    }
  }
  Object.assign(extraEnv, opts.env ?? {});
  const r = await execNode(argv, opts.cwd, extraEnv);
  const heap = parseHeap(r.stdout);
  return {
    script: target.name,
    path: target.path,
    code: r.code,
    // 机器可读的标记行不给人看：解析完就从 stdout 里摘掉，
    // 否则 CLI 里会出现一长串 JSON，把脚本真正的输出挤没了。
    stdout: stripMarker(r.stdout),
    stderr: r.stderr,
    heap,
  };
}

const HEAP_MARK = 'NX_HEAP_RESULT ';

function stripMarker(stdout: string): string {
  if (!stdout.includes(HEAP_MARK)) return stdout;
  return stdout
    .split('\n')
    .filter((l) => !l.startsWith(HEAP_MARK))
    .join('\n');
}

// 解释器把面板的变量堆以 `NX_HEAP_RESULT <json>` 打一行出来：
// 拿到就是结构化产出，拿不到（没装面板 / 老解释器）就当没有。
function parseHeap(stdout: string): ScriptRunResult['heap'] {
  const line = stdout
    .split('\n')
    .reverse()
    .find((l) => l.startsWith('NX_HEAP_RESULT '));
  if (!line) return undefined;
  try {
    const rows = JSON.parse(line.slice('NX_HEAP_RESULT '.length)) as unknown;
    return Array.isArray(rows) ? (rows as { key: string; type: string; describe: string }[]) : undefined;
  } catch {
    return undefined;
  }
}

// 共享面板定位：组内引用写的是脚本名（如 demo.shared）→ 落在 scriptsDir 下；
// 也接受绝对路径（面板放在包外时用；测试也走这条路径）。
function resolveSharedPanel(name: string): string {
  if (isAbsolute(name) && existsSync(name)) return name;
  const p = join(scriptsDir(), name.endsWith('.mjs') ? name : name + '.mjs');
  if (!existsSync(p)) throw notFound(`共享面板不存在: ${name}`);
  return p;
}
