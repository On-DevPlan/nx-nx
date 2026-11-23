// 操作注册表：git 模块的全部能力在这里汇合。
//
// 一条操作 = 一组字段声明 + 一个 run 实现 + 一句等价 CLI。
// 直连 CLI（nx-nx git <id> --flags）与交互模式（nx-nx git i）跑的是**同一个 run**，
// 所以两条路径不可能跑偏——这是本模块最重要的一条结构性保证。
import { statusOperation } from './status.js';
import { cherryPickOperation, prfeatOperation } from './branch.js';
import { abortOperationSpec, resolveConflictsOperation } from './conflict.js';
import {
  extractCommitsOperation,
  migrateWithMemoryOperation,
  migrateWorkspaceOperation,
} from './migrate.js';
import { cleanupHistoryOperation, forcePushOperation } from './history.js';
import { purgeFilesOperation } from './purge.js';
import type { GitOperation } from '../types.js';

export const OPERATIONS: GitOperation[] = [
  statusOperation,
  prfeatOperation,
  cherryPickOperation,
  abortOperationSpec,
  resolveConflictsOperation,
  migrateWorkspaceOperation,
  migrateWithMemoryOperation,
  extractCommitsOperation,
  purgeFilesOperation,
  cleanupHistoryOperation,
  forcePushOperation,
];

export function findOperation(id: string): GitOperation | undefined {
  return OPERATIONS.find((op) => op.id === id);
}

/** 操作分组（交互式列表按这个顺序展示）。 */
export const OPERATION_GROUPS = ['日常', '分支', '冲突', '迁移', '历史'] as const;
