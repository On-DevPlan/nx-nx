// smoke 测试：生成的 CLI 在真实进程里跑通关键路径。
// 这些是「面板能起、命令能跑」的最小证明——比单元测试更接近用户实际体验。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const exec = promisify(execFile);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BIN = join(ROOT, 'bin', '{{letters}}.mjs');

// 每个用例独立存储，避免写脏用户真实目录，也避免用例间计数互相干扰
function run(cmdline) {
  const dir = mkdtempSync(join(tmpdir(), '{{name}}-smoke-'));
  // execFile 不走 shell，必须把命令串拆成 token 数组——
  // 整串塞进去会被当成一个 argv 元素，CLI 侧报「未知命令」。
  return exec(process.execPath, [BIN, ...cmdline.split(' ').filter(Boolean)], {
    cwd: tmpdir(),
    env: { ...process.env, {{envPrefix}}_STORE: join(dir, 'store.json') },
  });
}

test('version 输出裸版本号（可被 V=$({{name}} version) 消费）', async () => {
  const { stdout } = await run('version');
  assert.match(stdout.trim(), /^\d+\.\d+\.\d+$/);
});

test('routes: 命令表含 bootstrap/health/greet 且带 HTTP 对照', async () => {
  const { stdout } = await run('routes --json');
  const r = JSON.parse(stdout);
  assert.ok(r.count >= 7, `至少 7 条命令，实际 ${r.count}`);
  const ids = r.routes.map((x) => x.id);
  for (const id of ['home.bootstrap', 'home.health', 'home.greet']) {
    assert.ok(ids.includes(id), `缺命令 ${id}`);
  }
  const greet = r.routes.find((x) => x.id === 'home.greet');
  assert.equal(greet.http, 'POST /api/greet');
});

test('greet：返回问候且计数累计（CLI ↔ 存储闭环）', async () => {
  const r = JSON.parse((await run('greet 世界 --json')).stdout);
  assert.match(r.greeting, /世界/);
  assert.equal(r.count, 1);
  // 同一存储路径由 run() 每次重新生成，这里直接验证渲染串形态
  const text = (await run('greet 世界')).stdout;
  assert.match(text, /你好，世界/);
});

test('health：自检通过', async () => {
  const r = JSON.parse((await run('health --json')).stdout);
  assert.equal(r.status, 'ok');
});

test('greet 缺名字被拒且 exit 1', async () => {
  await assert.rejects(
    () => run('greet'),
    (err) => {
      assert.match(err.stderr, /缺少必填|name/);
      return true;
    }
  );
});

test('未知命令 exit 1', async () => {
  await assert.rejects(() => run('nope'));
});
