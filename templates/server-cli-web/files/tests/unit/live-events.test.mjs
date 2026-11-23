// 变更通知标准（events/SSE）与 CLI 别名的行为测试。
//
// store → publish → SSE 帧这条链路用真 HTTP 服务器收帧验证（不是 mock：
// 帧格式、心跳清理、断开语义只有真连接才测得出来）。测试把 STORE 指到临时
// 文件，绝不碰用户真实数据。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const DIR = mkdtempSync(join(tmpdir(), 'scw-live-'));
process.env.{{envPrefix}}_STORE = join(DIR, 'store.json');

test('store 写入即广播：save/mutate 成功落盘后 publish(topic)', async () => {
  const { subscribe } = await import('../../src/core/events.ts');
  const { JsonStore } = await import('../../src/core/store.ts');

  const got = [];
  const off = subscribe((topic) => got.push(topic));
  const store = new JsonStore();
  const p = join(DIR, 't1.json');

  await store.save({ version: 1, settings: { theme: 'light' } }, p, 'settings');
  await store.mutate((s) => { s.version = 2; }, p, 'store');
  off();
  assert.deepEqual(got, ['settings', 'store']);

  // fn 抛错不落盘也不广播
  await assert.rejects(() => store.mutate(() => { throw new Error('boom'); }, p));
  assert.equal(got.length, 2);
});

test('每条 CLI 路径（含别名）都能被运行器解析回它自己', async () => {
  const { registry } = await import('../../src/runtime/registry.ts');
  const { resolveCommand } = await import('../../src/runtime/cli.ts');
  const { cliPathsOf } = await import('../../src/runtime/spec.ts');

  for (const a of registry.actions) {
    for (const path of cliPathsOf(a)) {
      const hit = resolveCommand(registry.actions, path);
      assert.ok(hit, `${path.join(' ')} 解析不到命令`);
      assert.equal(hit.cmd.id, a.id, `别名 ${path.join(' ')} 被抢：解析到 ${hit.cmd.id}`);
      assert.deepEqual(hit.rest, []);
    }
  }
  // events 的别名是双路径声明的首个使用方
  const events = registry.actions.find((a) => a.id === 'events');
  assert.ok(events, 'events action 未注册');
  assert.deepEqual(
    (await import('../../src/runtime/spec.ts')).cliPathsOf(events),
    [['events'], ['watch']],
  );
});

test('SSE：连接帧 + 写入推送 changed 帧 + 断开清理', async () => {
  const { startServer } = await import('../../src/runtime/server.ts');
  const { subscriberCount } = await import('../../src/core/events.ts');

  const server = await startServer({ port: 0, host: '127.0.0.1' });
  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;
  const base = `http://127.0.0.1:${port}`;

  try {
    const res = await fetch(base + '/api/events', { headers: { accept: 'text/event-stream' } });
    assert.equal(res.status, 200);
    assert.ok(res.headers.get('content-type').includes('text/event-stream'));
    const reader = res.body.getReader();
    const dec = new TextDecoder();

    // 读到 connected 为止（首两帧：retry 提示 + 连接注释）
    let buf = '';
    while (!buf.includes(': connected')) {
      const { value, done } = await reader.read();
      assert.ok(!done, '连接被提前关闭');
      buf += dec.decode(value);
    }
    assert.ok(buf.includes('retry: 3000'), '缺断线重连提示帧');

    // 订阅挂上了（SSE 连接 = 一个总线订阅者）
    assert.ok(subscriberCount() >= 1, 'SSE 连接没有挂上总线订阅');

    // 触发一次写入 → changed 帧
    const r2 = await fetch(base + '/api/settings', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ set: { theme: 'dark' } }),
    });
    assert.equal(r2.status, 200);

    let sse = buf;
    const deadline = Date.now() + 5000;
    while (!sse.includes('event: changed') && Date.now() < deadline) {
      const { value, done } = await reader.read();
      if (done) break;
      sse += dec.decode(value);
    }
    assert.ok(sse.includes('event: changed'), '没收到 changed 帧');
    assert.ok(sse.includes(`data: ${JSON.stringify({ topic: 'store' })}`), 'changed 帧的 topic 不对');

    // 断开 → 清理订阅
    const before = subscriberCount();
    await reader.cancel();
    await new Promise((r) => setTimeout(r, 200));
    assert.ok(subscriberCount() < before, '断开后订阅没有清理');
  } finally {
    server.close();
    rmSync(DIR, { recursive: true, force: true });
  }
});
