// 「查看状态」操作：只读快照，没有任何副作用。
//
// 它同时是交互模式的「现场探测」入口——进入交互模式时先跑一次，
// 让用户一进来就看到当前仓库到底处在什么状态（有没有进行中的操作、有没有冲突）。
import { statusEntries, currentBranch, repoRoot } from '../../../core/git/repo.js';
import { conflictedFiles } from '../../../core/git/conflicts.js';
import { inProgressState } from '../../../core/git/progress.js';
import { listLocalBranches, listRemoteBranches } from '../../../core/git/branches.js';
import { okResult, type GitOperation, type OperationStep } from '../types.js';

export async function collectStatus() {
  const root = await repoRoot();
  const branch = await currentBranch();
  const entries = await statusEntries();
  const conflicts = await conflictedFiles();
  const inProgress = await inProgressState();
  const branches = await listLocalBranches();
  const remoteBranches = await listRemoteBranches();
  return { root, branch, entries, conflicts, inProgress, branches, remoteBranches };
}

export const statusOperation: GitOperation = {
  id: 'status',
  title: '查看仓库状态',
  desc: '当前分支、进行中的操作、冲突、未提交改动与分支清单',
  scenario: '不确定该用哪个操作时，先看这里',
  group: '日常',
  risk: 'normal',
  fields: [],
  run: async () => {
    const s = await collectStatus();
    const steps: OperationStep[] = [
      { name: '仓库', ok: true, detail: s.root },
      { name: '当前分支', ok: true, detail: s.branch || '(游离 HEAD)' },
      {
        name: '进行中的操作',
        ok: s.inProgress.operation === 'none',
        detail: s.inProgress.operation === 'none' ? '无' : s.inProgress.operation,
      },
      {
        name: '冲突文件',
        ok: s.conflicts.length === 0,
        detail: s.conflicts.length === 0 ? '无' : `${s.conflicts.length} 个`,
      },
      {
        name: '未提交改动',
        ok: s.entries.length === 0,
        detail: s.entries.length === 0 ? '工作区干净' : `${s.entries.length} 处`,
      },
    ];
    return okResult(
      s.entries.length === 0 && s.conflicts.length === 0
        ? `${s.branch || 'HEAD'} · 工作区干净`
        : `${s.branch || 'HEAD'} · ${s.entries.length} 处未提交改动`,
      steps,
      {
        root: s.root,
        branch: s.branch,
        inProgress: s.inProgress.operation,
        conflicts: s.conflicts,
        changes: s.entries,
        branches: s.branches,
        remoteBranches: s.remoteBranches,
      }
    );
  },
  cliPreview: () => 'nx-nx git status',
};
