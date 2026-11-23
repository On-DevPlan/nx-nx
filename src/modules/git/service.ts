// git 模块的业务 facade：CLI / HTTP / 交互式共用同一份实现。
//
// 分层规则（与仓库其他模块一致）：
//   core/git/**   —— 只做 git 命令与仓库状态的读取
//   modules/git/** —— 业务编排、输入契约、展示
//
// 这里做三件事：
//   1. 采集仓库现场（RepoContext）；
//   2. 按操作 id 执行（直连 CLI 与交互式都走这里）；
//   3. 提供非交互场景下的只读快照（--json / 管道 / CI）。
import { badInput } from '../../core/errors/index.js';
import { conflictedFiles } from '../../core/git/conflicts.js';
import { inProgressState } from '../../core/git/progress.js';
import { listLocalBranches, listRemoteBranches } from '../../core/git/branches.js';
import { currentBranch, isGitRepo, repoRoot } from '../../core/git/repo.js';
import { OPERATIONS, findOperation } from './ops/index.js';
import type {
  FieldValue,
  GitOperation,
  InteractiveSnapshot,
  OperationResult,
  RepoContext,
} from './types.js';

/** 采集仓库现场。不在仓库里就抛输入错误。 */
export async function repoContext(): Promise<RepoContext> {
  if (!(await isGitRepo())) {
    throw badInput('当前目录不是 git 仓库（Not a git repository）');
  }
  const [root, branch, branches, remoteBranches, inProgress, conflicts] = await Promise.all([
    repoRoot(),
    currentBranch(),
    listLocalBranches(),
    listRemoteBranches(),
    inProgressState(),
    conflictedFiles(),
  ]);
  return {
    root,
    branch,
    branches,
    remoteBranches,
    inProgress,
    conflicts,
    clean: conflicts.length === 0,
  };
}

export function listOperations(): GitOperation[] {
  return OPERATIONS;
}

export function operationMeta() {
  return OPERATIONS.map((op) => ({
    id: op.id,
    title: op.title,
    desc: op.desc,
    scenario: op.scenario,
    group: op.group,
    risk: op.risk,
    cli: `nx-nx git ${op.id}`,
    fields: op.fields.map((f) => ({
      name: f.name,
      label: f.label,
      kind: f.kind,
      required: Boolean(f.required),
      default: f.default,
      hint: f.hint,
    })),
    confirmText: op.confirmText,
  }));
}

/** 按操作 id 执行。CLI 与交互式共用。 */
export async function runOperation(
  id: string,
  values: Record<string, FieldValue> = {}
): Promise<OperationResult> {
  const op = findOperation(id);
  if (!op) {
    throw badInput(
      `未知操作: ${id}。可用操作: ${OPERATIONS.map((o) => o.id).join(' / ')}`
    );
  }
  const repo = await repoContext();
  return op.run(values, repo);
}

/** 只读快照：非 TTY / --json 时 `git i` 的降级输出。 */
export async function interactiveSnapshot(): Promise<InteractiveSnapshot> {
  const repo = await repoContext();
  return {
    mode: 'snapshot' as const,
    hint: '非交互环境：请用 nx-nx git <操作> --参数 直接执行；下面是可用的操作。',
    repo: {
      root: repo.root,
      branch: repo.branch,
      inProgress: repo.inProgress.operation,
      conflicts: repo.conflicts.map((c) => c.path),
      branches: repo.branches,
      remoteBranches: repo.remoteBranches.map((r) => r.full),
    },
    operations: operationMeta(),
  };
}
