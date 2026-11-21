// 服务组运行时：启动（detached spawn + 日志重定向）、停止（关停脚本 / 杀端口 / 杀 pid）、
// 活性 watcher（serve 进程内的定时检测 + 失活自愈）。
//
// 进程模型：
//   主脚本 = detached spawn，stdio 追加重定向到日志文件（IO 输出定向），
//   unref 后 serve 退出也不带走它；管理靠「pid 记录 + 端口/HTTP 活性轮询」。
// 自愈边界：
//   watcher 定时器活在 serve 进程里 —— `nx-nx serve` 不在跑时只做检测不自动重启
//   （CLI 的 sg start/stop 随时可手动用）。
import { spawn } from 'node:child_process';
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
  saveGroups,
  updateRuntime,
  DEFAULT_CHECK_METHOD,
  type ServiceGroupConfig,
} from './store.js';
import { appendEvent } from './logs.js';
import { pidAlive, stopGroup as stopProcesses, type StopResult } from './stop.js';
import { serviceHttpLogsDir, serviceGroupDir, serviceLogsDir } from './paths.js';
import { applyLaunchArgs, effectiveHealth, launchEnv, launchPort, normalizeLaunchValues, type LaunchValues } from './launch.js';
import { checkSpace, resolvePanelPath } from './namespace.js';
import { runnerPath, scriptsDir } from '../script/paths.js';

// 每组一个定时器（serve 进程内）
const watchers = new Map<string, ReturnType<typeof setInterval>>();

// ---- 日志 ----

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

// ---- 启动 ----
//
// 幂等语义（端口被占用 → 跳过启动）：
//   1. pid 记录还活着 → skip
//   2. 配了 health 且真实活性检测通过 → skip（pid 记录可能过期——进程被外部回收/
//      换机迁移等，端口活的就是服务本体，不重复启动）
//   3. 都不满足 → 真正启动
//
// 空间闸门（「执行 server 前先 check」）在真正启动之前：
//   配置了 space.check 的组，必须由空间里那个返回 bool 的方法点头才启动。
//   闸门在 startGroup 里而不是流水线里——因为「启动」有两扇门
//   （sg run 流水线 与 sg start / 面板启动按钮），闸门必须管住两扇。
//   自愈重启（tickWatch）走 skipGate：恢复动作不该被业务闸门拦死，
//   否则依赖抖动会造成「永不重启」。

export interface SpaceGateResult {
  method: string;
  alive: boolean;
  detail: string;
}

/**
 * 空间闸门：问空间一个 bool 方法「现在能起吗」。
 * 没配空间或没配 check 方法 → null（不做前置 check）。
 */
export async function spaceGate(g: ServiceGroupConfig): Promise<SpaceGateResult | null> {
  const cfg = g.space;
  if (!cfg) return null;
  const panel = cfg.panel || g.shared;
  if (!panel) return null;
  const method = cfg.check || DEFAULT_CHECK_METHOD;
  let panelPath: string;
  try {
    panelPath = resolvePanelPath(panel);
  } catch (err) {
    return { method, alive: false, detail: err instanceof Error ? err.message : String(err) };
  }
  const r = await checkSpace(panelPath, method);
  return { method, alive: r.alive, detail: r.detail };
}

export async function startGroup(
  id: string,
  opts: { skipGate?: boolean; values?: LaunchValues } = {},
): Promise<{ started: boolean; pid?: number; logFile: string; detail: string }> {
  const g = getGroup(id);
  if (!g.main) throw new Error(`服务组 ${id} 未配置主脚本（main）`);
  let rt = loadRuntime(id);
  // 本次启动参数：显式传入优先；自愈/重复启动沿用 runtime 里上一次的值。
  const values = normalizeLaunchValues(g, opts.values ?? rt.launch);
  const health = effectiveHealth(g, values);

  // 空间闸门：不过就不启动（保守：宁可不起，也不假装活）
  if (!opts.skipGate) {
    const gate = await spaceGate(g);
    if (gate && !gate.alive) {
      const detail = `空间 check 未通过（${gate.method}）：${gate.detail}`;
      appendEvent(id, detail);
      patchRuntime(id, { alive: false, detail });
      return { started: false, pid: rt.pid, logFile: rt.logFile ?? '', detail };
    }
  }

  // 显式换了版本（端口 / 环境 / 配置文件）而旧进程还在：先停旧的，再按新参数起。
  // 否则 running 的短路会让流水线对着新端口探活，却留着旧端口上的进程。
  if (opts.values && rt.status === 'running' && rt.pid && (await pidAlive(rt.pid))) {
    const prev = normalizeLaunchValues(g, rt.launch);
    if (JSON.stringify(prev) !== JSON.stringify(values)) {
      const stopped = await stopProcesses(id, { silent: true });
      appendEvent(id, `启动参数变化，先停止旧进程：${stopped.detail}`);
      rt = loadRuntime(id);
    }
  }

  if (rt.status === 'running' && rt.pid && (await pidAlive(rt.pid))) {
    return { started: false, pid: rt.pid, logFile: rt.logFile ?? '', detail: '已在运行' };
  }
  if (health) {
    const c = await checkHealth(health);
    if (c.alive) {
      patchRuntime(id, {
        status: 'running',
        alive: true,
        detail: c.detail,
        failStreak: 0,
        pid: rt.pid,
        logFile: rt.logFile,
      });
      startWatcher(id);
      return { started: false, pid: rt.pid, logFile: rt.logFile ?? '', detail: `端口/服务已就绪，跳过启动（${c.detail}）` };
    }
  }

  const logFile = newLogFile(id);
  const fd = openSync(logFile, 'a');
  appendFileSync(fd, `\n===== 启动 ${new Date().toISOString()} · 组 ${id} · 脚本 ${g.main.script} =====\n`, 'utf8');

  // 每组自己的 cwd：启动进程、client、临时产物都在这里，不再和别的服务共用目录。
  const cwd = g.cwd || serviceGroupDir(g.id);
  mkdirSync(cwd, { recursive: true });

  const target = resolveMainScript(g.main.script);
  const args = applyLaunchArgs(g, g.main.args, values);
  const child = spawn(
    process.execPath,
    [runnerPath(), target, ...args],
    {
      detached: true,
      cwd,
      stdio: ['ignore', fd, fd],
      env: sharedEnv(g, values),
    },
  );
  child.unref();

  patchRuntime(id, {
    status: 'running',
    pid: child.pid,
    startedAt: Date.now(),
    logFile,
    failStreak: 0,
    launch: values,
  });
  // 刚 spawn：宽限一个 interval 再检测（端口还没 bind 就报失活是假警报）
  startWatcher(g.id, { immediate: false });
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
function sharedEnv(g: ServiceGroupConfig, values?: LaunchValues): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };
  if (g.shared) {
    const p = join(scriptsDir(), g.shared.endsWith('.mjs') ? g.shared : g.shared + '.mjs');
    if (existsSync(p)) env['NX_SHARED_PANEL'] = p;
  }
  if (process.env.NX_NX_SERVE_PORT) env['NX_NX_SERVE_PORT'] = process.env.NX_NX_SERVE_PORT;
  // client 脚本的「一请求一日志」按组隔离
  env['NX_HTTP_LOG_DIR'] = serviceHttpLogsDir(g.id);
  // 这个服务自己的工作目录（脚本里可写 client 产物 / 缓存 / 测试数据）
  env['NX_SERVICE_DIR'] = g.cwd || serviceGroupDir(g.id);
  // 本次实际端口 / URL：让 client 与共享面板跟着启动参数走，而不是死记模板里的默认端口。
  const h = effectiveHealth(g, values);
  const port = launchPort(g, values) ?? h?.port;
  if (port) {
    env['NX_SERVICE_PORT'] = String(port);
    env['NX_SERVICE_URL'] = `http://${h?.host ?? '127.0.0.1'}:${port}`;
  }
  // 启动参数里声明了 env 的（如 NODE_ENV / CONFIG_FILE）
  Object.assign(env, launchEnv(g, values));
  return env;
}

// ---- 停止 ----
//
// 「怎么停」的策略在 stop.ts（stopMode 四选一 + 三重兜底 + 非阻塞执行）；
// 这里只负责 watcher 生命周期——停服前先摘掉定时器，否则下一次 tick 会
// 读到「刚被我们标记为 stopped」的状态再做一次无意义的检测。
export async function stopGroup(
  id: string,
  opts: { mode?: string; silent?: boolean } = {},
): Promise<StopResult> {
  stopWatcher(id);
  return stopProcesses(id, opts);
}

// ---- 活性 watcher（serve 进程内） ----

/**
 * 挂上活性监控。
 *
 * immediate=false 用于「刚刚启动」的场景：主脚本起来到下一条 tick 之前
 * 端口可能还没 bind，立刻检测会先报一次假的「检测失败」，把人吓一跳。
 * 等一个 interval 再检，宽限期就是这个 tick。
 */
export function startWatcher(id: string, opts: { immediate?: boolean } = {}): void {
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
  if (opts.immediate !== false) void tickWatch(g.id).catch(() => {});
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
  const health = effectiveHealth(g, rt.launch);
  if (!health) return;
  const result: CheckResult = await checkHealth(health);
  const failStreak = result.alive ? 0 : rt.failStreak + 1;
  patchRuntime(id, {
    lastCheckAt: Date.now(),
    alive: result.alive,
    detail: result.detail,
    failStreak,
  });

  if (result.alive) return;

  appendEvent(id, `检测失败（连续 ${failStreak}/${health.failThreshold}）：${result.detail}`);
  // 自愈开关就是 health.onDead：none = 只记录不处理（监控照跑，日志照写）
  if (failStreak >= health.failThreshold && health.onDead === 'restart') {
    appendEvent(id, `判定失活 → 自愈：重启主脚本`);
    if (rt.logFile) appendMainLog(rt.logFile, `失活自愈触发（连续 ${failStreak} 次检测失败）`);
    try {
      await stopGroup(id, { silent: true });
      // skipGate：自愈是恢复动作，不能被「起飞闸门」拦死——
      // 否则上游依赖抖动会造成「永不重启」。
      await startGroup(id, { skipGate: true });
      // 用 updateRuntime 做 +1：与面板按钮并发时不会互相覆盖
      updateRuntime(id, (cur) => ({ restarts: cur.restarts + 1 }));
      appendEvent(id, `自愈完成（restarts +1）`);
    } catch (err) {
      appendEvent(id, `自愈失败: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}

// ---- 自愈开关 ----
//
// 「是否启动自愈」是长脚本三个日常动作之一，所以给它一条独立入口，
// 而不是让用户去 health 的 JSON 里改 onDead。
//
// 单一事实源仍然是 health.onDead（restart / none）——这个函数只是它的动作化投影。
// 关自愈 ≠ 停监控：watcher 继续跑（只记录不处理），否则「先关自愈观察一阵」
// 这个最常见的用法就没法用（连检测痕迹都没了）。
export function setAutoHeal(id: string, on: boolean): { id: string; autoHeal: boolean; watching: boolean } {
  const g = getGroup(id);
  if (!g.health) {
    throw new Error(`服务组 ${id} 未配置探活（health）：没有检测就没有自愈可开关`);
  }
  const health = { ...g.health, onDead: on ? ('restart' as const) : ('none' as const) };
  saveGroups(loadGroups().map((x) => (x.id === id ? { ...x, health } : x)));
  const running = loadRuntime(id).status === 'running';
  if (running) startWatcher(id);
  appendEvent(id, `自愈${on ? '开启（失活即重启）' : '关闭（只记录不处理）'}`);
  return { id, autoHeal: on, watching: running };
}
