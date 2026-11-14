// 短脚本沙箱的 Node 侧：把「一段代码 + 哪些面板 + 什么参数」翻译成一次 QuickJS 子进程调用，
// 并把每次运行记进台账。
//
// 为什么沙箱也要子进程：
//   wasm 虚拟机本身能限内存、限时限，但装载共享面板（用户代码）发生在 Node 里——
//   面板抛错或卡死不能带走 serve。多一层进程是便宜保险。
//
// 与 script/service.ts 的 runScript 是**两条并列的路**，不是替代关系：
//   runScript  真 Node（fs / 网络 / async 面板函数）——写业务脚本用
//   runSandbox 虚拟机（无 fs / 无网络 / 只有显式桥）——跑片段、跑不可信逻辑、求值验算
import { spawn } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { delimiter, dirname, isAbsolute, join, resolve } from 'node:path';
import { badInput, notFound } from '../errors/index.js';
import { resolveScript, sandboxPath, scriptRunsLogPath, scriptsDir } from './paths.js';

export interface SandboxHeapRow {
  key: string;
  type: string;
  describe: string;
  /** 可安全传输的值（JSON 可表示时才有；Map / 函数 / 循环引用为 null） */
  json: unknown;
}

export interface SandboxResult {
  ok: boolean;
  error: string | null;
  /** 沙箱里 log() 的输出（与结果分开：日志不该混进数据） */
  logs: string[];
  /** 变量堆：这次执行的产出 */
  heap: SandboxHeapRow[];
  /** 装载了哪些面板（数据快照进沙箱，函数走 call() 桥） */
  panels: string[];
  durationMs: number;
  timeoutMs: number;
  memoryMb: number;
  /** 片段来源：内联代码为空串，文件为绝对路径 */
  file: string;
  /** 台账里的标识（脚本名或 inline） */
  source: string;
  ranAt: string;
}

export interface SandboxInput {
  /** 脚本名（assets/scripts 下，可含 .shared）——与 code 二选一，code 优先 */
  name?: unknown;
  /** 内联代码片段 */
  code?: unknown;
  /** 共享面板：名字或路径；多个用逗号/分号分隔 */
  panel?: unknown;
  /** 参数，注入为沙箱里的 args */
  args?: unknown;
  timeoutMs?: unknown;
  memoryMb?: unknown;
}

const MARK = 'NX_SANDBOX_RESULT ';
const DEFAULT_TIMEOUT = 5000;
const DEFAULT_MEMORY = 64;

function clampNumber(v: unknown, def: number, min: number, max: number): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return def;
  return Math.min(max, Math.max(min, Math.round(n)));
}

// 面板名 → 绝对路径。接受三种写法：
//   demo.shared        → assets/scripts/demo.shared.mjs
//   demo.shared.mjs    → 同上
//   D:\x\demo.shared.mjs → 原样（包外自管的面板）
function resolvePanelPath(raw: string): string {
  const name = raw.trim();
  if (!name) throw badInput('面板名为空');
  if (isAbsolute(name) || name.includes('/') || name.includes('\\')) {
    const abs = isAbsolute(name) ? name : resolve(process.cwd(), name);
    if (!existsSync(abs)) throw notFound(`共享面板不存在: ${abs}`);
    return abs;
  }
  const candidates = [name.endsWith('.mjs') ? name : `${name}.mjs`, name.endsWith('.shared') ? `${name}.mjs` : ''];
  for (const c of candidates) {
    if (!c) continue;
    const p = join(scriptsDir(), c);
    if (existsSync(p)) return p;
  }
  throw notFound(`共享面板不存在: ${name}（找过 ${join(scriptsDir(), name + '.mjs')}）`);
}

// 脚本名 → 片段文件。沙箱允许读共享面板本身（它也是「一段代码」），
// 只是不能把它当服务入口——那条限制在 resolveScript 里，这里刻意绕开。
function resolveCodeFile(name: string): string {
  const raw = name.trim().replace(/\.mjs$/i, '');
  if (!raw) throw badInput('缺少脚本名');
  if (isAbsolute(raw)) {
    if (!existsSync(raw)) throw notFound(`脚本不存在: ${raw}`);
    return raw;
  }
  const p = join(scriptsDir(), raw + '.mjs');
  if (existsSync(p)) return p;
  // 名字没带 .short 也认：先按原名找，再补 .short 后缀找一次
  const short = join(scriptsDir(), raw + '.short.mjs');
  if (existsSync(short)) return short;
  // 兜底：当作普通脚本名走一次标准解析（拿到更友好的错误信息）
  return resolveScript(raw).path;
}

function splitPanels(panel: unknown): string[] {
  if (panel === undefined || panel === null || panel === '') return [];
  const list = Array.isArray(panel) ? panel.map(String) : String(panel).split(/[,;]/);
  return [...new Set(list.map((s) => s.trim()).filter(Boolean))];
}

// 参数既可能来自 HTTP 的数组，也可能来自 CLI 的 `--args '["a","b"]'` 或 `--args a,b`。
// 三种写法都收：前者原样，后两者先试 JSON、不是 JSON 就按逗号切。
function normalizeArgs(v: unknown): unknown[] {
  if (v === undefined || v === null || v === '') return [];
  if (Array.isArray(v)) {
    // CLI 的 array flag 会按逗号切；`--args '["a","b"]'` 这种 JSON 写法要还原回来，
    // 否则用户拿到的参数会变成 ['["a"', '"b"]'] 这类碎片。
    if (v.length === 1 && typeof v[0] === 'string' && v[0].trim().startsWith('[')) {
      try {
        const parsed = JSON.parse(v[0]) as unknown;
        if (Array.isArray(parsed)) return parsed;
      } catch {
        // 不是 JSON → 原样返回
      }
    }
    return v;
  }
  if (typeof v === 'string') {
    const s = v.trim();
    if (!s) return [];
    if (s.startsWith('[')) {
      try {
        const parsed = JSON.parse(s) as unknown;
        return Array.isArray(parsed) ? parsed : [parsed];
      } catch {
        // 不是合法 JSON → 落到逗号切分
      }
    }
    return s
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean);
  }
  return [v];
}

/** 把一次运行追加到台账（JSONL，一行一条） */
function recordRun(result: SandboxResult): void {
  try {
    const p = scriptRunsLogPath();
    mkdirSync(dirname(p), { recursive: true });
    const record = {
      at: result.ranAt,
      source: result.source,
      file: result.file,
      panels: result.panels,
      ok: result.ok,
      durationMs: result.durationMs,
      heapKeys: result.heap.map((h) => h.key),
      logCount: result.logs.length,
      error: result.error,
      timeoutMs: result.timeoutMs,
      memoryMb: result.memoryMb,
    };
    appendFileSync(p, JSON.stringify(record) + '\n', 'utf8');
  } catch {
    // 台账写不进去不该让运行失败——运行结果才是主线
  }
}

/**
 * 在沙箱里跑一段代码。
 * 失败分两级：沙箱基础设施坏了 → throw；代码自己抛错/超时 → ok:false（那是结果，不是错误）。
 */
export function runSandbox(input: SandboxInput): Promise<SandboxResult> {
  const code = String(input.code ?? '');
  const name = String(input.name ?? '').trim();
  if (!code.trim() && !name) throw badInput('要跑什么？给 code（片段）或 name（脚本名）');

  const file = code.trim() ? '' : resolveCodeFile(name);
  const panels = splitPanels(input.panel).map(resolvePanelPath);
  const args = normalizeArgs(input.args);
  const timeoutMs = clampNumber(input.timeoutMs, DEFAULT_TIMEOUT, 200, 60000);
  const memoryMb = clampNumber(input.memoryMb, DEFAULT_MEMORY, 8, 512);
  const ranAt = new Date().toISOString();
  const source = code.trim() ? 'inline' : name;

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    NX_SANDBOX_ARGS: JSON.stringify(args),
    NX_SANDBOX_TIMEOUT_MS: String(timeoutMs),
    NX_SANDBOX_MEMORY_MB: String(memoryMb),
  };
  delete env['NX_SANDBOX_CODE'];
  delete env['NX_SANDBOX_FILE'];
  delete env['NX_SANDBOX_PANELS'];
  if (code.trim()) env['NX_SANDBOX_CODE'] = code;
  else env['NX_SANDBOX_FILE'] = file;
  if (panels.length) env['NX_SANDBOX_PANELS'] = panels.join(delimiter);

  const runner = sandboxPath();
  return new Promise<SandboxResult>((resolvePromise, reject) => {
    const child = spawn(process.execPath, [runner], { env, cwd: process.cwd() });
    let stdout = '';
    let stderr = '';
    // 进程级的兜底超时：沙箱自己会中断，但解释器初始化卡住时得由外面收尸
    const killer = setTimeout(() => child.kill(), timeoutMs + 15000);
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (d: string) => {
      stdout += d;
    });
    child.stderr.on('data', (d: string) => {
      stderr += d;
    });
    child.on('error', (err) => {
      clearTimeout(killer);
      reject(badInput(`沙箱进程起不来: ${err.message}（quickjs-emscripten 是否已安装？）`));
    });
    child.on('close', () => {
      clearTimeout(killer);
      const line = stdout.split('\n').find((l) => l.startsWith(MARK));
      if (!line) {
        const detail = stderr.trim() || stdout.trim() || '（无输出）';
        const result: SandboxResult = {
          ok: false,
          error: `沙箱没有回报结果：${detail.slice(0, 400)}`,
          logs: [],
          heap: [],
          panels: [],
          durationMs: 0,
          timeoutMs,
          memoryMb,
          file,
          source,
          ranAt,
        };
        recordRun(result);
        resolvePromise(result);
        return;
      }
      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(line.slice(MARK.length)) as Record<string, unknown>;
      } catch {
        reject(badInput('沙箱结果不是合法 JSON'));
        return;
      }
      const result: SandboxResult = {
        ok: parsed['ok'] === true,
        error: typeof parsed['error'] === 'string' ? parsed['error'] : null,
        logs: Array.isArray(parsed['logs']) ? (parsed['logs'] as string[]) : [],
        heap: Array.isArray(parsed['heap']) ? (parsed['heap'] as SandboxHeapRow[]) : [],
        panels: Array.isArray(parsed['panels']) ? (parsed['panels'] as string[]) : [],
        durationMs: Number(parsed['durationMs']) || 0,
        timeoutMs,
        memoryMb,
        file,
        source,
        ranAt,
      };
      recordRun(result);
      resolvePromise(result);
    });
  });
}

export interface RunRecord {
  at: string;
  source: string;
  ok: boolean;
  durationMs: number;
  heapKeys: string[];
  error: string | null;
}

/** 最近的运行台账（新的在前）。台账是唯一「跑过什么」的事实源——UI 与 CLI 都读它。 */
export function recentRuns(limit = 20): RunRecord[] {
  const p = scriptRunsLogPath();
  if (!existsSync(p)) return [];
  const lines = readFileSync(p, 'utf8').split('\n').filter((l) => l.trim());
  const out: RunRecord[] = [];
  for (let i = lines.length - 1; i >= 0 && out.length < limit; i--) {
    try {
      const r = JSON.parse(lines[i] as string) as RunRecord;
      out.push(r);
    } catch {
      // 坏行跳过：台账是追加写的，历史里可能留有半截
    }
  }
  return out;
}
