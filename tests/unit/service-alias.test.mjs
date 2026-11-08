// 服务组别名原语（assets/scripts/lib/service.mjs）的单元测试。
//
// 这里盯的是一个曾经真实发生过的 bug：
//   面板 API 的响应裹了一层 { ok: true, data: <内容> }，
//   而脚本侧直接读 r.json.alive —— 取不到，返回 undefined → serviceAlive 恒为 false。
//   表现是「HTTP 明明 200，脚本却说服务没启动」。
// 所以 payload 剥壳的语义必须有测试守着。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { aliasesPath } from '../../src/core/script/paths.js';

// 起一个假的面板：返回固定 JSON，验证脚本侧怎么解读它。
async function withFakeServe(handler, fn) {
  const dir = mkdtempSync(join(tmpdir(), 'nxnx-svc-'));
  const server = await import('node:http');
  const srv = server.createServer(handler);
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const port = srv.address().port;
  const prev = process.env.NX_NX_SERVE_PORT;
  process.env.NX_NX_SERVE_PORT = String(port);
  try {
    return await fn();
  } finally {
    if (prev === undefined) delete process.env.NX_NX_SERVE_PORT;
    else process.env.NX_NX_SERVE_PORT = prev;
    srv.close();
    rmSync(dir, { recursive: true, force: true });
  }
}

// 面板侧 service.mjs 的依赖是相对 import，直接按路径加载它
const serviceModUrl = pathToFileURL(join(aliasesPath(), '..', 'lib', 'service.mjs')).href;

test('serviceAlive：接口裹了 data 包装层，也要读出 alive=true', async () => {
  await withFakeServe(
    (req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true, data: { id: 'g1', alive: true, detail: 'HTTP 200' } }));
    },
    async () => {
      const mod = await import(serviceModUrl);
      assert.equal(await mod.serviceAlive('g1'), true, '必须能读出 alive');
    },
  );
});

test('serviceCheck：detail 也要穿过 data 包装层', async () => {
  await withFakeServe(
    (req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true, data: { id: 'g1', alive: false, detail: '端口不可连' } }));
    },
    async () => {
      const mod = await import(serviceModUrl);
      const r = await mod.serviceCheck('g1');
      assert.equal(r.alive, false);
      assert.equal(r.detail, '端口不可连');
    },
  );
});

test('serviceStatus：runtime 也要穿过 data 包装层', async () => {
  await withFakeServe(
    (req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true, data: { runtime: { status: 'running', pid: 42 } } }));
    },
    async () => {
      const mod = await import(serviceModUrl);
      const r = await mod.serviceStatus('g1');
      assert.equal(r.status, 'running');
      assert.equal(r.pid, 42);
    },
  );
});

test('serviceStart / serviceStop：结果也要穿过 data 包装层', async () => {
  await withFakeServe(
    (req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true, data: { started: true, pid: 7, logFile: 'x.log' } }));
    },
    async () => {
      const mod = await import(serviceModUrl);
      const r = await mod.serviceStart('g1');
      assert.equal(r.started, true);
      assert.equal(r.pid, 7);
    },
  );
});

test('接口不通时如实返回「不活」，不假装成功', async () => {
  await withFakeServe(
    (req, res) => {
      res.writeHead(500, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: '炸了' }));
    },
    async () => {
      const mod = await import(serviceModUrl);
      assert.equal(await mod.serviceAlive('g1'), false);
    },
  );
});
