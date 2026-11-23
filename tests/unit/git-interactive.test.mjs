// 交互模式（`nx-nx git i`）的端到端测试。
//
// 这条链路是「用户敲一条命令就进菜单」的唯一保证，因此要真跑：
// 把 stdin/stdout 换成假 TTY，脚本化按键，走完 选操作 → 填参数 → 确认 → 执行。
//
// 为什么用假 TTY 而不是真终端：CI 里没有真终端；而「非 TTY 就降级成只读快照」
// 恰恰是这条命令在管道里的正确行为——没有 TTY 就测不到交互分支。
//
// **只写一个 TTY 用例**：@clack/prompts 在**模块加载期**就抓住了当时的
// process.stdout（惰性 import 也一样）。第二个 TTY 用例会拿到上一个用例的
// 死 stdout——提示渲染到没人看的地方，按键永远等不到。
// 要多测几条路径，就把它们放进同一个用例的不同步骤里。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough, Writable } from 'node:stream';

/**
 * 装上假 TTY，跑一条 CLI 命令，**看到提示才发按键**。
 *
 * 不能按固定延时喂按键：菜单渲染完成的时机随环境浮动（要跑几次 git 调用），
 * 早到的按键会被丢进搜索框而不是被当成「选中」。所以这里等输出里出现
 * 预期的标记再发下一批键。
 *
 * steps: [{ wait: RegExp, keys: string }, ...]
 */
async function runInFakeTty(argv, steps) {
  const realIn = process.stdin;
  const realOut = process.stdout;

  const fakeIn = new PassThrough();
  fakeIn.isTTY = true;
  fakeIn.setRawMode = () => fakeIn;
  fakeIn.setEncoding = () => fakeIn;

  const chunks = [];
  const fakeOut = new Writable({
    write(chunk, _enc, cb) {
      chunks.push(String(chunk));
      cb();
    },
  });
  fakeOut.isTTY = true;
  fakeOut.columns = 100;
  fakeOut.rows = 40;

  Object.defineProperty(process, 'stdin', { value: fakeIn, configurable: true });
  Object.defineProperty(process, 'stdout', { value: fakeOut, configurable: true });

  // 惰性导入：此刻 process.stdin / process.stdout 已经是假 TTY 了。
  // 顶部就 import 会抓到真终端——提示会渲染到没人看的真 stdout 上。
  const { runCli } = await import('../../src/runtime/cli.js');

  let step = 0;
  const poll = setInterval(() => {
    if (step >= steps.length) return;
    const text = chunks.join('');
    if (steps[step].wait.test(text)) {
      fakeIn.write(steps[step].keys);
      step += 1;
    }
  }, 25);

  try {
    await Promise.race([
      runCli(argv),
      new Promise((resolve) => setTimeout(resolve, 20000)),
    ]);
  } finally {
    clearInterval(poll);
    // 流程可能还挂在提示上（按键没喂够）：把假 stdin 拆掉，
    // 否则被 resume 的流会让进程一直不退出，测试永远跑不完。
    fakeIn.destroy();
    Object.defineProperty(process, 'stdin', { value: realIn, configurable: true });
    Object.defineProperty(process, 'stdout', { value: realOut, configurable: true });
  }
  return chunks.join('');
}

/** 建一个临时仓库并切过去。 */
function useTempRepo() {
  const dir = mkdtempSync(join(tmpdir(), 'nx-nx-git-tty-'));
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
  git('init', '-b', 'main');
  git('config', 'user.email', 'tester@example.com');
  git('config', 'user.name', 'tester');
  writeFileSync(join(dir, 'a.txt'), 'v1\n');
  git('add', '.');
  git('commit', '-m', 'init');
  process.chdir(dir);
  return {
    dir,
    git,
    restore() {
      process.chdir(cwd);
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

test('git i 在真 TTY 下进菜单并走完 选操作 → 填参数 → 确认 → 执行', async () => {
  const repo = useTempRepo();
  try {
    const text = await runInFakeTty(
      ['git', 'i'],
      [
        { wait: /选择要执行的操作/, keys: 'prfeat' }, // 过滤出 prfeat
        { wait: /搜索: prfeat/, keys: '\r' }, // 回车选中
        { wait: /特性名字/, keys: 'login\r' }, // 填名字并提交
        { wait: /确认执行以上操作/, keys: '\r' }, // 确认执行
      ]
    );

    // 走的是交互分支，不是只读快照的降级路径
    assert.ok(!text.includes('只读快照'), 'TTY 下不该走只读快照的降级路径');
    // 菜单列出了全部操作，并给出「什么时候用」
    assert.match(text, /选择要执行的操作/, '应该出现操作选择菜单');
    assert.match(text, /prfeat/, '菜单里应列出全部操作');
    assert.match(text, /什么时候用/, '详情面板应说明每个操作什么时候用');
    // 确认页与执行
    assert.match(text, /即将执行/, '应有确认页');
    assert.match(text, /创建工作分支对/, '应执行 prfeat 操作');

    // 真的把分支建出来了
    const branches = repo.git('branch', '--format=%(refname:short)').trim().split('\n');
    assert.ok(branches.includes('workerea-login'), '缺 workerea-login');
    assert.ok(branches.includes('feat-login'), '缺 feat-login');
    assert.equal(repo.git('branch', '--show-current').trim(), 'workerea-login');
  } finally {
    repo.restore();
  }
});

test('非 TTY（管道）下 git i 降级为只读快照，不抢终端', async () => {
  const repo = useTempRepo();
  try {
    // 直接调 action 的 run：它返回的必须是快照形态
    const { default: gitInteractive } = await import(
      '../../src/modules/git/actions/git-interactive.js'
    );
    const result = await gitInteractive.run({}, { transport: 'cli' });
    assert.equal(result.kind, 'snapshot');
    assert.match(result.snapshot.hint, /非交互环境/);
    assert.ok(result.snapshot.operations.length >= 10);
  } finally {
    repo.restore();
  }
});
