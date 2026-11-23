// git.extract-commits —— 把当前分支独有的提交抽到 feat-<名字>，再 squash 合并回主分支。
//
// 终点状态：主分支历史 = 起点 + 1 个 squash commit，工作树包含全部业务变更；
// 特性分支保留原始的若干提交，便于单独推送 / 开 PR。
import { z } from 'zod';
import { defineAction } from '../../../runtime/types/action.js';
import * as service from '../service.js';
import { formatOperationResult } from '../text.js';

/** git.extract-commits 的入参契约（CLI 与 HTTP 共用同一份）。 */
const input = z.object({
  name: z
    .string()
    .trim()
    .min(1, '特性名字不能为空')
    .regex(/^[A-Za-z0-9._-]+$/, '特性名字只能包含字母、数字与 - _ .')
    .describe('特性名字（英文）；会生成 feat-<名字>'),
  from: z.string().trim().optional().describe('提取起点 hash（默认 origin/<当前分支>）'),
  base: z.string().trim().optional().describe('远程基准分支'),
  yes: z.boolean().default(false).describe('跳过确认直接执行'),
});

export default defineAction({
  id: 'git.extractCommits',
  cli: ['git', 'extract-commits'],
  http: null,
  summary: '把当前分支独有的提交抽到 feat-<名字>，再 squash 合并回主分支',
  flags: {
    name: { type: 'string', hint: '特性名字（英文）' },
    from: { type: 'string', hint: '提取起点 hash（默认 origin/<当前分支>）' },
    base: { type: 'string', hint: '远程基准分支' },
    yes: { type: 'boolean', hint: '跳过确认直接执行' },
  },
  schema: input,
})(
  async (ctx) =>
    service.runOperation('extract-commits', {
      name: ctx.name,
      from: ctx.from ?? '',
      base: ctx.base ?? '',
      yes: ctx.yes ? 'true' : 'false',
    }),
  (r) => formatOperationResult(r)
);
