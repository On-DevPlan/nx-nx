// 服务组「空间闸门」的单元测试：执行 server 之前必须先过空间 check。
//
// 这条不变量很容易被改坏：
//   闸门曾经只挂在流水线上（sg run），而 `sg start` 与面板「启动」按钮直连 startGroup
//   —— 于是同一个组，点「跑流水线」会因 check 失败不启动，点「启动」却照样拉起进程白占端口。
//   所以测试要盯住**两扇门都过闸门**，以及不过时确实不启动。
//
// 数据隔离：NX_NX_HOME 把整个服务组目录搬到临时目录，绝不碰用户真实的 ~/.nx-nx。
// （必须在 import core 模块**之前**设好——路径在模块加载时就求值了。）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const HOME = mkdtempSync(join(tmpdir(), 'nxnx-gate-'));
process.env.NX_NX_HOME = HOME;

const { normalizeGroup, saveGroups, loadRuntime } = await import('../../src/core/service/store.js');
const { spaceGate, startGroup, stopGroup } = await import('../../src/core/service/runtime.js');

function tmpPanel(body) {
  const dir = mkdtempSync(join(tmpdir(), 'nxnx-gate-panel-'));
  const file = join(dir, 'gate.shared.mjs');
  writeFileSync(file, body, { encoding: 'utf8' });
  return { dir, file };
}

// 面板：checkUp 返回 true，alwaysDown 返回 false
const PANEL_BODY = [
  'globalThis.checkUp = async function checkUp() { return true; };',
  'globalThis.alwaysDown = async function alwaysDown() { return false; };',
].join('\n');

test('闸门：check 返回 true → 放行', async () => {
  const { dir, file } = tmpPanel(PANEL_BODY);
  try {
    const g = normalizeGroup(
      { name: 'x', space: { panel: file, check: 'checkUp' } },
      'g1',
    );
    const gate = await spaceGate(g);
    assert.ok(gate, '配了 space 就该有闸门');
    assert.equal(gate.alive, true, gate.detail);
    assert.equal(gate.method, 'checkUp');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('闸门：check 返回 false → 不放行，且给出人话原因', async () => {
  const { dir, file } = tmpPanel(PANEL_BODY);
  try {
    const g = normalizeGroup({ name: 'x', space: { panel: file, check: 'alwaysDown' } }, 'g2');
    const gate = await spaceGate(g);
    assert.equal(gate.alive, false);
    assert.match(gate.detail, /alwaysDown/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('闸门：check 方法不存在 → 不放行，并列出可用方法', async () => {
  const { dir, file } = tmpPanel(PANEL_BODY);
  try {
    const g = normalizeGroup({ name: 'x', space: { panel: file, check: 'noSuchMethod' } }, 'g3');
    const gate = await spaceGate(g);
    assert.equal(gate.alive, false);
    assert.match(gate.detail, /noSuchMethod/);
    // 报错要让人知道能用什么
    assert.match(gate.detail, /checkUp|alwaysDown/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('闸门：面板文件不存在 → 不放行（而不是崩掉）', async () => {
  const g = normalizeGroup(
    { name: 'x', space: { panel: join(tmpdir(), 'no-such-panel-xyz.shared.mjs'), check: 'checkUp' } },
    'g4',
  );
  const gate = await spaceGate(g);
  assert.ok(gate);
  assert.equal(gate.alive, false);
  assert.match(gate.detail, /不存在/);
});

test('闸门：没配 space → 没有闸门（不拦、不多起进程）', async () => {
  const g = normalizeGroup({ name: 'x' }, 'g5');
  assert.equal(await spaceGate(g), null);
});

test('闸门：startGroup 在 check 不过时不启动主脚本（不产生 pid）', async () => {
  const { dir, file } = tmpPanel(PANEL_BODY);
  try {
    const g = normalizeGroup(
      {
        name: '闸门组',
        main: { script: 'demo-server', args: ['--port', '18997'] },
        space: { panel: file, check: 'alwaysDown' },
      },
      'gate-block',
    );
    saveGroups([g]);
    const r = await startGroup('gate-block');
    assert.equal(r.started, false, 'check 不过就不该启动');
    assert.match(r.detail, /空间 check 未通过/);
    assert.match(r.detail, /alwaysDown/);
    // 运行态里没有 pid —— 确实没起进程
    const rt = loadRuntime('gate-block');
    assert.equal(rt.pid, undefined);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('闸门：skipGate 用于自愈重启（恢复动作不被业务闸门拦死）', async () => {
  const { dir, file } = tmpPanel(PANEL_BODY);
  try {
    const g = normalizeGroup(
      {
        name: '闸门组',
        main: { script: 'demo-server', args: ['--port', '18996'] },
        space: { panel: file, check: 'alwaysDown' },
      },
      'gate-skip',
    );
    saveGroups([g]);
    const r = await startGroup('gate-skip', { skipGate: true });
    // 跳过闸门就会真去启动 —— 这次启动的是真的 demo-server，用完立刻停掉
    assert.equal(r.started, true, r.detail);
    stopGroup('gate-skip', { silent: true });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test.after(() => {
  rmSync(HOME, { recursive: true, force: true });
  delete process.env.NX_NX_HOME;
});

test('client 执行记录：落盘后能看到脚本名 / 退出码 / 耗时 / 输出', async () => {
  const { groupLogs, appendClientRecord } = await import('../../src/core/service/logs.js');
  appendClientRecord('log-group', {
    script: 'demo-client',
    code: 0,
    ms: 42,
    stdout: '服务组活性 OK',
    stderr: '',
  });
  appendClientRecord('log-group', {
    script: 'bad-client',
    code: 1,
    ms: 7,
    stdout: '',
    stderr: '连接被拒绝',
  });
  const logs = groupLogs('log-group');
  assert.ok(logs.clients.includes('demo-client'), '应记下脚本名');
  assert.ok(logs.clients.includes('退出码 0'), '应记下退出码');
  assert.ok(logs.clients.includes('42ms'), '应记下耗时');
  assert.ok(logs.clients.includes('服务组活性 OK'), '应记下 stdout');
  // 失败的 client 也要留痕，并且能看出是失败的
  assert.ok(logs.clients.includes('bad-client'));
  assert.ok(logs.clients.includes('FAIL'));
  assert.ok(logs.clients.includes('连接被拒绝'), '应记下 stderr');
});
