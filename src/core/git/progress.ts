// 进行中的 git 操作：探测与中止。
//
// git 本身没有「现在在做什么操作」这条命令——gitlike 用哨兵文件自己探测，
// 这是它真正的自研价值之一，本实现原样保留：
//
//   merge        → .git/MERGE_HEAD
//   rebase       → .git/rebase-merge（交互式）或 .git/rebase-apply
//   cherry-pick  → .git/CHERRY_PICK_HEAD
//   revert       → .git/REVERT_HEAD
//   am           → .git/rebase-apply/applying 或 .git/rebase-apply/patch
//
// 多个同时存在说明状态重叠（罕见），必须让人手动处理，不能自动挑一个。
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { git, gitTry } from './exec.js';
import { gitDir } from './repo.js';

export type InProgressOperation = 'none' | 'merge' | 'rebase' | 'cherry-pick' | 'revert' | 'am';

export interface InProgressState {
  /** 多个操作并存时用逗号连接（'merge,rebase'） */
  operation: InProgressOperation | string;
  /** 目标（commit hash 或分支名），可能为空 */
  target: string;
  /** 检测到的操作列表（拆开后的） */
  operations: InProgressOperation[];
}

/** 各操作对应的中止命令——中止前要告诉用户确切敲什么。 */
export const ABORT_COMMANDS: Record<string, string> = {
  merge: 'git merge --abort',
  rebase: 'git rebase --abort',
  'cherry-pick': 'git cherry-pick --abort',
  revert: 'git revert --abort',
  am: 'git am --abort',
};

export function abortCommandOf(operation: string): string {
  return ABORT_COMMANDS[operation] ?? 'git <operation> --abort';
}

async function gitPath(name: string, cwd?: string): Promise<string> {
  const out = await git(['rev-parse', '--git-path', name], { cwd });
  return out.trim();
}

export async function isMergeInProgress(cwd?: string): Promise<boolean> {
  return existsSync(await gitPath('MERGE_HEAD', cwd));
}

export async function isRebaseInProgress(cwd?: string): Promise<boolean> {
  const merge = await gitPath('rebase-merge', cwd);
  const apply = await gitPath('rebase-apply', cwd);
  return existsSync(merge) || existsSync(apply);
}

export async function isCherryPickInProgress(cwd?: string): Promise<boolean> {
  return existsSync(await gitPath('CHERRY_PICK_HEAD', cwd));
}

export async function isRevertInProgress(cwd?: string): Promise<boolean> {
  return existsSync(await gitPath('REVERT_HEAD', cwd));
}

export async function isAmInProgress(cwd?: string): Promise<boolean> {
  const apply = await gitPath('rebase-apply', cwd);
  return existsSync(join(apply, 'applying')) || existsSync(join(apply, 'patch'));
}

/** 探测当前进行中的操作。 */
export async function inProgressState(cwd?: string): Promise<InProgressState> {
  const operations: InProgressOperation[] = [];
  const targets: string[] = [];

  if (await isMergeInProgress(cwd)) {
    operations.push('merge');
    const r = await gitTry(['rev-parse', 'MERGE_HEAD'], { cwd });
    targets.push(r.code === 0 ? r.stdout.trim() : '');
  }
  if (await isRebaseInProgress(cwd)) {
    operations.push('rebase');
    const path = await gitPath('rebase-merge/head-name', cwd);
    targets.push(existsSync(path) ? readHeadName(path) : '');
  }
  if (await isCherryPickInProgress(cwd)) {
    operations.push('cherry-pick');
    const r = await gitTry(['rev-parse', 'CHERRY_PICK_HEAD'], { cwd });
    targets.push(r.code === 0 ? r.stdout.trim() : '');
  }
  if (await isRevertInProgress(cwd)) {
    operations.push('revert');
    const r = await gitTry(['rev-parse', 'REVERT_HEAD'], { cwd });
    targets.push(r.code === 0 ? r.stdout.trim() : '');
  }
  if (await isAmInProgress(cwd)) {
    operations.push('am');
    targets.push('');
  }

  if (operations.length === 0) {
    return { operation: 'none', target: '', operations: [] };
  }
  return {
    operation: operations.join(','),
    target: targets.join(','),
    operations,
  };
}

function readHeadName(path: string): string {
  try {
    return readFileSync(path, 'utf8').trim();
  } catch {
    return '';
  }
}

/** 执行中止。 */
export async function abortOperation(operation: InProgressOperation, cwd?: string): Promise<void> {
  switch (operation) {
    case 'merge':
      await git(['merge', '--abort'], { cwd });
      return;
    case 'rebase':
      await git(['rebase', '--abort'], { cwd });
      return;
    case 'cherry-pick':
      await git(['cherry-pick', '--abort'], { cwd });
      return;
    case 'revert':
      await git(['revert', '--abort'], { cwd });
      return;
    case 'am':
      await git(['am', '--abort'], { cwd });
      return;
    default:
      throw new Error(`不支持的中止操作: ${operation}`);
  }
}

/** .git 目录（供 merge-state 备份使用）。 */
export async function absoluteGitDir(cwd?: string): Promise<string> {
  return gitDir(cwd);
}
