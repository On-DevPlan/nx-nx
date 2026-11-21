// {{ID}} 的主脚本：最小 Node HTTP 服务（模板 node-ping 生成，可直接改）。
//
// 这一份是「服务组最小可跑闭环」：起得来、探得活、关得掉。
//   nx-nx sg start {{ID}}    # 启动（detached，IO 重定向到 ~/.nx-nx/services/logs/）
//   nx-nx sg check {{ID}}    # 探活：HTTP GET /ping 期望 200 pong
//   nx-nx sg stop {{ID}}     # 关闭（stopMode=auto：杀端口占用进程）
//
// 接口：
//   GET /ping    → 200 text/plain "pong"（活性检测打的就是它）
//   GET /health  → 200 JSON { ok, pid, uptimeMs }
//
// 改这里就能接自己的业务：把 /ping 换成你的健康检查路径，
// 或在路由里加自己的 API（模板 node-api 是带业务接口的版本）。
//
// @param port number {{PORT}} 监听端口（服务组 main.args 里的 --port 会传进来）
// @param host string 127.0.0.1 绑定地址
import http from 'node:http';
import { installAliases } from './aliases.mjs';

installAliases(globalThis);

const argv = parseArgs(process.argv.slice(2));
const port = Number(argv.flags.port ?? {{PORT}});
const host = String(argv.flags.host ?? '127.0.0.1');
const startedAt = Date.now();

const server = http.createServer((req, res) => {
  const route = (req.url || '/').split('?')[0];
  if (route === '/ping') {
    res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('pong');
    return;
  }
  if (route === '/health') {
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: true, pid: process.pid, uptimeMs: Date.now() - startedAt }));
    return;
  }
  res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
  res.end('not found');
});

server.listen(port, host, () => {
  log('{{ID}} 已就绪: http://' + host + ':' + port + '/ping (pid ' + process.pid + ')');
});

// 心跳：每 10 秒一行，用来确认「IO 输出真的进了日志文件」
setInterval(() => {
  log('[heartbeat] ' + new Date().toISOString() + ' pid=' + process.pid);
}, 10000);
