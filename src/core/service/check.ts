// 活性检测：端口可连 / HTTP 可响应。
//
// 判定口径刻意宽松——「服务还活着」不要求业务正确：
//   port: TCP 三次握手成功即活（不发送任何数据）
//   http: 状态码 < 500 即活（4xx 也算活，服务本体在响应）
import net from 'node:net';
import type { HealthConfig } from './store.js';

export interface CheckResult {
  alive: boolean;
  detail: string;
}

export function checkHealth(h: HealthConfig): Promise<CheckResult> {
  return h.kind === 'http' ? checkHttp(h) : checkPort(h);
}

function checkPort(h: HealthConfig): Promise<CheckResult> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let settled = false;
    const done = (alive: boolean, detail: string) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve({ alive, detail });
    };
    socket.setTimeout(2000);
    socket.once('connect', () => done(true, `端口 ${h.host}:${h.port} 可连`));
    socket.once('timeout', () => done(false, `端口 ${h.host}:${h.port} 连接超时`));
    socket.once('error', (err: Error) => done(false, `端口 ${h.host}:${h.port} 不可连: ${err.message}`));
    socket.connect(h.port, h.host);
  });
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
