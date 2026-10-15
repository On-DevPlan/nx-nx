// Web 服务器：node:http 零依赖。
// 职责只有两件事：发静态面板文件 + 把 /api/* 交给路由层（见 api.js）。
import http from 'node:http';
import net from 'node:net';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import fsp from 'node:fs/promises';
import { handleApi, sendJson } from './api.js';
import { DEFAULT_PORT } from '../core/paths.js';

// vite 的 outDir：src/web/public（构建产物，gitignore）
const PUBLIC_DIR = resolve(fileURLToPath(new URL('../web/public/', import.meta.url)));

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8',
};

async function serveStatic(pathname, res) {
  const rel = pathname === '/' ? 'index.html' : decodeURIComponent(pathname).replace(/^\/+/, '');
  const file = resolve(PUBLIC_DIR, rel);

  // 越界校验：解析成绝对路径后必须仍落在 PUBLIC_DIR 内。
  // 比对解析结果，而不是剥离 '..' 字面量——后者挡不住编码变形。
  if (file !== PUBLIC_DIR && !file.startsWith(PUBLIC_DIR + sep)) {
    res.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Forbidden');
    return;
  }

  try {
    const buf = await fsp.readFile(file);
    res.writeHead(200, {
      'content-type': MIME[extname(file).toLowerCase()] || 'application/octet-stream',
      'cache-control': 'no-store',
    });
    res.end(buf);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Not Found');
  }
}

export function startServer({ port = DEFAULT_PORT, host = '127.0.0.1' } = {}) {
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      if (url.pathname.startsWith('/api/')) {
        await handleApi(req, res, url);
        return;
      }
      await serveStatic(url.pathname, res);
    } catch (err) {
      sendJson(res, 500, {
        ok: false,
        error: String((err && err.message) || err),
        code: 'INTERNAL',
      });
    }
  });
  return new Promise((resolve_, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => resolve_(server));
  });
}

/**
 * 探测某端口上是否已经有一个面板在跑：GET /api/bootstrap，短超时。
 * 返回 bootstrap 数据（含 app.name / commands），不是面板或无响应返回 null。
 *
 * 用途：serve 时默认端口被占，最常见的原因是「这个项目的面板已经在跑」——
 * 不必再开一个，直接把浏览器指过去即可。
 */
export async function probeInstance(port, host = '127.0.0.1') {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 800);
    const r = await fetch(`http://${host}:${port}/api/bootstrap`, { signal: controller.signal });
    clearTimeout(timer);
    if (!r.ok) return null;
    const j = await r.json();
    return (j && j.data) || null;
  } catch {
    return null;
  }
}

/**
 * 从 start 起逐个试，返回第一个能监听的端口（最多试 50 个）。
 * 用临时 net.Server 探测，立刻关闭；与 startServer 走同一套 EADDRINUSE 判定。
 */
export function findFreePort(start, host = '127.0.0.1') {
  return new Promise((resolve_, reject) => {
    const tryPort = (p) => {
      if (p > start + 50) {
        reject(new Error(`找不到空闲端口（从 ${start} 起连续 50 个被占）`));
        return;
      }
      const probe = net.createServer();
      probe.once('error', (err) => {
        if (err && err.code === 'EADDRINUSE') tryPort(p + 1);
        else reject(err);
      });
      probe.listen(p, host, () => probe.close(() => resolve_(p)));
    };
    tryPort(start);
  });
}
