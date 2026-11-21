// 服务组模板的单元测试：模板清单 → 生成计划 → 落盘 → 真起一个服务。
//
// 最后一条是端到端：模板生成的脚本必须真的能跑（/ping 返回 pong），
// 否则「有模板但跑不起来」比没有模板更糟。
//
// 数据隔离：NX_NX_HOME 搬走服务组目录，NX_NX_SCRIPTS 换成临时脚本目录
// （先把 assets/scripts 整份复制过去，runner 与别名模块才会在）。
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import net from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const BASE = mkdtempSync(join(tmpdir(), 'nxnx-tpl-'));
const SCRIPTS = join(BASE, 'scripts');
cpSync(join(ROOT, 'assets', 'scripts'), SCRIPTS, { recursive: true });
process.env.NX_NX_HOME = join(BASE, 'home');
process.env.NX_NX_SCRIPTS = SCRIPTS;

const { listTemplates, getTemplate, planTemplate, applyTemplate, templatesRoot } = await import(
  '../../src/core/service/templates.js'
);
const { loadGroups, saveGroups, loadRuntime } = await import('../../src/core/service/store.js');
const { startGroup, stopGroup } = await import('../../src/core/service/runtime.js');
const { runPipeline } = await import('../../src/core/service/pipeline.js');

after(() => {
  rmSync(BASE, { recursive: true, force: true });
});

function freePort() {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

async function waitPing(port, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/ping`);
      if (r.ok && (await r.text()).trim() === 'pong') return true;
    } catch {
      // 端口还没起：继续等
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  return false;
}

// ---- 清单与计划 ----

test('模板清单：node-ping 是默认模板，带端口与下一步命令', () => {
  const list = listTemplates();
  assert.ok(list.length >= 2, '至少应有 node-ping / node-api');
  const ping = list.find((t) => t.id === 'node-ping');
  assert.ok(ping);
  assert.equal(ping.defaultPort, 18080);
  assert.equal(ping.level, 'case');
  assert.ok(ping.steps.some((s) => s.includes('sg run {id}')));
  // 默认模板：不传 template 时 getTemplate 返回 node-ping
  assert.equal(getTemplate().id, 'node-ping');
});

test('模板正文目录存在（随包分发，缺文件时明确报错）', () => {
  assert.ok(existsSync(join(templatesRoot(), 'node-ping', 'server.mjs.tpl')));
  assert.ok(existsSync(join(templatesRoot(), 'node-api', 'stop.mjs.tpl')));
});

test('planTemplate：脚本名、端口、health、shared/space/clients 都按组 id 生成', () => {
  const plan = planTemplate({ groupId: 'demo-svc', templateId: 'node-ping', port: 18123 });
  assert.deepEqual(
    plan.files.map((f) => f.name),
    ['demo-svc-server', 'demo-svc-client', 'demo-svc.shared'],
  );
  assert.equal(plan.config.main?.script, 'demo-svc-server');
  assert.deepEqual(plan.config.main?.args, ['--port', '18123']);
  assert.equal(plan.config.health?.port, 18123);
  assert.equal(plan.config.health?.path, '/ping');
  assert.equal(plan.config.health?.onDead, 'restart');
  assert.equal(plan.config.killPort, 18123);
  assert.equal(plan.config.shared, 'demo-svc.shared');
  assert.deepEqual(plan.config.space, { panel: 'demo-svc.shared', check: 'checkUp' });
  assert.deepEqual(plan.config.clients, ['demo-svc-client']);
  assert.equal(plan.config.stopMode, 'auto');
  // 启动版本：端口 / 环境 / 配置文件三个可填参数 + 三套预设。
  assert.deepEqual(
    plan.config.launch?.params.map((p) => p.key),
    ['port', 'env', 'config'],
  );
  assert.equal(plan.config.launch?.params[0]?.default, '18123');
  assert.deepEqual(plan.config.launch?.params[1]?.options, ['development', 'staging', 'production']);
  assert.deepEqual(
    plan.config.launch?.profiles?.map((p) => p.name),
    ['默认', '预发', '生产'],
  );
  assert.equal(plan.config.launch?.profiles?.[1]?.values.port, '18124');
  assert.equal(plan.config.name, 'Ping 服务');
  assert.match(plan.config.desc ?? '', /Node HTTP/);
  assert.match(plan.config.cwd ?? '', /services[\\/]groups[\\/]demo-svc$/);
});

test('planTemplate：未知模板报可用列表，非法端口直接拒绝', () => {
  assert.throws(() => getTemplate('no-such'), /未知服务组模板/);
  assert.throws(() => planTemplate({ groupId: 'x', port: 70000 }), /端口非法/);
  assert.throws(() => planTemplate({ groupId: 'Bad_Id' }), /非法服务组 id/);
});

test('node-api 模板：带停服脚本，健康路径 /health', () => {
  const plan = planTemplate({ groupId: 'api-svc', templateId: 'node-api' });
  assert.equal(plan.port, 18081);
  assert.equal(plan.config.health?.path, '/health');
  assert.equal(plan.config.stop?.script, 'api-svc-stop');
  assert.equal(plan.files.find((f) => f.role === 'shared')?.name, 'api-svc.shared');
});

// ---- 落盘 ----

test('applyTemplate：脚本落盘、manifest 登记说明、组配置写入', () => {
  const r = applyTemplate({ groupId: 'write-svc', templateId: 'node-ping', port: 18124 });
  assert.equal(r.written.length, 3);
  const server = readFileSync(join(SCRIPTS, 'write-svc-server.mjs'), 'utf8');
  assert.match(server, /\/ping/);
  assert.match(server, /pong/);
  const config = loadGroups().find((g) => g.id === 'write-svc');
  assert.ok(config, '组配置应已写入');
  assert.equal(config.health?.port, 18124);
  assert.ok(config.cwd && existsSync(config.cwd), '服务自己的 cwd 应在创建时就建好');
  const manifest = JSON.parse(readFileSync(join(SCRIPTS, 'manifest.json'), 'utf8'));
  const entry = manifest.scripts.find((s) => s.name === 'write-svc-server');
  assert.ok(entry && entry.description.includes('/ping'), 'manifest 应登记脚本说明');
});

test('applyTemplate 幂等：同名组已存在时报错；删掉配置后重跑只跳过相同脚本', () => {
  assert.throws(() => applyTemplate({ groupId: 'write-svc' }), /已存在/);
  // 模拟「配置丢了、脚本还在」：不应重复覆盖，全部跳过
  saveGroups(loadGroups().filter((g) => g.id !== 'write-svc'));
  const again = applyTemplate({ groupId: 'write-svc', port: 18124 });
  assert.deepEqual(again.skipped, ['write-svc-server', 'write-svc-client', 'write-svc.shared']);
  assert.equal(again.written.length, 0);
});

test('applyTemplate --force：覆盖同名组与已存在的脚本', () => {
  const r = applyTemplate({ groupId: 'write-svc', port: 18125, force: true, templateId: 'node-ping' });
  // server / shared 含端口占位 → 覆盖；client 只引用 BASE_URL，内容不变 → 跳过
  assert.deepEqual(r.written, ['write-svc-server', 'write-svc.shared']);
  assert.deepEqual(r.skipped, ['write-svc-client']);
  const config = loadGroups().find((g) => g.id === 'write-svc');
  assert.equal(config.health?.port, 18125);
});

test('applyTemplate --dry：只出计划，不落盘、不写配置', () => {
  const before = loadGroups().length;
  const r = applyTemplate({ groupId: 'dry-svc', dryRun: true });
  assert.equal(existsSync(join(SCRIPTS, 'dry-svc-server.mjs')), false);
  assert.equal(loadGroups().length, before);
  assert.deepEqual(r.conflicts, []);
});

// ---- 端到端：模板生成的脚本真的能跑 ----

test('多版本启动：values 改端口 → argv / 探活 / 停止都跟着新端口', async () => {
  const base = await freePort();
  const alt = await freePort();
  process.env.NX_NX_SERVE_PORT = String(await freePort());
  applyTemplate({ groupId: 'ping-ver', port: base, templateId: 'node-ping', force: true });

  const started = await startGroup('ping-ver', { values: { port: String(alt), env: 'staging', config: 'config/staging.json' } });
  try {
    assert.ok(await waitPing(alt), '指定端口没有起来');
    const rt = loadRuntime('ping-ver');
    assert.equal(rt.launch?.port, String(alt));
    await assert.rejects(() => fetch(`http://127.0.0.1:${base}/ping`), '旧端口不应被监听');
    const health = await (await fetch(`http://127.0.0.1:${alt}/health`)).json();
    assert.equal(health.ok, true);
  } finally {
    const stopped = await stopGroup('ping-ver', { mode: 'port', silent: true });
    assert.match(stopped.detail, /已杀端口/);
    await new Promise((r) => setTimeout(r, 300));
    await assert.rejects(() => fetch(`http://127.0.0.1:${alt}/ping`));
    if (started.logFile && existsSync(started.logFile)) {
      assert.match(readFileSync(started.logFile, 'utf8'), /已就绪/);
    }
  }
});

test('一键测试组：runPipeline(values) 用新端口跑 client，执行记录落盘', async () => {
  const base = await freePort();
  const alt = await freePort();
  process.env.NX_NX_SERVE_PORT = String(await freePort());
  applyTemplate({ groupId: 'ping-wf', port: base, templateId: 'node-ping', force: true });

  const rep = await runPipeline('ping-wf', { port: String(alt), env: 'staging', config: 'config/staging.json' });
  try {
    assert.equal(rep.ok, true, rep.steps.map((s) => `${s.step}:${s.ok}:${s.detail}`).join('\n'));
    const clientStep = rep.steps.find((s) => s.step === 'client');
    assert.ok(clientStep?.ok, 'client 步骤应执行成功');
    assert.match(clientStep?.detail ?? '', /pong/);
    assert.ok(await waitPing(alt), '测试组应在 values 指定的端口上运行服务');
    await assert.rejects(() => fetch(`http://127.0.0.1:${base}/ping`), '旧端口不应被监听');
    const clientsLog = readFileSync(join(BASE, 'home', '.nx-nx', 'services', 'logs', 'clients-ping-wf.log'), 'utf8');
    assert.match(clientsLog, /ping-wf-client/);
  } finally {
    await stopGroup('ping-wf', { mode: 'port', silent: true });
    await new Promise((r) => setTimeout(r, 300));
    await assert.rejects(() => fetch(`http://127.0.0.1:${alt}/ping`));
  }
});

test('端到端：模板起的 ping 服务能探活、能关闭', async () => {
  const port = await freePort();
  // 闸门里的 serviceCheck 走 serve 端口：指到一个没人监听的端口，ECONNREFUSED 快速返回
  process.env.NX_NX_SERVE_PORT = String(await freePort());
  const created = applyTemplate({ groupId: 'ping-e2e', port, templateId: 'node-ping', force: true });
  assert.equal(created.config.health?.port, port);

  const started = await startGroup('ping-e2e');
  try {
    assert.ok(await waitPing(port), '模板生成的服务没有在端口上返回 pong');
    const health = await (await fetch(`http://127.0.0.1:${port}/health`)).json();
    assert.equal(health.ok, true);
  } finally {
    const stopped = await stopGroup('ping-e2e', { mode: 'port', silent: true });
    assert.match(stopped.detail, /已杀端口/);
    await new Promise((r) => setTimeout(r, 300));
    await assert.rejects(() => fetch(`http://127.0.0.1:${port}/ping`));
    if (started.logFile && existsSync(started.logFile)) {
      // 日志里应有启动行（验证 IO 重定向真的生效）
      assert.match(readFileSync(started.logFile, 'utf8'), /已就绪/);
    }
  }
});
