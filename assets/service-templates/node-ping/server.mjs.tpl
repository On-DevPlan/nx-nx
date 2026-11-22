// {{ID}} 的主脚本：完整本机案例（可直接改成自己的服务）。
// 路由：/ping 探活 · /health 运行信息 · /api/users 共享面板真实数据 · /shutdown 停止。
// @param port number {{PORT}} 监听端口
import http from 'node:http';
import { installAliases } from './aliases.mjs';

installAliases(globalThis);

const argv = parseArgs(process.argv.slice(2));
const port = Number(argv.flags.port ?? {{PORT}});
const host = String(argv.flags.host ?? '127.0.0.1');
const startedAt = Date.now();

function send(res, status, body, type = 'text/plain; charset=utf-8') {
  res.writeHead(status, { 'content-type': type });
  res.end(body);
}

const server = http.createServer((req, res) => {
  const route = (req.url || '/').split('?')[0];
  if (route === '/ping') return send(res, 200, 'pong');
  if (route === '/health') {
    return send(
      res,
      200,
      JSON.stringify({ ok: true, pid: process.pid, uptimeMs: Date.now() - startedAt }),
      'application/json; charset=utf-8',
    );
  }
  if (route === '/api/users') {
    // DEMO_USERS 来自共享面板：服务和 client 用的是同一份真实数据。
    const users = globalThis.DEMO_USERS || [];
    return send(res, 200, JSON.stringify({ total: users.length, users }), 'application/json; charset=utf-8');
  }
  if (route === '/shutdown' && req.method === 'POST') {
    send(res, 200, 'bye');
    setTimeout(() => process.exit(0), 30);
    return;
  }
  send(res, 404, 'not found');
});

server.listen(port, host, () => {
  log('{{ID}} 已就绪: http://' + host + ':' + port + '/ping (pid ' + process.pid + ')');
});

setInterval(() => {
  log('[heartbeat] ' + new Date().toISOString() + ' pid=' + process.pid);
}, 10000);
