// 服务组运行时：启动（detached spawn + 日志重定向）、停止（关停脚本 / 杀端口 / 杀 pid）、
// 活性 watcher（serve 进程内的定时检测 + 失活自愈）。
//
// 进程模型：
//   主脚本 = detached spawn，stdio 追加重定向到日志文件（IO 输出定向），
//   unref 后 serve 退出也不带走它；管理靠「pid 记录 + 端口/HTTP 活性轮询」。
// 自愈边界：
//   watcher 定时器活在 serve 进程里 —— `nx-nx serve` 不在跑时只做检测不自动重启
//   （CLI 的 sg start/stop 随时可手动用）。
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, appendFileSync, mkdirSync, openSync } from 'node:fs';
import { join } from 'node:path';
import {
  checkHealth,
  type CheckResult,
} from './check.js';
import {
  getGroup,
  loadGroups,
  loadRuntime,
  loadRuntimeAll,
  patchRuntime,
  type ServiceGroupConfig,
} from './store.js';
import { serviceLogsDir } from './paths.js';
import { runnerPath, scriptsDir } from '../script/paths.js';

// 每组一个定时器（serve 进程内）
const watchers = new Map<string, ReturnType<typeof setInterval>>();

// ---- 日志 ----

function appendEvent(id: string, event: string): void {
  const dir = serviceLogsDir();
  mkdirSync(dir, { recursive: true });
  const line = `[${new Date().toISOString()}] ${event}\n`;
  appendFileSync(join(dir, `events-${id}.log`), line, 'utf8');
  patchRuntime(id, { lastEvent: event });
}

function appendMainLog(logFile: string, line: string): void {
  try {
    appendFileSync(logFile, `\n[${new Date().toISOString()}] [nx-nx] ${line}\n`, 'utf8');
  } catch {
    // 日志文件被外部删掉等情形：忽略，不影响服务管理本身
  }
}

function newLogFile(id: string): string {
  const dir = serviceLogsDir();
  mkdirSync(dir, { recursive: true });
  return join(dir, `${id}-${new Date().toISOString().replace(/[:.]/g, '-')}.log`);
}

// ---- 状态 ----

export function runtimeSnapshot(id?: string) {
  const all = loadRuntimeAll();
  if (id) return { [id]: all[id] ?? { status: 'stopped' } };
  return all;
}

// pid 是否真的还活着（Windows 上 tasklist 过滤；检测失败视为存活，避免误重启）
function pidAlive(pid: number): boolean {
  const r = spawnSync('tasklist', ['/FI', `PID eq ${pid}`, '/NH'], { encoding: 'utf8' });
  if (r.status !== 0) return true;
  return String(r.stdout || '').includes(String(pid));
}

// ---- 启动 ----

export function startGroup(id: string): { started: boolean; pid?: number; logFile: string; detail: string } {
  const g = getGroup(id);
  if (!g.main) throw new Error(`服务组 ${id} 未配置主脚本（main）`);
  const rt = loadRuntime(id);
  if (rt.status === 'running' && rt.pid && pidAlive(rt.pid)) {
    return { started: false, pid: rt.pid, logFile: rt.logFile ?? '', detail: '已在运行' };
  }

  const logFile = newLogFile(id);
  const fd = openSync(logFile, 'a');
  appendFileSync(fd, `\n===== 启动 ${new Date().toISOString()} · 组 ${id} · 脚本 ${g.main.script} =====\n`, 'utf8');

  const target = resolveMainScript(g.main.script);
  const child = spawn(
    process.execPath,
    [runnerPath(), target, ...g.main.args],
    {
      detached: true,
      stdio: ['ignore', fd, fd],
      env: sharedEnv(g),
    },
  );
  child.unref();

  patchRuntime(id, {
    status: 'running',
    pid: child.pid,
    startedAt: Date.now(),
    logFile,
    failStreak: 0,
  });
  startWatcher(g.id);
  appendEvent(id, `启动主脚本 ${g.main.script}（pid ${child.pid}）→ 日志 ${logFile}`);
  return { started: true, pid: child.pid, logFile, detail: '已启动（日志见 ' + logFile + '）' };
}

// 主脚本名 → 绝对路径。用 scriptsDir()（包内 assets 定位，与 cwd 无关——
// serve 进程的 cwd 可能是任何目录）。
function resolveMainScript(name: string): string {
  const base = scriptsDir();
  const p = join(base, name.replace(/\.mjs$/, '') + '.mjs');
  if (existsSync(p)) return p;
  const alt = join(process.cwd(), name);
  if (existsSync(alt)) return alt;
  throw new Error(`主脚本不存在: ${name}（找过 ${p} 与 ${alt}）`);
}

// 组内脚本执行时的环境：共享面板路径 + serve 端口（check 函数要用）
function sharedEnv(g: ServiceGroupConfig): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };
  if (g.shared) {
    const p = join(scriptsDir(), g.shared.endsWith('.mjs') ? g.shared : g.shared + '.mjs');
    if (existsSync(p)) env['NX_SHARED_PANEL'] = p;
  }
  if (process.env.NX_NX_SERVE_PORT) env['NX_NX_SERVE_PORT'] = process.env.NX_NX_SERVE_PORT;
  return env;
}

// ---- 停止 ----

export function stopGroup(id: string, { silent = false }: { silent?: boolean } = {}): { stopped: boolean; detail: string } {
  const g = getGroup(id);
  const rt = loadRuntime(id);
  stopWatcher(id);
  const notes: string[] = [];

  // 1) 优雅关停脚本
  if (g.stop) {
    const r = spawnSync(process.execPath, [runnerPath(), resolveMainScript(g.stop.script), ...g.stop.args], {
      encoding: 'utf8',
      timeout: 15000,
    });
    notes.push(`关停脚本退出码 ${r.status}`);
  }

  // 2) 杀端口占用进程
  if (g.killPort) {
    const pid = pidOfPort(g.killPort);
    if (pid) {
      spawnSync('taskkill', ['/F', '/T', '/PID', String(pid)], { encoding: 'utf8' });
      notes.push(`已杀端口 ${g.killPort} 占用进程 (pid ${pid})`);
    } else {
      notes.push(`端口 ${g.killPort} 无占用进程`);
    }
  }

  // 3) 兜底：直接杀记录的 pid
  if (rt.pid && pidAlive(rt.pid)) {
    spawnSync('taskkill', ['/F', '/T', '/PID', String(rt.pid)], { encoding: 'utf8' });
    notes.push(`已杀主进程 (pid ${rt.pid})`);
  }

  patchRuntime(id, { status: 'stopped', pid: undefined, failStreak: 0 });
  if (!silent) appendEvent(id, `停止：${notes.join('；') || '无动作'}`);
  return { stopped: true, detail: notes.join('；') || '已停止' };
}

// netstat 找出占用 TCP 端口的 PID（Windows）
function pidOfPort(port: number): number | null {
  const r = spawnSync('netstat', ['-ano', '-p', 'tcp'], { encoding: 'utf8' });
  if (r.status !== 0) return null;
  for (const line of String(r.stdout || '').split('\n')) {
    if (!line.includes(`:${port} `)) continue;
    if (!/LISTENING/i.test(line)) continue;
    const parts = line.trim().split(/\s+/);
    const pid = Number(parts[parts.length - 1]);
    if (Number.isInteger(pid) && pid > 0) return pid;
  }
  return null;
}

// ---- 活性 watcher（serve 进程内） ----

export function startWatcher(id: string): void {
  const g = getGroup(id);
  if (!g.health) return; // 没配检测就没有 watcher
  stopWatcher(id);
  const h = g.health;
  const timer = setInterval(() => {
    void tickWatch(g.id).catch(() => {
      // watcher 内部异常不外抛，tick 一次失败下轮再来
    });
  }, h.intervalMs);
  timer.unref(); // 不阻止 serve 退出
  watchers.set(id, timer);
  void tickWatch(g.id).catch(() => {});
}

export function stopWatcher(id: string): void {
  const t = watchers.get(id);
  if (t) {
    clearInterval(t);
    watchers.delete(id);
  }
}

// serve 重启后：把「运行中」的组重新挂上 watcher（配置仍在、状态文件仍在）
export function resumeWatchers(): void {
  for (const g of loadGroups()) {
    const rt = loadRuntime(g.id);
    if (rt.status === 'running' && g.health) startWatcher(g.id);
  }
}

async function tickWatch(id: string): Promise<void> {
  const g = getGroup(id);
  if (!g.health) return;
  const rt = loadRuntime(id);
  if (rt.status !== 'running') {
    stopWatcher(id);
    return;
  }
  const result: CheckResult = await checkHealth(g.health);
  const failStreak = result.alive ? 0 : rt.failStreak + 1;
  patchRuntime(id, {
    lastCheckAt: Date.now(),
    alive: result.alive,
    detail: result.detail,
    failStreak,
  });

  if (result.alive) return;

  appendEvent(id, `检测失败（连续 ${failStreak}/${g.health.failThreshold}）：${result.detail}`);
  if (failStreak >= g.health.failThreshold && g.health.onDead === 'restart') {
    appendEvent(id, `判定失活 → 自愈：重启主脚本`);
    if (rt.logFile) appendMainLog(rt.logFile, `失活自愈触发（连续 ${failStreak} 次检测失败）`);
    try {
      stopGroup(id, { silent: true });
      startGroup(id);
      appendEvent(id, `自愈完成（restarts +1）`);
      patchRuntime(id, { restarts: loadRuntime(id).restarts + 1 });
    } catch (err) {
      appendEvent(id, `自愈失败: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}
