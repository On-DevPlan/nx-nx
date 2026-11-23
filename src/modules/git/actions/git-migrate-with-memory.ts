// git.migrate-with-memory —— 基于 merge-base 建新分支，并按参考分支过滤暂存区。
//
// 「带记忆」的含义：新分支从 base 与 reference 的**共同祖先**长出来，
// 因此保留了 reference 已有的文件；合并进来的变更里，只有 reference 里
// 也存在的文件才留在暂存区，其余取消暂存让用户自己处理。
import { z } from 'zod';
import { defineAction } from '../../../runtime/types/action.js';
import * as service from '../service.js';
import { formatOperationResult } from '../text.js';

/** git.migrate-with-memory 的入参契约（CLI 与 HTTP 共用同一份）。 */
const input = z.object({
  'new-branch': z
    .string()
    .trim()
    .min(1, '新分支名不能为空')
    .regex(/^[A-Za-z0-9._/-]+$/, '分支名只能包含字母、数字与 - _ . /')
    .describe('新分支名'),
  base: z.string().trim().optional().describe('基础分支（默认当前分支）'),
  reference: z.string().trim().optional().describe('参考分支（按它的文件清单过滤暂存区）'),
  yes: z.boolean().default(false).describe('跳过确认'),
});

export default defineAction({
  id: 'git.migrateWithMemory',
  cli: ['git', 'migrate-with-memory'],
  http: null,
  summary: '基于 merge-base 建新分支，并按参考分支过滤暂存区',
  flags: {
    'new-branch': { type: 'string', hint: '新分支名' },
    base: { type: 'string', hint: '基础分支（默认当前分支）' },
    reference: { type: 'string', hint: '参考分支（按它的文件清单过滤暂存区）' },
    yes: { type: 'boolean', hint: '跳过确认' },
  },
  schema: input,
})(
  async (ctx) =>
    service.runOperation('migrate-with-memory', {
      'new-branch': ctx['new-branch'],
      base: ctx.base ?? '',
      reference: ctx.reference ?? '',
      yes: ctx.yes ? 'true' : 'false',
    }),
  (r) => formatOperationResult(r)
);
