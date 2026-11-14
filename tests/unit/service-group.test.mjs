// 服务组「长脚本闭环」的单元测试：关闭策略（stopMode）+ 自愈开关 + 探活口径。
//
// 这三条是长脚本日常操作的全部：启动 / 关闭 / 是否自愈。
// 启动与闸门在 service-gate.test.mjs 里钉过，这里钉「关闭怎么关」与「自愈开不开」。
//
// 数据隔离：NX_NX_HOME 把服务组目录搬到临时目录，绝不碰用户真实的 ~/.nx-nx。
// （必须在 import core 模块**之前**设好——路径在模块加载时就求值了。）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const HOME = mkdtempSync(join(tmpdir(), 'nxnx-sg-'));
process.env.NX_NX_HOME = HOME;

const { normalizeGroup, saveGroups, loadGroups } = await import('../../src/core/service/store.js');
const { setAutoHeal, stopGroup } = await import('../../src/core/service/runtime.js');
const { resolveStopMode, stopPortOf, portBusy } = await import('../../src/core/service/stop.js');
const { probePort, checkHealth } = await import('../../src/core/service/check.js');

// ---- 小工具 ----

function freePort() {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

async function waitPort(port, open, timeoutMs = 8000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if ((await portBusy(port)) === open) return true;
    await new Promise((r) => setTimeout(r, 100));
  }
  return false;
}

// 起一个只监听端口的真进程（模拟「主脚本」），返回它的子进程句柄
function spawnListener(port) {
  const code = `require('node:net').createServer((c)=>c.end()).listen(${port}, '127.0.0.1')`;
  const child = spawn(process.execPath, ['-e', code], { detached: true, stdio: 'ignore', windowsHide: true });
  child.unref();
  return child;
}

// ---- 配置模型 ----

test('配置默认值：stopMode=auto，health.readyTimeoutMs=20000', () => {
  const g = normalizeGroup({ name: 'a', health: { kind: 'port', port: 19999 } }, 'a');
  assert.equal(g.stopMode, 'auto');
  assert.equal(g.health.readyTimeoutMs, 20000);
  assert.equal(g.health.onDead, 'restart');
});

test('配置校验：stopMode 非法值直接报错（不静默降级成 auto）', () => {
  assert.throws(() => normalizeGroup({ name: 'a', stopMode: 'killAll' }, 'a'), /stopMode 非法/);
});

test('配置校验：readyTimeoutMs 落在 1s~600s 区间内', () => {
  const g = normalizeGroup({ name: 'a', health: { kind: 'port', port: 19999, readyTimeoutMs: 120000 } }, 'a');
  assert.equal(g.health.readyTimeoutMs, 120000);
  const slow = normalizeGroup({ name: 'b', health: { kind: 'port', port: 19999, readyTimeoutMs: 1 } }, 'b');
  assert.equal(slow.health.readyTimeoutMs, 1000);
});

// ---- 关闭策略 ----

test('resolveStopMode：配置值生效，显式 override 优先，非法 override 报错', () => {
  const g = normalizeGroup({ name: 'a', stopMode: 'port' }, 'a');
  assert.equal(resolveStopMode(g), 'port');
  assert.equal(resolveStopMode(g, 'pid'), 'pid');
  assert.throws(() => resolveStopMode(g, 'nuke'), /--mode 非法/);
});

test('stopPortOf：killPort 优先，否则退回探活端口', () => {
  const a = normalizeGroup({ name: 'a', killPort: 8081, health: { kind: 'http', host: '127.0.0.1', port: 8080 } }, 'a');
  assert.equal(stopPortOf(a), 8081);
  const b = normalizeGroup({ name: 'b', health: { kind: 'http', host: '127.0.0.1', port: 8080 } }, 'b');
  assert.equal(stopPortOf(b), 8080);
  const c = normalizeGroup({ name: 'c' }, 'c');
  assert.equal(stopPortOf(c), undefined);
});

test('mode=port：真的能杀掉占用端口的进程（用户点名的默认选项）', async () => {
  const port = await freePort();
  const child = spawnListener(port);
  try {
    assert.ok(await waitPort(port, true), '测试前置：监听进程没起来');
    saveGroups([normalizeGroup({ name: 'p', killPort: port, stopMode: 'port' }, 'p')]);

    const r = await stopGroup('p', { silent: true });
    assert.equal(r.mode, 'port');
    assert.match(r.detail, new RegExp(`已杀端口 ${port}`));
    assert.ok(await waitPort(port, false), '端口应已释放');

    const runtime = (await import('../../src/core/service/store.js')).loadRuntime('p');
    assert.equal(runtime.status, 'stopped');
  } finally {
    try {
      child.kill('SIGKILL');
    } catch {
      // 已经被 stopGroup 杀掉了
    }
  }
});

test('mode=pid：只认运行态记录的 pid，不误杀端口占用者', async () => {
  const port = await freePort();
  const child = spawnListener(port);
  try {
    assert.ok(await waitPort(port, true), '测试前置：监听进程没起来');
    saveGroups([normalizeGroup({ name: 'q', killPort: port, stopMode: 'pid' }, 'q')]);

    const r = await stopGroup('q', { silent: true });
    assert.equal(r.mode, 'pid');
    assert.match(r.detail, /没有记录 pid/);
    assert.equal(await portBusy(port), true, 'pid 模式不该动端口占用进程');
  } finally {
    try {
      child.kill('SIGKILL');
    } catch {
      // 忽略
    }
  }
});

// ---- 自愈开关 ----

test('自愈开关：on → health.onDead=restart；off → none（配置落盘且监控不停）', () => {
  saveGroups([normalizeGroup({ name: 'h', health: { kind: 'port', port: 19999 } }, 'h')]);

  const off = setAutoHeal('h', false);
  assert.equal(off.autoHeal, false);
  assert.equal(loadGroups()[0].health.onDead, 'none');

  const on = setAutoHeal('h', true);
  assert.equal(on.autoHeal, true);
  assert.equal(loadGroups()[0].health.onDead, 'restart');
});

test('自愈开关：没配探活的组不给开（没有检测就没有自愈）', () => {
  saveGroups([normalizeGroup({ name: 'nohealth' }, 'nohealth')]);
  assert.throws(() => setAutoHeal('nohealth', true), /未配置探活/);
});

// ---- 探活口径 ----

test('探活：端口通=活，进程杀掉后=不活（宽口径，不做业务判断）', async () => {
  const port = await freePort();
  const child = spawnListener(port);
  try {
    assert.ok(await waitPort(port, true), '测试前置：监听进程没起来');
    const p = await probePort(port, '127.0.0.1', 1000);
    assert.equal(p.open, true);

    const alive = await checkHealth({ kind: 'port', port, host: '127.0.0.1', path: '/', intervalMs: 5000, failThreshold: 3, readyTimeoutMs: 20000, onDead: 'restart' });
    assert.equal(alive.alive, true);

    child.kill('SIGKILL');
    assert.ok(await waitPort(port, false), '端口应已释放');
    const dead = await checkHealth({ kind: 'port', port, host: '127.0.0.1', path: '/', intervalMs: 5000, failThreshold: 3, readyTimeoutMs: 20000, onDead: 'restart' });
    assert.equal(dead.alive, false);
    assert.match(dead.detail, /不可连|超时/);
  } finally {
    try {
      child.kill('SIGKILL');
    } catch {
      // 已杀
    }
  }
});
