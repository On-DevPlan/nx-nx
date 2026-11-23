// 分支与远端：迁移 gitlike 的分支组 + 远端组。
//
// 与 gitlike 的差异（有意为之）：gitlike 的 ListRemoteBranches 把 origin/ 前缀剥掉、
// 又丢掉 remote 名，信息不可逆。这里保留完整形态 { remote, branch }，
// 便于交互式列表里显示「origin/feat-x」而不是裸名字。
import { git, gitTry, trimLines } from './exec.js';

export interface RemoteBranch {
  /** 远程名，如 origin */
  remote: string;
  /** 远程分支名（不含 remote/ 前缀） */
  branch: string;
  /** 完整短名，如 origin/feat-x */
  full: string;
}

export async function branchExists(name: string, cwd?: string): Promise<boolean> {
  const out = await git(['branch', '--list', name], { cwd });
  return out.trim() !== '';
}

export async function listLocalBranches(cwd?: string): Promise<string[]> {
  const out = await git(['branch', '--format=%(refname:short)'], { cwd });
  return trimLines(out);
}

export async function listRemoteBranches(cwd?: string): Promise<RemoteBranch[]> {
  const out = await git(['branch', '-r', '--format=%(refname:short)'], { cwd });
  const result: RemoteBranch[] = [];
  for (const full of trimLines(out)) {
    if (full.endsWith('/HEAD')) continue;
    const slash = full.indexOf('/');
    if (slash <= 0) continue;
    result.push({ remote: full.slice(0, slash), branch: full.slice(slash + 1), full });
  }
  return result;
}

export async function listRemotes(cwd?: string): Promise<string[]> {
  const out = await git(['remote'], { cwd });
  return trimLines(out);
}

export async function hasRemote(cwd?: string): Promise<boolean> {
  return (await listRemotes(cwd)).length > 0;
}

export async function createBranch(name: string, at: string, cwd?: string): Promise<void> {
  await git(['branch', name, at], { cwd });
}

export async function checkoutBranch(name: string, cwd?: string): Promise<void> {
  await git(['checkout', name], { cwd });
}

export async function renameBranch(from: string, to: string, cwd?: string): Promise<void> {
  await git(['branch', '-m', from, to], { cwd });
}

/** 强删分支（-D）。gitlike 的 force-push 流程依赖这个语义。 */
export async function deleteBranch(name: string, cwd?: string): Promise<void> {
  await git(['branch', '-D', name], { cwd });
}

export async function mergeBase(a: string, b: string, cwd?: string): Promise<string> {
  const out = await git(['merge-base', a, b], { cwd });
  return out.trim();
}

/** 某个 ref 下的文件清单。 */
export async function filesInBranch(ref: string, cwd?: string): Promise<string[]> {
  const out = await git(['ls-tree', '-r', '--name-only', ref], { cwd });
  return trimLines(out);
}

export async function fetchBranch(remote: string, branch: string, cwd?: string): Promise<void> {
  await git(['fetch', remote, branch], { cwd });
}

/** 强推：带 lease 保护（远端被别人推过就拒绝）。 */
export async function forcePush(
  remote: string,
  localBranch: string,
  remoteBranch: string,
  cwd?: string
): Promise<void> {
  await git(['push', '--force-with-lease', remote, `${localBranch}:${remoteBranch}`], { cwd });
}

/**
 * 强推：不用 lease。
 *
 * 只在「本地历史已被重写」后使用（cleanup-history 的 filter-branch 改了本地 hash，
 * 远端旧 hash 已不在本地 reflog 里，--force-with-lease 会拒绝推）。
 */
export async function forcePushUnchecked(
  remote: string,
  localBranch: string,
  remoteBranch: string,
  cwd?: string
): Promise<void> {
  await git(['push', '--force', remote, `${localBranch}:${remoteBranch}`], { cwd });
}

/**
 * 强制推送所有标签。
 *
 * 历史重写后 tag 必须一起推——否则 tag 还指着旧提交，
 * 文件照样能从 `raw/<tag>/<路径>` 下到。
 */
export async function pushTags(remote: string, cwd?: string): Promise<void> {
  await git(['push', '--force', '--tags', remote], { cwd, timeoutMs: 600_000 });
}

/**
 * 自动发现主分支。
 * 依次尝试：<remote>/HEAD → <remote>/main → <remote>/master → 本地 main → 本地 master。
 */
export async function discoverMainBranch(remote = 'origin', cwd?: string): Promise<string | undefined> {
  const symbolic = await gitTry(['symbolic-ref', `refs/remotes/${remote}/HEAD`], { cwd });
  if (symbolic.code === 0) {
    const ref = symbolic.stdout.trim();
    const prefix = `refs/remotes/${remote}/`;
    if (ref.startsWith(prefix)) return ref.slice(prefix.length);
  }
  for (const candidate of ['main', 'master']) {
    const r = await gitTry(['rev-parse', '--verify', '--quiet', `refs/remotes/${remote}/${candidate}`], {
      cwd,
    });
    if (r.code === 0 && r.stdout.trim() !== '') return candidate;
  }
  for (const candidate of ['main', 'master']) {
    if (await branchExists(candidate, cwd)) return candidate;
  }
  return undefined;
}
