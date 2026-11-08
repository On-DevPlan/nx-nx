// 管理空间（namespace）的 core 侧：索引 + 调用 + 快照。
//
// 「空间」是什么：共享面板（<group>.shared.mjs）被装载后形成的一个可管理实体——
// 有名字、有状态（堆）、有方法（可列举 / 可调用）、有调用栈。
// 一个服务组的启动按钮对应一个空间；执行 server 之前先向空间问一句「活没活」。
//
// 为什么 core 侧要用子进程：
//   空间住在用户脚本里（可能有副作用、可能常驻），core 不能把它 import 进来。
//   于是 core 只做「索引 + 派发」：真正的装载与调用发生在 _runner.mjs 子进程里，
//   结果通过 stdout 的 NX_NS_RESULT 标记行回传。core 永远不执行用户代码。
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { runnerPath, scriptsDir } from '../script/paths.js';
import { serviceSpacesPath } from './paths.js';
import { readJsonFile, writeJsonAtomic } from './store-json.js';

// ---- 空间索引（落盘） ----

export interface SpaceMethodInfo {
  name: string;
  arity: number;
  async: boolean;
}

export interface SpaceIndexEntry {
  id: string;
  name: string;
  panel: string;
  groupId?: string;
  methods: SpaceMethodInfo[];
  stateKeys: string[];
  updatedAt: number;
}

export interface SpaceIndex {
  spaces: SpaceIndexEntry[];
}

export function loadSpaceIndex(): SpaceIndex {
  const raw = readJsonFile<SpaceIndex>(serviceSpacesPath());
  return { spaces: Array.isArray(raw?.spaces) ? raw.spaces : [] };
}

export function saveSpaceIndex(idx: SpaceIndex): void {
  writeJsonAtomic(serviceSpacesPath(), idx);
}

export function upsertSpace(entry: SpaceIndexEntry): void {
  const idx = loadSpaceIndex();
  const at = idx.spaces.findIndex((s) => s.id === entry.id);
  if (at >= 0) idx.spaces[at] = entry;
  else idx.spaces.push(entry);
  saveSpaceIndex(idx);
}

/**
 * 装载空间并把它的方法清单写进索引。
 * 索引是「本机有哪些空间、各自能干什么」的落盘视图——
 * 有了它，`sg space-list` 不用每次都起子进程装载面板。
 */
export async function refreshSpaceIndex(
  id: string,
  panelPath: string,
  groupId?: string,
): Promise<SpaceIndexEntry> {
  const r = await introspectSpace(panelPath);
  const report = (r.space ?? {}) as { name?: string; methods?: SpaceMethodInfo[] };
  const entry: SpaceIndexEntry = {
    id,
    name: report.name ?? id,
    panel: panelPath,
    groupId,
    methods: report.methods ?? [],
    stateKeys: ((r.heap ?? []) as { key: string }[]).map((h) => h.key),
    updatedAt: Date.now(),
  };
  upsertSpace(entry);
  return entry;
}

// ---- 面板定位 ----

/**
 * 面板脚本名 → 绝对路径。
 * 面板可以放在包内 assets/scripts/ 下（推荐），也可以是绝对路径（包外自管）。
 */
export function resolvePanelPath(panel: string): string {
  const name = String(panel ?? '').trim();
  if (!name) throw new Error('缺少空间面板名');
  if (name.endsWith('.shared')) {
    const p = join(scriptsDir(), name + '.mjs');
    if (existsSync(p)) return p;
  }
  const p = join(scriptsDir(), name.endsWith('.mjs') ? name : name + '.mjs');
  if (existsSync(p)) return p;
  if (existsSync(name)) return name; // 绝对路径
  throw new Error(`空间面板不存在: ${name}（找过 ${p} 与 ${name}）`);
}

// ---- 派发到子进程 ----

export interface SpaceActionResult {
  ok: boolean;
  action: string;
  method?: string;
  value?: unknown;
  alive?: boolean;
  detail?: string;
  error?: string;
  /** 空间方法抛错时的调用栈（排错用） */
  stack?: string[];
  space?: unknown;
  methods?: SpaceMethodInfo[];
  heap?: { key: string; describe: string; type: string }[];
}

const RESULT_MARK = 'NX_NS_RESULT ';

/**
 * 在子进程里装载空间并执行一个动作。
 * @param action introspect | call | check
 */
export function runSpaceAction(
  panelPath: string,
  action: 'introspect' | 'call' | 'check',
  opts: { method?: string; args?: unknown[]; timeoutMs?: number } = {},
): Promise<SpaceActionResult> {
  const argv = [runnerPath()];
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    NX_SHARED_PANEL: panelPath,
    NX_NS_ACTION: action,
  };
  // serve 端口：面板里的 serviceCheck / serviceAlive 要靠它回连本机 API。
  // 少了这一行，面板打的是默认端口 7880，check 就会「莫名其妙地不通过」。
  if (process.env.NX_NX_SERVE_PORT) env['NX_NX_SERVE_PORT'] = process.env.NX_NX_SERVE_PORT;
  if (opts.method) env['NX_NS_METHOD'] = opts.method;
  if (opts.args) env['NX_NS_ARGS_JSON'] = JSON.stringify(opts.args);

  return new Promise((resolvePromise) => {
    const child = spawn(process.execPath, argv, { env });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill();
    }, opts.timeoutMs ?? 15000);
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (d: string) => {
      stdout += d;
    });
    child.stderr.on('data', (d: string) => {
      stderr += d;
    });
    child.on('error', (err) => {
      clearTimeout(timer);
      resolvePromise({ ok: false, action, error: err.message });
    });
    child.on('close', () => {
      clearTimeout(timer);
      const line = stdout.split('\n').find((l) => l.startsWith(RESULT_MARK));
      if (!line) {
        resolvePromise({
          ok: false,
          action,
          error: `空间没有回报结果${stderr ? `：${stderr.trim().slice(0, 300)}` : ''}`,
        });
        return;
      }
      try {
        resolvePromise(JSON.parse(line.slice(RESULT_MARK.length)) as SpaceActionResult);
      } catch (err) {
        resolvePromise({
          ok: false,
          action,
          error: `空间结果不是合法 JSON: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    });
  });
}

// ---- 面向业务的三个入口 ----

/** 空间清单：有哪些空间、每个空间有哪些方法 */
export async function introspectSpace(panelPath: string): Promise<SpaceActionResult> {
  return runSpaceAction(panelPath, 'introspect');
}

/** 调用空间的一个方法 */
export async function callSpaceMethod(
  panelPath: string,
  method: string,
  args: unknown[] = [],
): Promise<SpaceActionResult> {
  return runSpaceAction(panelPath, 'call', { method, args });
}

/**
 * 活性 check：问空间一个返回 bool 的方法。
 * 契约与方法实现解耦——空间里放什么名字都行，由配置指定。
 */
export async function checkSpace(
  panelPath: string,
  method: string,
): Promise<{ alive: boolean; detail: string }> {
  const r = await runSpaceAction(panelPath, 'check', { method });
  if (!r.ok) return { alive: false, detail: r.error ?? '空间 check 失败' };
  return { alive: r.alive === true, detail: r.detail ?? '' };
}

/**
 * 空间方法的执行环境说明：面板里的 serviceCheck / serviceAlive 要靠
 * NX_NX_SERVE_PORT 回连本机 API。CLI 直跑（不经 serve）时这个变量不存在，
 * 面板里凡是走 serve API 的判断都会失败——这是环境事实，不是 bug。
 * 把它显式告诉调用方，好过让人对着「莫名其妙不通过」猜。
 */
export function servePortAvailable(): boolean {
  return Boolean(process.env.NX_NX_SERVE_PORT);
}
