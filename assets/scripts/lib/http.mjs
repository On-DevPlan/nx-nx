// 网络原语：HTTP 请求发送器（client 脚本的基础设施）。
//
// 三层 API（扩展业务 API 时只需记住函数签名）：
//   核心：send({ method, url, qs, headers, body, timeoutMs, label })
//   动词：get / post / put / del / getJson / postJson
//   认证与断言：bearer(token) / basic(user, pass) / expectStatus(res, code, label)
//
// 「一请求一日志」：每次请求全量 req + resp 自动写入
//   $NX_HTTP_LOG_DIR（默认 ./http-logs/）/<时间戳>-<METHOD>-<slug>.log
// sg 流水线执行时该目录自动指向 ~/.nx-nx/services/http-logs/<组>/。
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { log, warn } from './out.mjs';
import { now, env } from './sys.mjs';

function reqLogDir() {
  return env('NX_HTTP_LOG_DIR', join(process.cwd(), 'http-logs'));
}

// 把 query 对象并进 url（qs: { page: 1, keyword: 'x' }）
function withQs(url, qs) {
  if (!qs || typeof qs !== 'object') return url;
  const u = new URL(url);
  for (const [k, v] of Object.entries(qs)) {
    if (v === undefined || v === null) continue;
    u.searchParams.set(k, String(v));
  }
  return u.toString();
}

// 一请求一日志：全量 req/resp 写入独立文件（可读文本格式），返回日志路径
function writeReqRespLog(entry) {
  try {
    const dir = reqLogDir();
    mkdirSync(dir, { recursive: true });
    const stamp = entry.time.replace(/[:.]/g, '-').slice(0, 23);
    let slug = 'request';
    try {
      const u = new URL(entry.url);
      slug = (u.host + u.pathname).replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    } catch {
      /* url 不合法时退化为 request */
    }
    const file = join(dir, `${stamp}-${entry.method}-${slug}-${Math.random().toString(36).slice(2, 6)}.log`);
    const lines = [
      '=== REQUEST ===',
      `${entry.time}  ${entry.method} ${entry.url}${entry.label ? '  [' + entry.label + ']' : ''}`,
      ...Object.entries(entry.req.headers).map(([k, v]) => `  ${k}: ${v}`),
      entry.req.body === undefined || entry.req.body === '' ? '' : `Body: ${entry.req.body}`,
      '',
      '=== RESPONSE ===',
      `Status: ${entry.resp.status}  (${entry.ms}ms)`,
      ...Object.entries(entry.resp.headers).map(([k, v]) => `  ${k}: ${v}`),
      entry.resp.body === '' ? '' : `Body: ${entry.resp.body}`,
      '',
      '=== META ===',
      JSON.stringify({ ok: entry.ok, error: entry.error ?? null, logVersion: 1 }, null, 2),
      '',
    ];
    writeFileSync(file, lines.filter((l) => l !== '').join('\n') + '\n', 'utf8');
    return file;
  } catch {
    return undefined; // 日志失败不影响请求本身
  }
}

// 核心发送器
async function request({ method = 'GET', url, qs, headers = {}, body, timeoutMs = 15000, label } = {}) {
  if (!url) throw new Error('send() 缺少 url');
  const fullUrl = withQs(String(url), qs);
  const time = now();
  const t0 = Date.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);

  const reqHeaders = { ...headers };
  let reqBody;
  const m = String(method).toUpperCase();
  if (body !== undefined && m !== 'GET' && m !== 'HEAD') {
    if (body !== null && typeof body === 'object') {
      reqHeaders['content-type'] = reqHeaders['content-type'] || 'application/json';
      reqBody = JSON.stringify(body);
    } else {
      reqBody = String(body);
    }
  }

  let status = 0;
  let respHeaders = {};
  let respBody = '';
  let error;
  try {
    const res = await fetch(fullUrl, { method: m, headers: reqHeaders, body: reqBody, signal: ctrl.signal });
    status = res.status;
    respHeaders = Object.fromEntries(res.headers.entries());
    respBody = await res.text();
  } catch (err) {
    error = err instanceof Error
      ? (err.name === 'AbortError' ? `超时(${timeoutMs}ms)` : err.message)
      : String(err);
  } finally {
    clearTimeout(timer);
  }
  const ms = Date.now() - t0;
  const ok = status >= 200 && status < 400;

  let json;
  try {
    json = respBody ? JSON.parse(respBody) : undefined;
  } catch {
    json = undefined;
  }

  const entry = {
    time, method: m, url: fullUrl, label: label || '',
    req: { headers: reqHeaders, body: reqBody },
    resp: { status, headers: respHeaders, body: respBody },
    ms, ok, error,
  };
  const logFile = writeReqRespLog(entry);

  if (error) {
    warn(`[${time}] ${label || ''} ${m} ${fullUrl} → 失败: ${error} (${ms}ms)`);
  } else {
    log(`[${time}] ${label || ''} ${m} ${fullUrl} → ${status} (${ms}ms)`);
  }
  return { ok, status, headers: respHeaders, body: respBody, json, ms, error, logFile };
}

// ---- 动词族（扩展业务 API 时只需记住这些签名）----

export async function send(opts = {}) {
  return request(opts);
}

export async function get(url, opts = {}) {
  return request({ ...opts, method: 'GET', url });
}

export async function post(url, body, opts = {}) {
  return request({ ...opts, method: 'POST', url, body });
}

export async function put(url, body, opts = {}) {
  return request({ ...opts, method: 'PUT', url, body });
}

export async function del(url, opts = {}) {
  return request({ ...opts, method: 'DELETE', url });
}

// 直接取 JSON（失败/非 JSON 返回 undefined，日志里已留痕）
export async function getJson(url, opts = {}) {
  const r = await request({ ...opts, method: 'GET', url });
  return r.json;
}

export async function postJson(url, body, opts = {}) {
  const r = await request({ ...opts, method: 'POST', url, body });
  return r.json;
}

// ---- 认证与断言 ----

export function bearer(token) {
  return { authorization: `Bearer ${token}` };
}

export function basic(user, pass) {
  return { authorization: `Basic ${Buffer.from(`${user}:${pass}`).toString('base64')}` };
}

// 状态断言：不符合走 warn 日志（不打断脚本），返回布尔供业务分支
export function expectStatus(res, expected, label = '') {
  const pass = res && res.status === expected;
  if (!pass) {
    warn(`expectStatus${label ? '[' + label + ']' : ''}: 期望 ${expected}，实际 ${res ? res.status : 'no-response'}`);
  }
  return pass;
}
