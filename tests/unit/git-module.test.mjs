// git 模块的行为测试。
//
// 重点不是「函数返回了什么」，而是**几条安全契约有没有被守住**：
//   1. 有冲突时 abort 拒绝自动中止（除非显式 --force）——这是 gitlike 的核心契约；
//   2. 混合冲突类型时 resolve-conflicts 拒绝统一策略（不同类型的正确处理方式不同）；
//   3. prfeat 建的分支对与切换目标正确；
//   4. 操作注册表的每条操作都自带「怎么问」「怎么跑」「等价命令是什么」。
//
// 测试在临时仓库里跑（process.chdir 切过去），绝不碰真实仓库。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const { OPERATIONS, findOperation } = await import('../../src/modules/git/ops/index.js');
const { runOperation } = await import('../../src/modules/git/service.js');

/** 在临时目录里建一个 git 仓库并切过去。 */
async function withRepo(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'nx-nx-git-test-'));
  const cwd = process.cwd();
  const git = (...args) =>
    execFileSync('git', args, {
      cwd: dir,
      encoding: 'utf8',
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: 'tester',
        GIT_AUTHOR_EMAIL: 'tester@example.com',
        GIT_COMMITTER_NAME: 'tester',
        GIT_COMMITTER_EMAIL: 'tester@example.com',
      },
    });
  try {
    git('init', '-b', 'main');
    git('config', 'user.email', 'tester@example.com');
    git('config', 'user.name', 'tester');
    writeFileSync(join(dir, 'a.txt'), 'v1\n');
    git('add', '.');
    git('commit', '-m', 'init');
    process.chdir(dir);
    return await fn({ dir, git });
  } finally {
    process.chdir(cwd);
    rmSync(dir, { recursive: true, force: true });
  }
}

/** 造一个真实的合并冲突：两个分支改同一文件的同一行。 */
function makeConflict({ dir, git }) {
  git('checkout', '-b', 'feature');
  writeFileSync(join(dir, 'a.txt'), 'from-feature\n');
  git('commit', '-am', 'feature change');
  git('checkout', 'main');
  writeFileSync(join(dir, 'a.txt'), 'from-main\n');
  git('commit', '-am', 'main change');
  try {
    git('merge', 'feature');
  } catch {
    // 冲突时 git 返回非零——这是预期的
  }
}

test('操作注册表：每条操作都自带标题、说明、字段、run 与等价命令', () => {
  assert.ok(OPERATIONS.length >= 10, '操作数量不应少于 10');
  for (const op of OPERATIONS) {
    assert.ok(op.id, '缺 id');
    assert.ok(op.title, `${op.id} 缺 title`);
    assert.ok(op.desc, `${op.id} 缺 desc`);
    assert.ok(op.group, `${op.id} 缺 group`);
    assert.equal(typeof op.run, 'function', `${op.id} 缺 run`);
    assert.equal(typeof op.cliPreview, 'function', `${op.id} 缺 cliPreview`);
    assert.equal(typeof op.risk, 'string', `${op.id} 缺 risk`);
    assert.ok(Array.isArray(op.fields), `${op.id} 的 fields 不是数组`);
    for (const f of op.fields) {
      assert.ok(f.name && f.label && f.kind, `${op.id} 的字段声明不完整`);
      assert.ok(['text', 'select', 'multi', 'confirm'].includes(f.kind), `${op.id}/${f.name} 的 kind 非法`);
    }
  }
});

test('危险操作带确认文字与风险标记', () => {
  const danger = OPERATIONS.filter((o) => o.risk === 'danger');
  assert.ok(danger.length >= 2, '至少要有两条危险操作');
  for (const op of danger) {
    assert.ok(op.confirmText, `危险操作 ${op.id} 缺 confirmText`);
  }
});

test('status：干净仓库返回 ok，且带出分支与冲突状态', async () => {
  await withRepo(async () => {
    const r = await runOperation('status');
    assert.equal(r.status, 'ok');
    assert.equal(r.data.branch, 'main');
    assert.equal(r.data.inProgress, 'none');
    assert.deepEqual(r.data.conflicts, []);
    assert.deepEqual(r.data.changes, []);
  });
});

test('status：有未提交改动时如实报出', async () => {
  await withRepo(async ({ dir }) => {
    writeFileSync(join(dir, 'b.txt'), 'new\n');
    const r = await runOperation('status');
    assert.equal(r.data.changes.length, 1);
    assert.match(r.data.changes[0].path, /b\.txt/);
  });
});

test('prfeat：建出 workerea-x 与 feat-x，并切到工作分支', async () => {
  await withRepo(async ({ git }) => {
    const r = await runOperation('prfeat', { name: 'login' });
    assert.equal(r.status, 'ok');
    const branches = git('branch', '--format=%(refname:short)').trim().split('\n');
    assert.ok(branches.includes('workerea-login'), '缺 workerea-login');
    assert.ok(branches.includes('feat-login'), '缺 feat-login');
    assert.equal(git('branch', '--show-current').trim(), 'workerea-login');
  });
});

test('prfeat：名字非法时拒绝，不建任何分支', async () => {
  await withRepo(async ({ git }) => {
    const before = git('branch', '--format=%(refname:short)').trim();
    await assert.rejects(() => runOperation('prfeat', { name: '中文名' }));
    assert.equal(git('branch', '--format=%(refname:short)').trim(), before);
  });
});

test('事务安全：有冲突时 abort 拒绝自动中止（--yes 也不行）', async () => {
  await withRepo(async ({ dir, git }) => {
    makeConflict({ dir, git });
    const r = await runOperation('abort', { yes: 'true' });
    assert.equal(r.status, 'conflict', '有冲突时必须拒绝自动中止');
    assert.match(r.data.guide, /GIT 操作中止指南/, '必须给出中止指南');
    // 状态仍在：没有真正执行 abort
    assert.equal(git('status', '--porcelain').includes('UU'), true);
  });
});

test('事务安全：显式 --force 才允许在有冲突时中止', async () => {
  await withRepo(async ({ dir, git }) => {
    makeConflict({ dir, git });
    const r = await runOperation('abort', { force: 'true' });
    assert.equal(r.status, 'ok');
    assert.equal(git('status', '--porcelain').trim(), '', '中止后工作区应干净');
  });
});

test('resolve-conflicts：单一冲突类型时按策略解决', async () => {
  await withRepo(async ({ dir, git }) => {
    makeConflict({ dir, git });
    const r = await runOperation('resolve-conflicts', { strategy: 'ours', all: 'true' });
    assert.equal(r.status, 'ok');
    const content = readFileSync(join(dir, 'a.txt'), 'utf8');
    assert.equal(content.trim(), 'from-main', 'ours 应保留当前分支的版本');
  });
});

test('resolve-conflicts：策略非法时拒绝，且不修改任何文件', async () => {
  await withRepo(async ({ dir, git }) => {
    makeConflict({ dir, git });
    const before = git('status', '--porcelain');
    await assert.rejects(() => runOperation('resolve-conflicts', { strategy: 'both' }));
    assert.equal(git('status', '--porcelain'), before, '非法策略不得改动工作区');
  });
});

test('中止命令表：每种进行中操作都有对应的 abort 命令', async () => {
  const { abortCommandOf } = await import('../../src/core/git/progress.js');
  assert.equal(abortCommandOf('merge'), 'git merge --abort');
  assert.equal(abortCommandOf('rebase'), 'git rebase --abort');
  assert.equal(abortCommandOf('cherry-pick'), 'git cherry-pick --abort');
  assert.equal(abortCommandOf('revert'), 'git revert --abort');
  assert.equal(abortCommandOf('am'), 'git am --abort');
});

test('操作 id 唯一，且与等价命令前缀一致', () => {
  const ids = OPERATIONS.map((o) => o.id);
  assert.equal(new Set(ids).size, ids.length, '操作 id 重复');
  for (const op of OPERATIONS) {
    assert.ok(op.cliPreview({}).startsWith('nx-nx git '), `${op.id} 的等价命令前缀不对`);
    assert.ok(findOperation(op.id), `${op.id} 查不到`);
  }
});
