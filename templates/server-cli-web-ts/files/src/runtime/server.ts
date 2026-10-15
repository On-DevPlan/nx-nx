// Web 服务器：node:http 零依赖。
// 职责只有两件：发静态面板文件 + 把 /api/* 交给路由层（见 api.ts）。
import http from 'node:http';
import net from 'node:net';
import type { IncomingMessage, ServerResponse, Server as HttpServer } from 'node:http';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import fsp from 'node:fs/promises';
import { handleApi, sendJson } from './api.js';
import { DEFAULT_PORT } from '../core/paths.js';
import { asAbsolutePath, type AbsolutePath } from '../core/brand.js';

// vite 的 outDir：
//   构建后 dist/runtime/server.js → dist/web/public
//   源码态 src/runtime/server.ts → src/web/public（dev 下由 vite 直接服务，仅兜底）
const PUBLIC_DIR: AbsolutePath = asAbsolutePath(
  resolve(fileURLToPath(new URL('../web/public/', import.meta.url))),
);

const MIME: Record<string, string> = {
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

async function serveStatic(pathname: string, res: ServerResponse): Promise<void> {
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

export interface StartServerOptions {
  port?: number;
  host?: string;
}

export function startServer({ port = DEFAULT_PORT, host = '127.0.0.1' }: StartServerOptions = {}): Promise<
  HttpServer<typeof IncomingMessage, typeof ServerResponse>
> {
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
      if (url.pathname.startsWith('/api/')) {
        await handleApi(req, res, url);
        return;
      }
      await serveStatic(url.pathname, res);
    } catch (err) {
      sendJson(res, 500, {
        ok: false,
        error: String((err as { message?: string })?.message || err),
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
export type ProbeInstance = {
  app: { name: string; title: string; description: string; version: string };
  commands: unknown[];
} | null;

export async function probeInstance(port: number, host = '127.0.0.1'): Promise<ProbeInstance> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 800);
    const r = await fetch(`http://${host}:${port}/api/bootstrap`, { signal: controller.signal });
    clearTimeout(timer);
    if (!r.ok) return null;
    const j = (await r.json()) as { data?: ProbeInstance };
    return (j && j.data) || null;
  } catch {
    return null;
  }
}

/**
 * 从 start 起逐个试，返回第一个能监听的端口（最多试 50 个）。
 * 用临时 net.Server 探测，立刻关闭；与 startServer 走同一套 EADDRINUSE 判定。
 */
export function findFreePort(start: number, host = '127.0.0.1'): Promise<number> {
  return new Promise((resolve_, reject) => {
    const tryPort = (p: number) => {
      if (p > start + 50) {
        reject(new Error(`找不到空闲端口（从 ${start} 起连续 50 个被占）`));
        return;
      }
      const probe = net.createServer();
      probe.once('error', (err: NodeJS.ErrnoException) => {
        if (err && err.code === 'EADDRINUSE') tryPort(p + 1);
        else reject(err);
      });
      probe.listen(p, host, () => probe.close(() => resolve_(p)));
    };
    tryPort(start);
  });
}
