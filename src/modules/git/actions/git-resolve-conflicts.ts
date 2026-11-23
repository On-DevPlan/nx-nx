// git.resolve-conflicts —— 按 ours / theirs 策略批量 checkout + add 冲突文件。
//
// 混合冲突类型（UU + DD 同时存在）拒绝统一策略：不同类型的正确处理方式不同，
// 一刀切会丢内容。此时只给冲突类型说明文档，不动任何文件。
import { z } from 'zod';
import { defineAction } from '../../../runtime/types/action.js';
import * as service from '../service.js';
import { formatOperationResult } from '../text.js';

/** git.resolve-conflicts 的入参契约（CLI 与 HTTP 共用同一份）。 */
const input = z.object({
  strategy: z.enum(['ours', 'theirs']).describe('ours = 当前分支版本；theirs = 被合并分支版本'),
  files: z.array(z.string().trim().min(1)).default([]).describe('要解决的文件（逗号分隔）'),
  all: z.boolean().default(false).describe('一次解决全部冲突文件'),
  yes: z.boolean().default(false).describe('跳过确认直接执行'),
});

export default defineAction({
  id: 'git.resolveConflicts',
  cli: [
    ['git', 'resolve-conflicts'],
    ['git', 'conflict'],
  ],
  http: null,
  summary: '批量解决冲突：按 ours / theirs 策略 checkout + add',
  flags: {
    strategy: { type: 'string', hint: 'ours = 当前分支版本；theirs = 被合并分支版本' },
    files: { type: 'array', hint: '要解决的文件（逗号分隔）' },
    all: { type: 'boolean', hint: '一次解决全部冲突文件' },
    yes: { type: 'boolean', hint: '跳过确认直接执行' },
  },
  schema: input,
})(
  async (ctx) =>
    service.runOperation('resolve-conflicts', {
      strategy: ctx.strategy,
      files: ctx.files,
      all: ctx.all ? 'true' : 'false',
      yes: ctx.yes ? 'true' : 'false',
    }),
  (r) => formatOperationResult(r)
);
