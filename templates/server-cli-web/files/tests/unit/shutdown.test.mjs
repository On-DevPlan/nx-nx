// 关停契约：面板常驻一条 SSE 时，关停也必须能结束。
//
// 背景（回归）：`server.close()` 只停止接受新连接，已有连接要等它们自己断。
// 面板的 EventSource 不会自己断，于是 Ctrl+C 之后 close 的回调永远等不到，
// 进程挂在终端里只能强杀。shutdownServer 先 closeAllConnections() 再等 close。
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { shutdownServer, startServer } from '../../src/runtime/server.ts';

test('有活跃 SSE 连接时 shutdownServer 仍能及时结束', async () => {
  const server = await startServer({ port: 0, host: '127.0.0.1' });
  const addr = server.address();
  assert.equal(typeof addr, 'object');
  const port = addr.port;

  const ac = new AbortController();
  const sse = await fetch(`http://127.0.0.1:${port}/api/events`, { signal: ac.signal });
  assert.equal(sse.status, 200, 'SSE 应连上');
  await sse.body.getReader().read(); // 读连接帧：确认长连已建立，而不是只握手

  const t0 = Date.now();
  await shutdownServer(server);
  const elapsed = Date.now() - t0;
  ac.abort();

  assert.ok(elapsed < 800, `关停耗时 ${elapsed}ms —— SSE 长连没被断开，Ctrl+C 会挂住`);
});
