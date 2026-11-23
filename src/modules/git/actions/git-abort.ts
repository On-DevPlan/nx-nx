// git.abort —— 中止进行中的 merge / rebase / cherry-pick / revert / am。
//
// 事务安全契约（照搬 gitlike，且不打折）：
//   **有冲突时不自动中止**——先把中止指南摆出来，人读完再决定。
//   --yes 只跳过「无冲突」那一步的确认；有冲突时必须显式 --force
//   （--force 的含义是「我已读中止指南」）。
import { z } from 'zod';
import { defineAction } from '../../../runtime/types/action.js';
import * as service from '../service.js';
import { formatOperationResult } from '../text.js';

/** git.abort 的入参契约（CLI 与 HTTP 共用同一份）。 */
const input = z.object({
  operation: z
    .enum(['merge', 'rebase', 'cherry-pick', 'revert', 'am'])
    .optional()
    .describe('要中止的操作类型（默认自动探测）'),
  yes: z.boolean().default(false).describe('跳过确认（仅在无冲突时生效）'),
  stash: z.boolean().default(false).describe('中止前先 stash 未提交的改动'),
  discard: z.boolean().default(false).describe('中止后丢弃未提交的改动'),
  force: z.boolean().default(false).describe('已读中止指南，确认在有冲突时强制中止'),
});

export default defineAction({
  id: 'git.abort',
  cli: ['git', 'abort'],
  http: null,
  summary: '中止进行中的 merge / rebase / cherry-pick / revert / am（有冲突时需 --force）',
  flags: {
    operation: { type: 'string', hint: '要中止的操作类型（默认自动探测）' },
    yes: { type: 'boolean', hint: '跳过确认（仅在无冲突时生效）' },
    stash: { type: 'boolean', hint: '中止前先 stash 未提交的改动' },
    discard: { type: 'boolean', hint: '中止后丢弃未提交的改动' },
    force: { type: 'boolean', hint: '已读中止指南，确认在有冲突时强制中止' },
  },
  schema: input,
})(
  async (ctx) =>
    service.runOperation('abort', {
      operation: ctx.operation ?? '',
      yes: ctx.yes ? 'true' : 'false',
      stash: ctx.stash ? 'true' : 'false',
      discard: ctx.discard ? 'true' : 'false',
      force: ctx.force ? 'true' : 'false',
    }),
  (r) => formatOperationResult(r)
);
