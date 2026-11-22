// 活性检测：端口可连 / HTTP 可响应。
//
// 判定口径刻意宽松——「服务还活着」不要求业务正确：
//   port: TCP 三次握手成功即活（不发送任何数据）
//   http: 状态码 < 500 即活（4xx 也算活，服务本体在响应）
import net from 'node:net';
import { runScript } from '../script/service.js';
import { serviceGroupDir, serviceHttpLogsDir } from './paths.js';
import { resolveServicePanel, resolveServiceScript } from './scripts.js';
import type { HealthConfig, ServiceGroupConfig } from './store.js';

export interface CheckResult {
  alive: boolean;
  detail: string;
}

export interface PortProbe {
  open: boolean;
  detail: string;
}

/**
 * 探一次端口：TCP 握手成功即 open（不发送任何数据）。
 * 独立导出是因为「活性检测」与「杀端口前先确认端口还被占着」要的是同一件事，
 * 各写一份 socket 逻辑迟早会两边口径不一致。
 */
export function probePort(port: number, host = '127.0.0.1', timeoutMs = 2000): Promise<PortProbe> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let settled = false;
    const done = (open: boolean, detail: string) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve({ open, detail });
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => done(true, `端口 ${host}:${port} 可连`));
    socket.once('timeout', () => done(false, `端口 ${host}:${port} 连接超时`));
    socket.once('error', (err: Error) => done(false, `端口 ${host}:${port} 不可连: ${err.message}`));
    socket.connect(port, host);
  });
}

export function checkHealth(h: HealthConfig): Promise<CheckResult> {
  return h.kind === 'http' ? checkHttp(h) : checkPort(h);
}

async function checkPort(h: HealthConfig): Promise<CheckResult> {
  const p = await probePort(h.port, h.host, 2000);
  return { alive: p.open, detail: p.detail };
}

async function checkHttp(h: HealthConfig): Promise<CheckResult> {
  const url = `http://${h.host}:${h.port}${h.path.startsWith('/') ? h.path : '/' + h.path}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 3000);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    // < 500 都算活：4xx 说明服务本体在响应（可能只是这个探测路径没配对）
    const alive = res.status < 500;
    return { alive, detail: `HTTP ${res.status} @ ${url}` };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { alive: false, detail: `HTTP 探测失败 @ ${url}: ${msg}` };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 组级探活入口：配了服务自己的 probe 脚本就执行它，否则退回端口/HTTP 检测。
 *
 * 脚本协议只有两条：退出码 0 = 活，非 0 = 失活；最后一行若为 JSON，
 * 其中的 detail 作为面板详情展示。健康脚本与服务、client 同在一个组命名空间，
 * 可以读共享面板里的真实数据，不再是一段用户改不到的内置探测逻辑。
 */
export async function checkGroupHealth(g: ServiceGroupConfig, h?: HealthConfig): Promise<CheckResult> {
  const health = h ?? g.health;
  if (!g.probe?.script) {
    if (!health) return { alive: false, detail: '服务组未配置探活（health 与 probe 都为空）' };
    return checkHealth(health);
  }
  const cwd = g.cwd || serviceGroupDir(g.id);
  const port = health?.port;
  const env: NodeJS.ProcessEnv = {
    NX_SERVICE_DIR: cwd,
    NX_HTTP_LOG_DIR: serviceHttpLogsDir(g.id),
    ...(port ? { NX_SERVICE_PORT: String(port), NX_SERVICE_URL: `http://${health?.host ?? '127.0.0.1'}:${port}` } : {}),
  };
  let shared: string | undefined;
  if (g.shared) {
    try {
      shared = resolveServicePanel(g.id, g.shared).path;
    } catch {
      shared = undefined;
    }
  }
  try {
    const target = resolveServiceScript(g.id, g.probe.script).path;
    const r = await runScript(target, { args: g.probe.args, cwd, shared, env });
    let detail = probeDetail(r.stdout, r.stderr, r.code);
    let alive = r.code === 0;
    const lastJson = [...r.stdout.trim().split(/\r?\n/)].reverse().find((line) => {
      try {
        return Boolean(JSON.parse(line) && typeof line === 'string');
      } catch {
        return false;
      }
    });
    if (lastJson) {
      const parsed = JSON.parse(lastJson) as { alive?: unknown; detail?: unknown };
      if (typeof parsed.alive === 'boolean') alive = parsed.alive;
      if (typeof parsed.detail === 'string' && parsed.detail) detail = parsed.detail;
    }
    return { alive, detail };
  } catch (err) {
    return { alive: false, detail: err instanceof Error ? err.message : String(err) };
  }
}

function probeDetail(stdout: string, stderr: string, code: number): string {
  const lines = (stdout + (stderr ? '\n[stderr] ' + stderr : ''))
    .trim()
    .split(/\r?\n/)
    .filter((line) => line.trim() && !line.startsWith('[shared]'));
  const text = lines.slice(-4).join(' | ') || `探活脚本退出码 ${code}`;
  return text.length > 400 ? '…' + text.slice(-400) : text;
}
