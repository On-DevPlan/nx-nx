// 仓库与工作区：迁移 gitlike 的 internal/git/git.go 里「仓库状态 + 工作区」这一组。
//
// 命名保持与 gitlike 一致，方便两边对照；行为上修掉了两处设计债：
//   - gitlike 把 stdout/stderr 混在一个 buffer 里，本实现分开（见 exec.ts）；
//   - gitlike 的「是否干净」用字符串非空判断，本实现用解析后的条目数组。
import { git, gitTry, trimLines } from './exec.js';

export interface StatusEntry {
  /** 两位状态码，如 ' M' / '??' / 'UU' */
  code: string;
  /** 文件路径（rename 时是 'old -> new'） */
  path: string;
}

export async function isGitRepo(cwd?: string): Promise<boolean> {
  const r = await gitTry(['rev-parse', '--git-dir'], { cwd });
  return r.code === 0;
}

export async function repoRoot(cwd?: string): Promise<string> {
  const out = await git(['rev-parse', '--show-toplevel'], { cwd });
  return out.trim();
}

/** .git 目录的**绝对**路径（可能是 worktree 里的文件，不是目录）。 */
export async function gitDir(cwd?: string): Promise<string> {
  const out = await git(['rev-parse', '--absolute-git-dir'], { cwd });
  return out.trim();
}

export async function currentBranch(cwd?: string): Promise<string> {
  const out = await git(['branch', '--show-current'], { cwd });
  return out.trim();
}

export async function headHash(cwd?: string): Promise<string> {
  const out = await git(['rev-parse', 'HEAD'], { cwd });
  return out.trim();
}

/** 解析 `git status --porcelain`。 */
export async function statusEntries(cwd?: string): Promise<StatusEntry[]> {
  const out = await git(['status', '--porcelain'], { cwd });
  return parseStatus(out);
}

export function parseStatus(raw: string): StatusEntry[] {
  const entries: StatusEntry[] = [];
  for (const line of raw.split('\n')) {
    if (line.length < 3) continue;
    const code = line.slice(0, 2);
    const path = line.slice(3).trim();
    if (!path) continue;
    entries.push({ code, path });
  }
  return entries;
}

export async function hasUncommittedChanges(cwd?: string): Promise<boolean> {
  return (await statusEntries(cwd)).length > 0;
}

export async function isCleanWorktree(cwd?: string): Promise<boolean> {
  return !(await hasUncommittedChanges(cwd));
}

export async function stagedFiles(cwd?: string): Promise<string[]> {
  const out = await git(['diff', '--name-only', '--cached'], { cwd });
  return trimLines(out);
}

export async function unstageFile(file: string, cwd?: string): Promise<void> {
  await git(['reset', 'HEAD', '--', file], { cwd });
}

export async function addFile(file: string, cwd?: string): Promise<void> {
  await git(['add', '--', file], { cwd });
}

export async function addAll(cwd?: string): Promise<void> {
  await git(['add', '-A'], { cwd });
}

export async function addTracked(cwd?: string): Promise<void> {
  await git(['add', '-u'], { cwd });
}

/** 提交全部改动（先 add -A）。 */
export async function commitAll(message: string, cwd?: string): Promise<void> {
  await addAll(cwd);
  await git(['commit', '-m', message], { cwd });
}

/** 只提交暂存区。 */
export async function commitStaged(message: string, cwd?: string): Promise<void> {
  await git(['commit', '-m', message], { cwd });
}

/** reset --mixed：清暂存区，保留工作区。 */
export async function resetMixed(cwd?: string): Promise<void> {
  await git(['reset', '--mixed'], { cwd });
}

/** reset --hard 到指定 ref。 */
export async function resetTo(ref: string, cwd?: string): Promise<void> {
  await git(['reset', '--hard', ref], { cwd });
}

/** 丢弃已追踪文件的改动。 */
export async function discardChanges(cwd?: string): Promise<void> {
  await git(['checkout', '--', '.'], { cwd });
}

/** 清理未追踪文件与目录。 */
export async function cleanUntracked(cwd?: string): Promise<void> {
  await git(['clean', '-fd'], { cwd });
}

export async function checkoutOurs(file: string, cwd?: string): Promise<void> {
  await git(['checkout', '--ours', '--', file], { cwd });
}

export async function checkoutTheirs(file: string, cwd?: string): Promise<void> {
  await git(['checkout', '--theirs', '--', file], { cwd });
}

/** squash merge：把目标分支的变更吸进暂存区，不产生 commit。 */
export async function mergeSquash(branch: string, cwd?: string): Promise<void> {
  await git(['merge', '--squash', branch], { cwd });
}

export async function cherryPick(hash: string, cwd?: string): Promise<void> {
  await git(['cherry-pick', hash], { cwd });
}

export async function stashPush(message: string, cwd?: string): Promise<void> {
  await git(['stash', 'push', '-m', message], { cwd });
}

/**
 * stash 但保留暂存区。
 *
 * 进行中的 merge / rebase / cherry-pick 把状态放在 index 里，
 * 普通 stash 会把 index 一起清掉，导致 --abort 失效——所以必须 --keep-index。
 */
export async function stashPushKeepIndex(message: string, cwd?: string): Promise<void> {
  await git(['stash', 'push', '--keep-index', '-m', message], { cwd });
}

export async function stashPop(cwd?: string): Promise<void> {
  await git(['stash', 'pop'], { cwd });
}

export async function refExists(ref: string, cwd?: string): Promise<boolean> {
  const r = await gitTry(['rev-parse', '--verify', '--quiet', `${ref}^{commit}`], { cwd });
  return r.code === 0 && r.stdout.trim() !== '';
}
