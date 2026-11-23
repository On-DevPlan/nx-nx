// 历史清除：把指定文件从「创建点往后的整段历史」里删掉。
//
// 用途：仓库里混进了 docx / mp4 / exe 这类大文件。删掉工作区那一份还不够——
// 它们还留在历史里（每个 commit 各存了一份 blob），仓库体积一直下不来。
// 要真正瘦身只能重写历史：把那些路径从「创建点往后的每个 commit」的树里删掉。
//
// 三条关键决策（都是踩过坑才定下来的）：
//   1. **重写范围按「文件的创建点」算**，不是按 HEAD。
//      文件是 10 个 commit 之前加进来的，只重写 HEAD 那一个提交等于没删。
//   2. **用 --index-filter 而不是 --tree-filter**：前者不检出工作树，快一个数量级，
//      大仓库里差别是「几分钟」与「几十分钟」。
//   3. **重写前备份 .git**（见 ghost.ts 的 backupGitDir），每阶段失败都把备份路径带出来。
import { badInput } from '../errors/index.js';
import { git, gitTry, runGit, trimLines } from './exec.js';

/** 快照里的一个文件。 */
export interface TreeFile {
  /** 仓库相对路径 */
  path: string;
  /** blob 字节数（内容大小，不是磁盘占用） */
  size: number;
}

/**
 * 列出某个 commit 快照里的全部文件（含大小）。
 *
 * 用 `ls-tree -r -l -z`：
 *   -r 递归列出 blob（不要目录）；
 *   -l 带上 size；
 *   -z 用 NUL 分隔——路径里有空格/引号/非 ASCII 时不会被 git 的 C 风格转义弄坏。
 */
export async function listTreeFiles(commit: string, cwd?: string): Promise<TreeFile[]> {
  const out = await git(['ls-tree', '-r', '-l', '-z', commit], { cwd });
  const files: TreeFile[] = [];
  for (const record of out.split('\0')) {
    if (!record) continue;
    const tab = record.indexOf('\t');
    if (tab < 0) continue;
    const path = record.slice(tab + 1);
    if (!path) continue;
    // meta 形如 "100644 blob <sha> 12345"
    const meta = record.slice(0, tab).trim().split(/\s+/);
    const size = Number.parseInt(meta[3] ?? '', 10);
    files.push({ path, size: Number.isFinite(size) ? size : 0 });
  }
  return files;
}

/**
 * 编译文件匹配正则。
 *
 * 默认忽略大小写：媒体文件的扩展名大小写五花八门（.DOCX / .Docx），
 * 用户写 `docx` 就该都命中。正则自带的 `(?i)` / `(?s)` 等内联标志照常生效。
 */
export function compilePattern(pattern: string): RegExp {
  const p = pattern.trim();
  if (!p) throw badInput('文件正则不能为空');
  try {
    return new RegExp(p, 'i');
  } catch (err) {
    throw badInput(`文件正则不合法: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/** 按正则挑出匹配的文件。 */
export function matchFiles(files: TreeFile[], pattern: string): TreeFile[] {
  const re = compilePattern(pattern);
  return files.filter((f) => re.test(f.path));
}

/**
 * 找某个路径最早被「新增」的提交（跨改名追踪）。
 *
 * `--follow` 让改名后的路径也能追回最初的创建点；`--diff-filter=A` 只看新增。
 * git log 默认新→旧，所以**最后一行**才是最早的创建点。
 * 找不到（路径本来就不在历史里）返回 undefined。
 */
export async function findCreationCommit(path: string, cwd?: string): Promise<string | undefined> {
  const r = await gitTry(
    ['log', '--follow', '--diff-filter=A', '--format=%H', '--', path],
    { cwd }
  );
  if (r.code !== 0) return undefined;
  const hashes = trimLines(r.stdout);
  return hashes.length ? hashes[hashes.length - 1] : undefined;
}

/** 提交是否有父提交（根提交没有）。 */
export async function hasParent(commit: string, cwd?: string): Promise<boolean> {
  const r = await gitTry(['rev-parse', '--verify', '--quiet', `${commit}^`], { cwd });
  return r.code === 0 && r.stdout.trim() !== '';
}

/** 某个 commit 是否存在（是合法 commit-ish）。 */
export async function commitExists(commit: string, cwd?: string): Promise<boolean> {
  const r = await gitTry(['rev-parse', '--verify', '--quiet', `${commit}^{commit}`], { cwd });
  return r.code === 0 && r.stdout.trim() !== '';
}

/** a 是否是 b 的祖先（相等也算）。用来比较两个提交谁更老。 */
export async function isAncestor(a: string, b: string, cwd?: string): Promise<boolean> {
  const r = await gitTry(['merge-base', '--is-ancestor', a, b], { cwd });
  return r.code === 0;
}

/** 区间内是否还有提交动过这个路径（= 文件还留在历史里）。 */
export async function pathTouchedInRange(
  range: string,
  path: string,
  cwd?: string
): Promise<boolean> {
  const r = await gitTry(['rev-list', range, '--', path], { cwd });
  return r.code === 0 && r.stdout.trim() !== '';
}

/** 区间内的提交数。 */
export async function countCommits(range: string, cwd?: string): Promise<number> {
  const out = await git(['rev-list', '--count', range], { cwd });
  const n = Number.parseInt(out.trim(), 10);
  return Number.isFinite(n) ? n : 0;
}

/**
 * 计算重写区间。
 *
 * 有父提交 → `<start>^..HEAD`（只重写 start 往后的，早于它的提交原样保留）；
 * 根提交 → `HEAD`（它的全部祖先都要重写，否则文件还留在更早的提交里）。
 */
export async function rewriteRangeFrom(start: string, cwd?: string): Promise<string> {
  return (await hasParent(start, cwd)) ? `${start}^..HEAD` : 'HEAD';
}

/** 某个 commit 的树里是否还有这个路径。 */
export async function fileExistsAt(
  commit: string,
  path: string,
  cwd?: string
): Promise<boolean> {
  const r = await gitTry(['ls-tree', '-r', '--name-only', '-z', commit, '--', path], { cwd });
  return r.code === 0 && r.stdout.replace(/\0/g, '').trim() !== '';
}

/** shell 单引号转义——filter-branch 的 --index-filter 会被 sh eval。 */
export function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

/**
 * 一个文件在历史里用过的**所有路径**（跟着改名链走）。
 *
 * 为什么必须做这一步：文件被改名过（`assets/sk-thesis/...` → `assets/nx-sk/...`），
 * 只删当前路径的话，旧提交里还留着同一个 blob（挂在老路径下）——
 * 文件照样能从历史里下到。清除要连改名链一起清。
 */
export async function historicalPaths(path: string, cwd?: string): Promise<string[]> {
  const paths = new Set<string>([path]);
  const r = await gitTry(
    ['log', '--follow', '--name-status', '-z', '--format=%x00', '--', path],
    { cwd }
  );
  if (r.code !== 0) return [path];
  const tokens = r.stdout.split('\0').filter((t) => t !== '');
  for (let i = 0; i < tokens.length; i += 1) {
    // 状态 token 可能带前导换行（--format=%x00 之后 git 还会补一个 \n），
    // 但**路径 token 不能 trim**——路径里本来就可能有空白。
    const status = tokens[i]!.trim();
    if (/^[RC]\d*$/.test(status)) {
      // 改名 / 复制：后面两个 token 依次是旧路径、新路径
      const oldPath = tokens[i + 1];
      const newPath = tokens[i + 2];
      if (oldPath) paths.add(oldPath);
      if (newPath) paths.add(newPath);
      i += 2;
    } else if (/^[AMDRT]\d*$/.test(status)) {
      const p = tokens[i + 1];
      if (p) paths.add(p);
      i += 1;
    }
  }
  return [...paths];
}

/** 本地所有分支与标签的 ref 名（彻底清除时的重写范围）。 */
export async function allLocalRefs(cwd?: string): Promise<string[]> {
  const out = await git(
    ['for-each-ref', '--format=%(refname)', 'refs/heads/', 'refs/tags/'],
    { cwd }
  );
  const refs = trimLines(out);
  return refs.length ? refs : ['HEAD'];
}

/**
 * 哪些 ref 的树里还有这个路径。
 *
 * 清除之后必须逐个 ref 复查：只改了当前分支的话，tag 里的旧提交照样留着文件，
 * 从 GitHub 上按 tag 就能下到。
 */
export async function refsContaining(path: string, cwd?: string): Promise<string[]> {
  const out = await git(
    ['for-each-ref', '--format=%(refname)', 'refs/heads/', 'refs/tags/'],
    { cwd }
  );
  const hits: string[] = [];
  for (const ref of trimLines(out)) {
    const t = await gitTry(['ls-tree', '-r', '--name-only', '-z', ref, '--', path], { cwd });
    if (t.code === 0 && t.stdout.replace(/\0/g, '').trim() !== '') hits.push(ref);
  }
  return hits;
}

export interface RewriteOptions {
  /** 要从历史里删掉的路径（应包含改名链上的全部路径） */
  paths: string[];
  /** 最早创建提交（重写从它开始；scope=all 时仅用于报告） */
  start: string;
  /** 保留因清除文件而变空的提交（默认剪掉） */
  keepEmpty?: boolean;
  /**
   * 重写范围：
   *   branch —— 只改当前分支（`<start>^..HEAD`），tag 里的旧提交仍留着文件；
   *   all    —— 改**所有本地分支与标签**，并用 --tag-name-filter cat 把 tag 一起重写。
   *             彻底清除必须用这个：文件常常还挂在老 tag 上。
   */
  scope?: 'branch' | 'all';
  cwd?: string;
}

export interface RewriteOutcome {
  /** 实际重写的区间 */
  range: string;
  /** 区间内的提交数 */
  rewritten: number;
  /** 被重写的 tag 数（scope=all 时有效） */
  tagsRewritten: number;
}

/**
 * 用 filter-branch 把 paths 从 start 往后的每个 commit 里删掉。
 *
 * --index-filter 里跑的是 `git rm --cached --ignore-unmatch`：
 * 某个 commit 里没有这个文件时忽略，不报错。
 *
 * scope=all 时：
 *   - 重写范围 = 所有本地分支 + 标签（老 tag 上常有文件）；
 *   - 额外加 --tag-name-filter cat，把指向被重写提交的 tag 一起指到新提交
 *     （annotated tag 会重建 tag 对象，签名会被剥掉——这是 filter-branch 的固有行为）。
 */
export async function rewriteRemovingPaths(
  opts: RewriteOptions
): Promise<RewriteOutcome> {
  const scope = opts.scope ?? 'branch';
  const range = await rewriteRangeFrom(opts.start, opts.cwd);
  const rewritten = await countCommits(range, opts.cwd);
  const rmCmd = `git rm -r --cached --ignore-unmatch -q -- ${opts.paths.map(shellQuote).join(' ')}`;
  const args = ['filter-branch', '--force', '--index-filter', rmCmd];
  if (!opts.keepEmpty) args.push('--prune-empty');

  let revArgs: string[];
  if (scope === 'all') {
    args.push('--tag-name-filter', 'cat');
    revArgs = await allLocalRefs(opts.cwd);
  } else {
    revArgs = [range];
  }
  args.push('--', ...revArgs);

  const r = await runGit(args, {
    cwd: opts.cwd,
    env: { FILTER_BRANCH_SQUELCH_WARNING: '1' },
    timeoutMs: 900_000,
  });
  if (r.code !== 0) {
    const detail = (r.stderr || r.stdout || '').trim();
    throw new Error(`filter-branch 失败: ${detail || `退出码 ${r.code}`}`);
  }

  let tagsRewritten = 0;
  if (scope === 'all') {
    const out = await git(['tag', '--list'], { cwd: opts.cwd });
    tagsRewritten = trimLines(out).length;
  }
  return { range, rewritten, tagsRewritten };
}

/**
 * 回收磁盘空间。
 *
 * 旧对象要同时满足「没人引用」才能被 prune 掉：
 *   - filter-branch 留下的 refs/original/* 还指着旧提交 → 先删（见 cleanupFilterBranchRefs）；
 *   - reflog 里还留着旧 hash → 过期掉；
 *   - 最后 gc --prune=now 才真正删对象。
 */
export async function gcRepository(cwd?: string): Promise<void> {
  await git(['reflog', 'expire', '--expire=now', '--all'], { cwd });
  await git(['gc', '--prune=now'], { cwd, timeoutMs: 900_000 });
}
