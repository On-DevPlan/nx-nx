// 历史清除（purge-files）的行为测试。
//
// 盯的是**四条契约**：
//   1. 只扫描（不给 --files）时列出文件与大小，但**历史一个字都不动**；
//   2. 真要重写历史时必须显式 --force（直连 CLI 的默认是安全的）；
//   3. 重写后目标文件从「创建点往后的整段历史」里彻底消失，工作区那份也没了，
//      而**其它文件与提交标题原样保留**；
//   4. 因清除文件而变空的提交会被剪掉（--keep-empty 可保留）。
//
// 测试都在临时仓库里跑（process.chdir 切过去），绝不碰真实仓库。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const { runOperation } = await import('../../src/modules/git/service.js');
const { listTreeFiles, matchFiles, compilePattern } = await import(
  '../../src/core/git/purge.js'
);
const { formatSize } = await import('../../src/core/terminal/format.js');

/** 在临时目录里建一个 git 仓库并切过去。 */
async function withRepo(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'nx-nx-purge-test-'));
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
    writeFileSync(join(dir, 'readme.md'), '# hello\n');
    git('add', '.');
    git('commit', '-m', 'init: readme');
    process.chdir(dir);
    return await fn({ dir, git });
  } finally {
    process.chdir(cwd);
    rmSync(dir, { recursive: true, force: true });
  }
}

/** 提交里塞进媒体文件与正常代码。 */
function addMediaCommit({ dir, git }, { onlyMedia = false } = {}) {
  writeFileSync(join(dir, 'demo.docx'), 'X'.repeat(2048));
  writeFileSync(join(dir, 'clip.mp4'), 'Y'.repeat(4096));
  if (!onlyMedia) writeFileSync(join(dir, 'app.ts'), 'export const a = 1;\n');
  git('add', '.');
  git('commit', '-m', 'feat: add demo assets');
}

test('快照扫描：列出文件与大小', async () => {
  await withRepo(async ({ dir, git }) => {
    addMediaCommit({ dir, git });
    const files = await listTreeFiles('HEAD');
    const names = files.map((f) => f.path);
    assert.ok(names.includes('demo.docx'), '应列出 docx');
    assert.ok(names.includes('clip.mp4'), '应列出 mp4');
    const docx = files.find((f) => f.path === 'demo.docx');
    assert.equal(docx.size, 2048, '大小应是 blob 的字节数');
  });
});

test('正则匹配：忽略大小写，非法正则直接报错', () => {
  const files = [
    { path: 'a.DOCX', size: 1 },
    { path: 'b.mp4', size: 2 },
    { path: 'c.txt', size: 3 },
  ];
  assert.deepEqual(
    matchFiles(files, '\\.(docx|mp4)$').map((f) => f.path),
    ['a.DOCX', 'b.mp4'],
    '应忽略大小写命中'
  );
  assert.throws(() => compilePattern('(unclosed'), /正则不合法/);
});

test('体积格式化：B / KB / MB', () => {
  assert.equal(formatSize(12), '12 B');
  assert.equal(formatSize(2048), '2.0 KB');
  assert.equal(formatSize(1024 * 1024 * 3.5), '3.5 MB');
});

test('只扫描不给文件：列出清单但历史不动', async () => {
  await withRepo(async ({ dir, git }) => {
    addMediaCommit({ dir, git });
    const before = git('rev-parse', 'HEAD').trim();
    const r = await runOperation('purge-files', { base: 'HEAD', pattern: '\\.(docx|mp4)$' });
    assert.equal(r.status, 'ok');
    assert.equal(r.data.rewritten, false, '没选文件就不该重写');
    assert.equal(r.data.matchedFiles.length, 2, '应列出 2 个匹配文件');
    assert.ok(r.data.totalSize > 0, '应给出合计体积');
    assert.equal(git('rev-parse', 'HEAD').trim(), before, 'HEAD 不该变');
    assert.ok(
      git('log', '--all', '--format=%H', '--', 'demo.docx').trim(),
      '历史里应还有 demo.docx'
    );
  });
});

test('给了文件但没有 force：拒绝执行，历史不动', async () => {
  await withRepo(async ({ dir, git }) => {
    addMediaCommit({ dir, git });
    const before = git('rev-parse', 'HEAD').trim();
    await assert.rejects(
      () => runOperation('purge-files', { base: 'HEAD', pattern: '\\.docx$', files: ['demo.docx'] }),
      /--force/
    );
    assert.equal(git('rev-parse', 'HEAD').trim(), before, 'HEAD 不该变');
  });
});

test('真正重写：目标文件从历史与工作区消失，其它内容保留', async () => {
  await withRepo(async ({ dir, git }) => {
    addMediaCommit({ dir, git });
    writeFileSync(join(dir, 'app.ts'), 'export const a = 2;\n');
    git('add', '.');
    git('commit', '-m', 'chore: bump');

    const r = await runOperation('purge-files', {
      base: 'HEAD',
      pattern: '\\.(docx|mp4)$',
      files: ['demo.docx', 'clip.mp4'],
      force: 'true',
      gc: 'false',
    });
    assert.equal(r.status, 'ok');
    assert.equal(r.data.rewritten, 2, '应重写 2 个提交');
    assert.ok(r.data.backupDir, '必须给出 .git 备份路径');

    assert.equal(git('log', '--all', '--format=%H', '--', 'demo.docx').trim(), '', 'docx 应从历史消失');
    assert.equal(git('log', '--all', '--format=%H', '--', 'clip.mp4').trim(), '', 'mp4 应从历史消失');
    assert.ok(git('log', '--all', '--format=%H', '--', 'readme.md').trim(), 'readme 应保留');
    assert.equal(existsSync(join(dir, 'demo.docx')), false, '工作区那份也该消失');
    assert.equal(existsSync(join(dir, 'app.ts')), true, '正常代码文件应保留');

    const subjects = git('log', '--format=%s').trim().split('\n');
    assert.ok(subjects.includes('init: readme'), '提交标题应保留');
    assert.ok(subjects.includes('chore: bump'), '提交标题应保留');
  });
});

test('变空的提交会被剪掉（--keep-empty 可保留）', async () => {
  await withRepo(async ({ dir, git }) => {
    // 这个提交只加了两个媒体文件 → 清除后它就空了
    addMediaCommit({ dir, git }, { onlyMedia: true });
    const before = Number(git('rev-list', '--count', 'HEAD').trim());

    const r = await runOperation('purge-files', {
      base: 'HEAD',
      pattern: '\\.(docx|mp4)$',
      files: ['demo.docx', 'clip.mp4'],
      force: 'true',
      gc: 'false',
    });
    assert.equal(r.status, 'ok');
    const after = Number(git('rev-list', '--count', 'HEAD').trim());
    assert.equal(after, before - 1, '变空的提交应被剪掉');
    assert.equal(git('log', '--format=%s').trim(), 'init: readme', '只剩第一个提交');
  });
});

test('keep-empty：变空的提交保留下来', async () => {
  await withRepo(async ({ dir, git }) => {
    addMediaCommit({ dir, git }, { onlyMedia: true });
    const before = Number(git('rev-list', '--count', 'HEAD').trim());
    await runOperation('purge-files', {
      base: 'HEAD',
      pattern: '\\.(docx|mp4)$',
      files: ['demo.docx', 'clip.mp4'],
      force: 'true',
      'keep-empty': 'true',
      gc: 'false',
    });
    assert.equal(Number(git('rev-list', '--count', 'HEAD').trim()), before, '提交数不该变');
  });
});

test('路径安全：绝对路径与 .. 一律拒绝', async () => {
  await withRepo(async ({ dir, git }) => {
    addMediaCommit({ dir, git });
    await assert.rejects(
      () =>
        runOperation('purge-files', {
          base: 'HEAD',
          pattern: '.*',
          files: ['/etc/passwd'],
          force: 'true',
        }),
      /仓库相对路径/
    );
    await assert.rejects(
      () =>
        runOperation('purge-files', {
          base: 'HEAD',
          pattern: '.*',
          files: ['../outside.txt'],
          force: 'true',
        }),
      /\.\./
    );
  });
});

test('工作区不干净时拒绝重写', async () => {
  await withRepo(async ({ dir, git }) => {
    addMediaCommit({ dir, git });
    writeFileSync(join(dir, 'dirty.txt'), 'uncommitted\n');
    await assert.rejects(
      () =>
        runOperation('purge-files', {
          base: 'HEAD',
          pattern: '\\.docx$',
          files: ['demo.docx'],
          force: 'true',
        }),
      /工作区不干净/
    );
  });
});

test('交互提示：默认值参与校验（回车 = 采用默认值，而不是判为空）', async () => {
  const { valueForValidation } = await import('../../src/core/terminal/prompts.js');
  // clack 校验时给的是 undefined，不是空串——两种都得当成「采用默认值」。
  assert.equal(valueForValidation(undefined, '\\.(docx|mp4)$'), '\\.(docx|mp4)$');
  assert.equal(valueForValidation('', '\\.(docx|mp4)$'), '\\.(docx|mp4)$');
  // 用户真的敲了值就用自己的。
  assert.equal(valueForValidation('\\.mp4$', '\\.(docx|mp4)$'), '\\.mp4$');
});

test('操作声明：purge-files 带预览钩子与确认文字', async () => {
  const { findOperation } = await import('../../src/modules/git/ops/index.js');
  const op = findOperation('purge-files');
  assert.ok(op, '操作应已注册');
  assert.equal(op.risk, 'danger');
  assert.equal(op.confirmText, 'PURGE-HISTORY');
  const files = op.fields.find((f) => f.name === 'files');
  assert.ok(files, '应有「要清除的文件」字段');
  assert.equal(files.kind, 'multi');
  assert.equal(typeof files.options, 'function', '文件列表应由仓库现状算出');
  assert.equal(typeof files.preview, 'function', '提问前应先给出文件清单预览');
  assert.ok(
    op.fields.some((f) => f.name === 'scope'),
    '应有「重写范围」字段（tag 上常常也挂着文件）'
  );
});

test('改名链：文件改过名时，历史上的旧路径也要一起清掉', async () => {
  await withRepo(async ({ dir, git }) => {
    // 先以 old/name.docx 加进来，再改名成 new/name.docx
    writeFileSync(join(dir, 'old-name.docx'), 'X'.repeat(512));
    git('add', '.');
    git('commit', '-m', 'add old path');
    git('mv', 'old-name.docx', 'new-name.docx');
    git('commit', '-m', 'rename');

    const { historicalPaths } = await import('../../src/core/git/purge.js');
    const paths = await historicalPaths('new-name.docx');
    assert.ok(paths.includes('old-name.docx'), '改名链应包含旧路径');
    assert.ok(paths.includes('new-name.docx'), '改名链应包含新路径');

    const r = await runOperation('purge-files', {
      base: 'HEAD',
      pattern: '\\.docx$',
      files: ['new-name.docx'],
      force: 'true',
      scope: 'all',
      gc: 'false',
    });
    assert.equal(r.status, 'ok');
    assert.ok(r.data.purgedPaths.includes('old-name.docx'), '实际清除的路径应含旧路径');
    assert.equal(
      git('log', '--all', '--format=%H', '--', 'old-name.docx').trim(),
      '',
      '旧路径应从历史消失'
    );
    assert.equal(
      git('log', '--all', '--format=%H', '--', 'new-name.docx').trim(),
      '',
      '新路径应从历史消失'
    );
  });
});

test('scope=all：tag 上挂着的文件也会被清掉', async () => {
  await withRepo(async ({ dir, git }) => {
    addMediaCommit({ dir, git });
    git('tag', '-a', 'v1.0', '-m', 'release');
    assert.ok(
      git('ls-tree', '-r', '--name-only', 'v1.0', '--', 'demo.docx').trim(),
      'tag 的树里应先有这个文件'
    );

    const r = await runOperation('purge-files', {
      base: 'HEAD',
      pattern: '\\.docx$',
      files: ['demo.docx'],
      force: 'true',
      scope: 'all',
      gc: 'false',
    });
    assert.equal(r.status, 'ok');
    assert.equal(
      git('ls-tree', '-r', '--name-only', 'v1.0', '--', 'demo.docx').trim(),
      '',
      'tag 的树里不该再有这个文件'
    );
    assert.equal(
      git('log', '--all', '--format=%H', '--', 'demo.docx').trim(),
      '',
      '所有 ref 的历史里都不该再有这个文件'
    );
  });
});

test('scope=branch：只改当前分支，老 tag 上的文件仍在（所以默认必须是 all）', async () => {
  await withRepo(async ({ dir, git }) => {
    addMediaCommit({ dir, git });
    git('tag', '-a', 'v1.0', '-m', 'release');
    await runOperation('purge-files', {
      base: 'HEAD',
      pattern: '\\.docx$',
      files: ['demo.docx'],
      force: 'true',
      scope: 'branch',
      gc: 'false',
    });
    // branch 范围只重写当前分支：tag 还指着旧提交，旧提交里文件还在——
    // 这正是「彻底清除」必须用 scope=all 的原因。
    assert.ok(
      git('ls-tree', '-r', '--name-only', 'v1.0', '--', 'demo.docx').trim(),
      'scope=branch 时老 tag 上的文件应当仍在'
    );
    assert.ok(
      git('log', '--format=%H', 'v1.0', '--', 'demo.docx').trim(),
      '老 tag 的历史里仍能翻到这个文件'
    );
    // 但当前分支上确实清掉了
    assert.equal(
      git('log', '--format=%H', 'HEAD', '--', 'demo.docx').trim(),
      '',
      '当前分支上不该再有这个文件'
    );
  });
});
