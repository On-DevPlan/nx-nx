// {{ID}} 的主脚本：带业务接口的 Node HTTP 服务（模板 node-api 生成，可直接改）。
//
// 起停：
//   nx-nx sg start {{ID}}    # 启动（IO 重定向到 ~/.nx-nx/services/logs/）
//   nx-nx sg check {{ID}}    # 探活：GET /health
//   nx-nx sg stop {{ID}}     # 关闭（先跑 {{ID}}-stop，再兜底杀端口）
//
// 接口：
//   GET  /health          → 200 JSON（活性检测路径）
//   GET  /api/customers   → 200 JSON（需要 Authorization: Bearer tok_...）
//   POST /api/customers   → 201 JSON（同上）
//
// 鉴权的 token 不在本文件里：它由共享面板 {{ID}}.shared 产出并在 client 里使用。
//
// @param port number {{PORT}} 监听端口（服务组 main.args 里的 --port 会传进来）
// @param host string 127.0.0.1 绑定地址
import http from 'node:http';
import { join } from 'node:path';
import { installAliases } from './aliases.mjs';

installAliases(globalThis);

const argv = parseArgs(process.argv.slice(2));
const port = Number(argv.flags.port ?? {{PORT}});
const host = String(argv.flags.host ?? '127.0.0.1');
const pidFile = join(homeDir(), '.nx-nx', '{{ID}}.pid');

const CUSTOMERS = [
  { id: 1, name: 'customer-A', level: 'normal' },
  { id: 2, name: 'customer-B', level: 'vip' },
];

function json(res, status, payload) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

function authorized(req) {
  const auth = req.headers.authorization || '';
  return auth.startsWith('Bearer tok_');
}

const server = http.createServer((req, res) => {
  const route = (req.url || '/').split('?')[0];
  if (route === '/health') {
    json(res, 200, { ok: true, pid: process.pid });
    return;
  }
  if (route === '/api/customers') {
    if (!authorized(req)) {
      json(res, 401, { error: 'unauthorized', hint: '带上 Authorization: Bearer tok_…' });
      return;
    }
    if (req.method === 'POST') {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        let item = {};
        try {
          item = JSON.parse(body || '{}');
        } catch {
          json(res, 400, { error: 'invalid json' });
          return;
        }
        const created = { id: CUSTOMERS.length + 1, ...item };
        CUSTOMERS.push(created);
        json(res, 201, { created: true, item: created });
      });
      return;
    }
    const q = new URL(req.url || '/', 'http://127.0.0.1:' + port).searchParams;
    json(res, 200, {
      data: CUSTOMERS,
      page: Number(q.get('page') ?? 1),
      size: Number(q.get('size') ?? 20),
      keyword: q.get('keyword') ?? '',
    });
    return;
  }
  json(res, 404, { error: 'not found' });
});

server.listen(port, host, async () => {
  await writeText(pidFile, String(process.pid));
  log('{{ID}} 已就绪: http://' + host + ':' + port + '/health (pid ' + process.pid + ')');
});

setInterval(() => {
  log('[heartbeat] ' + new Date().toISOString() + ' pid=' + process.pid);
}, 10000);
