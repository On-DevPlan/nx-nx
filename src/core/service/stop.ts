// 关闭服务组：「关闭」这一个动作的四种走法（stopMode）+ 三重兜底。
//
// 为什么单独成文件，而不是留在 runtime.ts：
//   1. runtime.ts 已经贴着单文件行数上限；
//   2. 「怎么停」是一组与进程模型无关的策略选择（script / port / pid / auto），
//      值得作为独立契约单独钉住——它也正好是用户要求「stop 提供默认选项」的落点。
//
// 为什么全异步：
//   自愈跑在 serve 进程里，原先 stop 用 spawnSync（关停脚本最长 15s + taskkill/netstat），
//   期间整个 serve（含 Web 面板所有 API）冻结。换成 execFile + Promise 让出事件循环，
//   自愈时面板照样能响应。
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { probePort } from './check.js';
import { appendEvent } from './logs.js';
import { effectiveHealth, launchPort, type LaunchValues } from './launch.js';
import {
  getGroup,
  loadRuntime,
  patchRuntime,
  STOP_MODES,
  type ServiceGroupConfig,
  type StopMode,
} from './store.js';
import { runnerPath } from '../script/paths.js';
import { resolveServiceScript } from './scripts.js';

export interface StopResult {
  stopped: boolean;
  mode: StopMode;
  detail: string;
}

const IS_WIN = process.platform === 'win32';

/** Windows 系统命令的绝对路径：进程 PATH 里不一定有 System32（例如精简 shell）。 */
function winSystemTool(name: string): string {
  const root = process.env['SystemRoot'] || process.env['windir'] || 'C:\\Windows';
  const p = join(root, 'System32', name.endsWith('.exe') ? name : `${name}.exe`);
  return existsSync(p) ? p : name;
}
const SCRIPT_TIMEOUT_MS = 15000;
const KILL_TIMEOUT_MS = 10000;

// ---- 小工具 ----

interface CmdResult {
  code: number;
  stdout: string;
  stderr: string;
}

function run(cmd: string, args: string[], timeoutMs: number): Promise<CmdResult> {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout: timeoutMs, encoding: 'utf8', windowsHide: true }, (err, stdout, stderr) => {
      const code = err ? (typeof (err as { code?: unknown }).code === 'number' ? (err as { code: number }).code : 1) : 0;
      resolve({ code, stdout: String(stdout ?? ''), stderr: String(stderr ?? '') });
    });
  });
}

/** pid 是否还活着。检测失败视为存活——宁可多杀一次，也别把活着的服务当死的重启。 */
export async function pidAlive(pid: number): Promise<boolean> {
  if (!IS_WIN) {
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  }
  const r = await run('tasklist', ['/FI', `PID eq ${pid}`, '/NH'], 5000);
  if (r.code !== 0) return true;
  return r.stdout.includes(String(pid));
}

async function killPid(pid: number): Promise<boolean> {
  if (!IS_WIN) {
    try {
      process.kill(pid, 'SIGKILL');
      return true;
    } catch {
      return false;
    }
  }
  const r = await run(winSystemTool('taskkill'), ['/F', '/T', '/PID', String(pid)], KILL_TIMEOUT_MS);
  return r.code === 0;
}

/** 找出占用 TCP 端口的 pid（Windows: netstat；其他平台: lsof）。找不到返回 null。 */
export async function pidOfPort(port: number): Promise<number | null> {
  if (!IS_WIN) {
    const r = await run('lsof', ['-ti', `tcp:${port}`, '-sTCP:LISTEN'], 5000);
    const pid = Number(String(r.stdout).trim().split(/\s+/)[0]);
    return Number.isInteger(pid) && pid > 0 ? pid : null;
  }
  const r = await run(winSystemTool('netstat'), ['-ano', '-p', 'tcp'], 5000);
  if (r.code !== 0) return null;
  for (const line of r.stdout.split('\n')) {
    if (!line.includes(`:${port} `)) continue;
    if (!/LISTENING/i.test(line)) continue;
    const parts = line.trim().split(/\s+/);
    const pid = Number(parts[parts.length - 1]);
    if (Number.isInteger(pid) && pid > 0) return pid;
  }
  return null;
}

// ---- 策略 ----

/**
 * 决定这次关闭走哪条路：调用方显式指定优先（临时覆盖），否则用组配置，缺省 auto。
 * 非法值直接报错——静默降级成 auto 会让「我以为只杀了 pid」变成误杀。
 */
export function resolveStopMode(g: ServiceGroupConfig, override?: string): StopMode {
  const want = (override ?? '').trim();
  if (!want) return g.stopMode ?? 'auto';
  if (!STOP_MODES.includes(want as StopMode)) {
    throw new Error(`--mode 非法: ${want}（可选 ${STOP_MODES.join(' / ')}）`);
  }
  return want as StopMode;
}

/** 这个组「关闭端口」指的是哪个端口：本次启动的 port 参数 → 显式 killPort → 探活端口。 */
export function stopPortOf(g: ServiceGroupConfig, values?: LaunchValues): number | undefined {
  return launchPort(g, values) ?? g.killPort ?? effectiveHealth(g, values)?.port;
}

/** 关停脚本的绝对路径（组命名空间定位，与 cwd 无关） */
function resolveScript(groupId: string, name: string): string {
  return resolveServiceScript(groupId, name).path;
}

async function runStopScript(g: ServiceGroupConfig): Promise<string> {
  if (!g.stop) return '未配置关停脚本';
  try {
    const r = await run(
      process.execPath,
      [runnerPath(), resolveScript(g.id, g.stop.script), ...g.stop.args],
      SCRIPT_TIMEOUT_MS,
    );
    return `关停脚本 ${g.stop.script} 退出码 ${r.code}`;
  } catch (err) {
    return `关停脚本执行失败: ${err instanceof Error ? err.message : String(err)}`;
  }
}

async function killPortOccupant(port?: number): Promise<string> {
  if (!port) return '未配置端口（killPort / health.port 都空）';
  const pid = await pidOfPort(port);
  if (!pid) return `端口 ${port} 无占用进程`;
  const ok = await killPid(pid);
  return ok ? `已杀端口 ${port} 占用进程 (pid ${pid})` : `杀端口 ${port} 的进程 ${pid} 失败（权限？）`;
}

async function killRecordedPid(pid?: number): Promise<string> {
  if (!pid) return '运行态没有记录 pid';
  if (!(await pidAlive(pid))) return `记录的 pid ${pid} 已不在`;
  const ok = await killPid(pid);
  return ok ? `已杀主进程 (pid ${pid})` : `杀主进程 ${pid} 失败（权限？）`;
}

// ---- 主流程 ----

/**
 * 关闭服务组。
 *
 * auto 的「兜底」是真兜底：每走完一步就复核一次（pid 死了、端口空了），
 * 清干净就收工——不再无脑把三步全跑一遍（那会在服务已经优雅退出后
 * 继续 taskkill，日志里全是噪音，也容易误杀刚被系统重用的 pid）。
 */
export async function stopGroup(
  id: string,
  opts: { mode?: string; silent?: boolean } = {},
): Promise<StopResult> {
  const g = getGroup(id);
  const rt = loadRuntime(id);
  const mode = resolveStopMode(g, opts.mode);
  const health = effectiveHealth(g, rt.launch);
  const port = stopPortOf(g, rt.launch);
  const notes: string[] = [];

  const clear = async (): Promise<boolean> => {
    if (rt.pid && (await pidAlive(rt.pid))) return false;
    if (port && (await probePort(port, health?.host ?? '127.0.0.1', 800)).open) return false;
    return true;
  };

  if (mode === 'script' || mode === 'auto') {
    notes.push(await runStopScript(g));
  }
  // 走完脚本先复核：清干净了就别再动端口/进程（避免误杀被系统重用的 pid）
  if (mode === 'port' || (mode === 'auto' && !(await clear()))) {
    notes.push(await killPortOccupant(port));
  }
  if (mode === 'pid' || (mode === 'auto' && !(await clear()))) {
    notes.push(await killRecordedPid(rt.pid));
  }

  patchRuntime(id, { status: 'stopped', pid: undefined, failStreak: 0, alive: false });
  const detail = notes.join('；') || '无动作';
  if (!opts.silent) appendEvent(id, `关闭（mode=${mode}）：${detail}`);
  return { stopped: true, mode, detail };
}

// 只在测试与诊断里用到：端口是否还被占着
export function portBusy(port: number, host = '127.0.0.1'): Promise<boolean> {
  return probePort(port, host, 800).then((p) => p.open);
}
