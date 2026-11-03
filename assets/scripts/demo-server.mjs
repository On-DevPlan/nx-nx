// 演示：长驻 HTTP 服务（服务组的主脚本）。
// 用法: nx-nx script run demo-server -- --port 18999
// 行为: /health 返回 200；把 pid 写到 ~/.nx-nx/demo-server.pid 供关停脚本用；周期性输出日志（验证 IO 重定向）。
import http from 'node:http';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { installAliases } from './aliases.mjs';

installAliases(globalThis);

const argv = parseArgs(process.argv.slice(2));
const port = Number(argv.flags.port ?? 18999);

const server = http.createServer((req, res) => {
  const url = req.url || '';
  if (url.startsWith('/health')) {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, pid: process.pid, t: Date.now() }));
    return;
  }
  if (url.startsWith('/api/customers')) {
    // 简单鉴权示范：要求 Bearer token
    const auth = req.headers.authorization || '';
    if (!auth.startsWith('Bearer tok_')) {
      res.writeHead(401, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'unauthorized' }));
      return;
    }
    const q = new URL(url, `http://127.0.0.1:${port}`).searchParams;
    if (req.method === 'POST') {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        res.writeHead(201, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ created: true, item: JSON.parse(body || '{}') }));
      });
      return;
    }
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({
      data: [
        { id: 1, name: 'customer-A', level: 'normal' },
        { id: 2, name: 'customer-B', level: 'vip' },
      ],
      page: Number(q.get('page') ?? 1),
      size: Number(q.get('size') ?? 20),
      keyword: q.get('keyword') ?? '',
    }));
    return;
  }
  res.writeHead(404);
  res.end('not found');
});

server.listen(port, '127.0.0.1', () => {
  const pidFile = join(homedir(), '.nx-nx', 'demo-server.pid');
  mkdirp(join(homedir(), '.nx-nx'));
  writeText(pidFile, String(process.pid));
  log(`demo-server 已就绪: http://127.0.0.1:${port}/health (pid ${process.pid})`);
});

// 周期心跳：写入主日志文件，验证「IO 输出定向到日志」
setInterval(() => {
  log(`[heartbeat] ${new Date().toISOString()} pid=${process.pid} alive=true`);
}, 10000);
