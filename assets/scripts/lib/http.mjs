// 网络原语：HTTP 请求发送器（client 脚本的基础设施）。
//
// send() 是唯一入口：带时间戳日志、耗时统计、超时控制；
// 返回结构化结果（status / headers / body / json），日志输出走 out.mjs 的 log()。
//
// 用法：
//   const r = await send({ method: 'POST', url: 'http://127.0.0.1:8080/api', body: { a: 1 } });
//   if (r.ok) log('响应: ' + JSON.stringify(r.json));
import { log, warn } from './out.mjs';
import { now } from './sys.mjs';

async function request({ method = 'GET', url, headers = {}, body, timeoutMs = 15000, label } = {}) {
  if (!url) throw new Error('send() 缺少 url');
  const t0 = Date.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  let status = 0;
  try {
    const init = {
      method: String(method).toUpperCase(),
      headers: { ...headers },
      signal: ctrl.signal,
    };
    if (body !== undefined && init.method !== 'GET' && init.method !== 'HEAD') {
      if (body !== null && typeof body === 'object') {
        init.headers['content-type'] = init.headers['content-type'] || 'application/json';
        init.body = JSON.stringify(body);
      } else {
        init.body = String(body);
      }
    }
    const res = await fetch(url, init);
    status = res.status;
    const text = await res.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      json = undefined;
    }
    const ms = Date.now() - t0;
    log(`[${now()}] ${label || ''} ${init.method} ${url} → ${status} (${ms}ms)`.replace('  ', ' '));
    return { ok: res.ok, status, headers: Object.fromEntries(res.headers.entries()), body: text, json, ms };
  } catch (err) {
    const ms = Date.now() - t0;
    const msg = err instanceof Error ? (err.name === 'AbortError' ? `超时(${timeoutMs}ms)` : err.message) : String(err);
    warn(`[${now()}] ${label || ''} ${String(method).toUpperCase()} ${url} → 失败: ${msg} (${ms}ms)`);
    return { ok: false, status: 0, headers: {}, body: '', json: undefined, ms, error: msg };
  } finally {
    clearTimeout(timer);
  }
}

export async function send(opts = {}) {
  return request(opts);
}

export async function httpGet(url, opts = {}) {
  return request({ ...opts, method: 'GET', url });
}

// 便捷取 JSON：请求失败或响应不是 JSON 时返回 undefined（不抛错，日志里已留痕）
export async function httpJson(url, opts = {}) {
  const r = await request({ ...opts, method: 'GET', url });
  return r.json;
}
