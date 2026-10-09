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
const BIN = join(ROOT, 'bin', 'nx-nx.mjs');

function run(cmdline, env = {}, cwd = tmpdir()) {
  // execFile 不走 shell，必须把命令串拆成 token 数组——
  // 整串塞进去会被当成一个 argv 元素，CLI 侧报「未知命令」。
  return exec(process.execPath, [BIN, ...cmdline.split(' ').filter(Boolean)], {
    cwd,
    env: { ...process.env, ...env },
  });
}

test('version 输出裸版本号（可被 V=$(nx-nx version) 消费）', async () => {
  const { stdout } = await run('version');
  assert.match(stdout.trim(), /^\d+\.\d+\.\d+$/);
});

test('routes: 命令表含全部模板命令且带 HTTP 对照', async () => {
  const { stdout } = await run('routes --json');
  const r = JSON.parse(stdout);
  assert.ok(r.count >= 8, `至少 8 条命令，实际 ${r.count}`);
  const ids = r.routes.map((x) => x.id);
  for (const id of ['template.list', 'template.create', 'system.health']) {
    assert.ok(ids.includes(id), `缺命令 ${id}`);
  }
});

test('template list --json：至少一个模板，零错误', async () => {
  const { stdout } = await run('template list --json');
  const r = JSON.parse(stdout);
  assert.ok(r.templates.length >= 1);
  assert.deepEqual(r.errors, []);
});

test('skill list + install：含主 skill 与 nx-dev，可装到指定目录', async () => {
  const { stdout } = await run('skill list --json');
  const r = JSON.parse(stdout);
  for (const n of ['nx-nx', 'nx-dev']) assert.ok(r.skills.includes(n), `缺 skill ${n}`);
  assert.equal(r.defaultGroup, 'nx-nx');

  // nx-dev 的 preInstall 只允许在 nx-nx 仓库根安装 → cwd 传 ROOT
  const dir = mkdtempSync(join(tmpdir(), 'nxnx-skill-'));
  const { stdout: out2 } = await run(`skill install nx-dev --to ${dir} --json`, {}, ROOT);
  const i = JSON.parse(out2);
  assert.equal(i.status, 'ok');
  assert.ok(i.files >= 1);
});

test('nx-dev 在非仓库目录安装被 preInstall 拒绝', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'nxnx-block-'));
  await assert.rejects(
    () => run(`skill install nx-dev --to ${dir} --json`, {}, dir),
    (err) => {
      // --json：错误负载走 stdout，exit 1
      const payload = JSON.parse(err.stdout);
      assert.equal(payload.ok, false);
      assert.match(payload.error, /只能在 nx-nx 仓库/);
      return true;
    }
  );
});

test('template create --dry-run：预览不落盘', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'nxnx-smoke-'));
  const { stdout } = await run(
    `template create server-cli-web --letters qq --dir ${dir}/out --dry-run --json`
  );
  const r = JSON.parse(stdout);
  assert.ok(r.count >= 20, `应预览 20+ 文件，实际 ${r.count}`);
  assert.equal(r.dryRun, true);
  assert.equal(r.vars.name, 'nx-qq');
});

test('非法字母被拒且 exit 1', async () => {
  await assert.rejects(
    () => run('template create server-cli-web --letters AB1'),
    (err) => {
      assert.match(err.stderr, /1~5 位小写字母/);
      return true;
    }
  );
});

test('未知模板报可用列表（帮助迷路的人）', async () => {
  await assert.rejects(
    () => run('template create no-such --letters qq'),
    (err) => {
      assert.match(err.stderr, /可用:/);
      return true;
    }
  );
});
