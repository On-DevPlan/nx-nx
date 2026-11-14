// 短脚本沙箱的单元测试：真跑子进程（quickjs wasm），测的是契约而不是 mock。
//
// 覆盖四件事：
//   1. 基本执行 + 变量堆（json 化、类型标注）
//   2. 清理语义：Map / 函数不泄露内部结构
//   3. 隔离：沙箱里没有 process / require
//   4. 超时：死循环被中断，而不是挂死调用方
//   5. 脚本三类角色：.short 不能走 Node 通道；沙箱通道允许 .shared 当片段源
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// NX_NX_HOME 必须在 import 前设好（sandbox 的台账路径在模块加载时定型）
const home = mkdtempSync(join(tmpdir(), 'nx-sandbox-test-'));
process.env.NX_NX_HOME = home;

const { runSandbox, recentRuns } = await import('../../src/core/script/sandbox.js');
const { resolveScript } = await import('../../src/core/script/paths.js');

test('沙箱：基本执行 + 变量堆 JSON 化', async () => {
  const r = await runSandbox({
    code: `set("n", 42); set("list", [1,2,3]); log("done")`,
  });
  assert.equal(r.ok, true, r.error ?? '');
  const keys = Object.fromEntries(r.heap.map((h) => [h.key, h]));
  assert.equal(keys['n'].json, 42);
  assert.equal(keys['n'].type, 'number');
  assert.deepEqual(keys['list'].json, [1, 2, 3]);
  assert.deepEqual(r.logs, ['done']);
});

test('沙箱：Map / 函数只报类型，不泄露内部结构', async () => {
  const r = await runSandbox({
    code: `set("m", new Map([["secret","x"]])); set("f", function hidden(){})`,
  });
  assert.equal(r.ok, true);
  const keys = Object.fromEntries(r.heap.map((h) => [h.key, h]));
  assert.equal(keys['m'].type, 'Map');
  assert.ok(keys['m'].describe.includes('已清理'), keys['m'].describe);
  assert.equal(keys['m'].json, null);
  assert.equal(keys['f'].type, 'function');
  assert.ok(!JSON.stringify(keys).includes('secret'));
});

test('沙箱：没有 process / require（隔离生效）', async () => {
  const r = await runSandbox({ code: `set("p", typeof process); set("rq", typeof require)` });
  assert.equal(r.ok, true);
  const vals = Object.fromEntries(r.heap.map((h) => [h.key, h.json]));
  assert.equal(vals['p'], 'undefined');
  assert.equal(vals['rq'], 'undefined');
});

test('沙箱：死循环被中断并回报错误（不挂死）', async () => {
  const r = await runSandbox({ code: `while(true){}`, timeoutMs: 600 });
  assert.equal(r.ok, false);
  assert.ok(r.error, '应有错误信息');
  assert.ok(r.durationMs < 10000, `不应等到进程级超时（实际 ${r.durationMs}ms）`);
});

test('沙箱：代码抛错 → ok:false，错误进台账', async () => {
  const r = await runSandbox({ code: `throw new Error("boom")` });
  assert.equal(r.ok, false);
  assert.ok(r.error?.includes('boom'), r.error ?? '');
  const runs = recentRuns(5);
  assert.ok(runs.length >= 1);
  assert.equal(runs[0].ok, false);
  assert.ok(runs[0].error?.includes('boom'));
});

test('沙箱：共享面板函数经 call() 可用，async 函数被明确拒绝', async () => {
  // demo.shared 在包内 assets/scripts/ 下
  const sync = await runSandbox({
    code: `const u = call("makeUsers", 2); set("count", u.length)`,
    panel: 'demo.shared',
  });
  assert.equal(sync.ok, true, sync.error ?? '');
  assert.equal(sync.heap[0].json, 2);

  const asyncCase = await runSandbox({ code: `call("checkUp")`, panel: 'demo.shared' });
  assert.equal(asyncCase.ok, false);
  assert.ok(asyncCase.error?.includes('async'), asyncCase.error ?? '');
});

test('脚本三类角色：.short 走不了 Node 通道，.shared 同理', () => {
  assert.throws(() => resolveScript('demo-batch.short'), /沙箱/);
  assert.throws(() => resolveScript('demo.shared'), /共享函数面板/);
});

test('沙箱：片段文件名可省略 .short 后缀', async () => {
  const r = await runSandbox({ name: 'demo-batch', panel: 'demo.shared', args: [2], timeoutMs: 15000 });
  assert.equal(r.ok, true, r.error ?? '');
  const keys = Object.fromEntries(r.heap.map((h) => [h.key, h]));
  assert.equal(keys['count'].json, 2);
});

test('收尾：清掉临时 home', () => {
  rmSync(home, { recursive: true, force: true });
  assert.ok(true);
});
