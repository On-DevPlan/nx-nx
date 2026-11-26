// Web 服务器（OOP：PanelServer 类）：node:http 零依赖。
// 职责只有两件：发静态面板文件 + 把 /api/* 交给 ApiRouter。
import http from 'node:http';
import type { IncomingMessage, ServerResponse, Server as HttpServer } from 'node:http';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import fsp from 'node:fs/promises';
import { ApiRouter, sendJson } from './api.js';
import { registry } from './registry.js';
import { corsHeaders, isPreflight, parseAllowOrigin, preflightHeaders, type AllowOrigin } from './cors.js';
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

export class PanelServer {
  constructor(
    private api: ApiRouter,
    /** 跨域放行策略（见 runtime/cors.ts）：缺省放行全部，收紧用 --allow-origin */
    private allow: AllowOrigin = { all: true, list: [] },
  ) {}

  /** 起服务并返回底层 http.Server（调用方要读 address() 与 close()）。 */
  start({ port = DEFAULT_PORT, host = '127.0.0.1' }: { port?: number; host?: string } = {}): Promise<
    HttpServer<typeof IncomingMessage, typeof ServerResponse>
  > {
    const server = http.createServer((req, res) => {
      void this.dispatch(req, res);
    });
    return new Promise((resolve_, reject) => {
      server.once('error', reject);
      server.listen(port, host, () => resolve_(server));
    });
  }

  private async dispatch(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

      // CORS 头：静态页与 /api 都带。预检（OPTIONS + Access-Control-Request-Method）
      // 直接 204 回，不进路由——跨源请求要的是「浏览器放行」的答复，不是业务数据。
      for (const [k, v] of Object.entries(corsHeaders(req, this.allow))) res.setHeader(k, v);
      if (url.pathname.startsWith('/api/') && isPreflight(req)) {
        for (const [k, v] of Object.entries(preflightHeaders(req, this.allow))) res.setHeader(k, v);
        res.writeHead(204);
        res.end();
        return;
      }

      if (url.pathname.startsWith('/api/')) {
        await this.api.handle(req, res, url);
        return;
      }
      await this.serveStatic(url.pathname, res);
    } catch (err) {
      sendJson(res, 500, {
        ok: false,
        error: String((err as { message?: string })?.message || err),
        code: 'INTERNAL',
      });
    }
  }

  private async serveStatic(pathname: string, res: ServerResponse): Promise<void> {
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
}

export interface StartServerOptions {
  port?: number;
  host?: string;
  /** 跨域放行来源（逗号分隔，支持 * 通配）；缺省放行全部。见 runtime/cors.ts */
  allowOrigin?: string;
}

// 兼容入口：cmdServe（CliApp.serve）与编程调用方都用它。
// 每次调用都用当前注册表新建 ApiRouter——路由表是构造期产物，注册表变了要重编译。
export function startServer({ port, host, allowOrigin }: StartServerOptions = {}): Promise<
  HttpServer<typeof IncomingMessage, typeof ServerResponse>
> {
  const allow = parseAllowOrigin(allowOrigin);
  return new PanelServer(new ApiRouter(registry.actions), allow).start({ port, host });
}

/**
 * 关停：先断长连，再关监听。
 *
 * `server.close()` 只停止接受**新**连接，已有连接要等它们自己断。面板常驻一条
 * SSE（浏览器 EventSource），用户不关页面它就不会断——于是 Ctrl+C 之后
 * close 的回调永远等不到，进程一直挂着（实测：SSE 在线时回调要等连接被 abort）。
 * 所以这里先 closeAllConnections()（Node ≥18.2）把长连掐掉，再等 close 收尾；
 * graceMs 只兜隧道 / 代理下那种「谁也关不掉」的半开连接。
 */
export function shutdownServer(
  server: HttpServer<typeof IncomingMessage, typeof ServerResponse>,
  { graceMs = 1000 }: { graceMs?: number } = {},
): Promise<void> {
  return new Promise((resolve) => {
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      resolve();
    };
    server.close(done);
    server.closeAllConnections?.();
    setTimeout(done, graceMs).unref();
  });
}
