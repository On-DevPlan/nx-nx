// AUTO-GENERATED —— 由 scripts/gen-actions.mjs 生成，勿手改。
//
// 收录本目录下每个文件的 default 导出（一条 action 一个文件）。
// **加一条 action = 新建一个文件 + 跑 `pnpm gen`**；模块的 index.ts 不需要改。
// 新鲜度由 tests/unit/gen-freshness.test.mjs 对账。

import gitAbort from './git-abort.js';
import gitCherryPick from './git-cherry-pick.js';
import gitCleanupHistory from './git-cleanup-history.js';
import gitExtractCommits from './git-extract-commits.js';
import gitForcePush from './git-force-push.js';
import gitInteractive from './git-interactive.js';
import gitMigrateWithMemory from './git-migrate-with-memory.js';
import gitMigrateWorkspace from './git-migrate-workspace.js';
import gitOperations from './git-operations.js';
import gitPrfeat from './git-prfeat.js';
import gitPurgeFiles from './git-purge-files.js';
import gitResolveConflicts from './git-resolve-conflicts.js';
import gitStatus from './git-status.js';

/**
 * 本模块的全部 action。
 *
 * as const：保留字面量元组形状——注册表的编译期查重（重复 id / CLI 路径 / 路由）
 * 依赖它，丢了就只剩运行时兜底。
 */
export const ACTIONS = [
  gitAbort,
  gitCherryPick,
  gitCleanupHistory,
  gitExtractCommits,
  gitForcePush,
  gitInteractive,
  gitMigrateWithMemory,
  gitMigrateWorkspace,
  gitOperations,
  gitPrfeat,
  gitPurgeFiles,
  gitResolveConflicts,
  gitStatus,
] as const;

export { gitAbort };
export { gitCherryPick };
export { gitCleanupHistory };
export { gitExtractCommits };
export { gitForcePush };
export { gitInteractive };
export { gitMigrateWithMemory };
export { gitMigrateWorkspace };
export { gitOperations };
export { gitPrfeat };
export { gitPurgeFiles };
export { gitResolveConflicts };
export { gitStatus };
