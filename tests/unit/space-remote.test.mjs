// 「CLI 空间命令转给 serve」这条路由的单元测试。
//
// 这条路由很容易被改坏：
//   - 忘了写落点 → CLI 永远走本地，命令与界面变成两个空间（状态对不上）；
//   - 回环没防住 → serve 处理请求时又去请求自己，栈越压越深；
//   - 没走本地兜底 → serve 没起时命令直接不可用（而不是退而求其次）。
//
// 数据隔离：NX_NX_HOME 把整个服务组目录搬到临时目录，绝不碰用户真实的 ~/.nx-nx。
// （必须在 import core 模块**之前**设好——路径在模块加载时就求值了。）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const HOME = mkdtempSync(join(tmpdir(), 'nxnx-remote-'));
process.env.NX_NX_HOME = HOME;

const { readServeInfo, writeServeInfo, clearServeInfo, remoteSpaceAction } = await import(
  '../../src/core/service/space-remote.js'
);

test('没有 serve 落点信息时：不转发（调用方退回本地空间）', async () => {
  clearServeInfo();
  assert.equal(readServeInfo(), null);
  const r = await remoteSpaceAction('demo-group', 'introspect');
  assert.equal(r, null, '没有 serve 就不该发远端请求');
});

test('落点信息写盘后可读回；清掉后读不到', () => {
  writeServeInfo({ port: 7899, pid: 1234, startedAt: 1 });
  const info = readServeInfo();
  assert.equal(info?.port, 7899);
  assert.equal(info?.pid, 1234);
  clearServeInfo();
  assert.equal(readServeInfo(), null);
});

test('serve 在跑时：空间动作真的转给了它（拿到的是它的结果）', async () => {
  // 起一个最小的 HTTP 服务冒充 serve：只实现空间路由
  const { createServer } = await import('node:http');
  const server = createServer((req, res) => {
    const body = {
      ok: true,
      data: { ok: true, action: 'introspect', methods: [{ name: 'ping', arity: 0, async: false }] },
    };
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(body));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  writeServeInfo({ port, pid: process.pid });
  try {
    const r = await remoteSpaceAction('demo-group', 'introspect');
    assert.ok(r, '应当拿到 serve 的结果');
    assert.equal(r?.ok, true);
    assert.equal(r?.methods?.[0]?.name, 'ping');
  } finally {
    clearServeInfo();
    server.close();
  }
});

test('serve 不可达时：退回本地（返回 null，不抛错）', async () => {
  // 指向一个没人监听的端口
  writeServeInfo({ port: 1, pid: 999999 });
  const r = await remoteSpaceAction('demo-group', 'introspect');
  assert.equal(r, null, '连不上就退回本地，不该把命令搞挂');
  clearServeInfo();
});

test('目标是本机 serve 自己时：不转发（防回环）', async () => {
  const prev = process.env.NX_NX_SERVE_PORT;
  writeServeInfo({ port: 7899 });
  process.env.NX_NX_SERVE_PORT = '7899';
  try {
    const r = await remoteSpaceAction('demo-group', 'introspect');
    assert.equal(r, null, 'serve 进程内不该把请求转给自己');
  } finally {
    if (prev === undefined) delete process.env.NX_NX_SERVE_PORT;
    else process.env.NX_NX_SERVE_PORT = prev;
    clearServeInfo();
    rmSync(HOME, { recursive: true, force: true });
  }
});
