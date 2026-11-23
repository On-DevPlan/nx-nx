// git.cherry-pick —— 从源分支挑一个提交 cherry-pick 到当前分支。
import { z } from 'zod';
import { defineAction } from '../../../runtime/types/action.js';
import * as service from '../service.js';
import { formatOperationResult } from '../text.js';

/** git.cherry-pick 的入参契约（CLI 与 HTTP 共用同一份）。 */
const input = z.object({
  source: z.string().trim().min(1, '源分支不能为空').describe('要从中挑提交的分支'),
  commit: z.string().trim().min(7, '请给出至少 7 位提交 hash').describe('要 cherry-pick 的提交'),
  all: z.boolean().default(false).describe('列出源分支全部提交（提示用）'),
});

export default defineAction({
  id: 'git.cherry-pick',
  cli: ['git', 'cherry-pick'],
  http: null,
  summary: '从源分支挑一个提交 cherry-pick 到当前分支',
  flags: {
    source: { type: 'string', hint: '源分支' },
    commit: { type: 'string', hint: '提交 hash' },
    all: { type: 'boolean', hint: '列出源分支全部提交（提示用）' },
  },
  schema: input,
})(
  async (ctx) =>
    service.runOperation('cherry-pick', {
      source: ctx.source,
      commit: ctx.commit,
      all: ctx.all ? 'true' : 'false',
    }),
  (r) => formatOperationResult(r)
);
