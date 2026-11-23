// git.force-push —— 强推本地分支到远程分支，再把本地分支改名成远程分支名（危险）。
//
// 流程：备份本地目的分支 → 强推（带 lease）→ 清理工作区 → 删旧名 → 改名。
// 备份分支名形如 <remote>-bak-HHMMSS，出事可回。
import { z } from 'zod';
import { defineAction } from '../../../runtime/types/action.js';
import * as service from '../service.js';
import { formatOperationResult } from '../text.js';

/** git.force-push 的入参契约（CLI 与 HTTP 共用同一份）。 */
const input = z.object({
  local: z.string().trim().optional().describe('本地分支（默认当前分支）'),
  remote: z
    .string()
    .trim()
    .min(1, '远程分支名不能为空')
    .regex(/^[A-Za-z0-9._/-]+$/, '分支名只能包含字母、数字与 - _ . /')
    .describe('远程分支名'),
  yes: z.boolean().default(false).describe('跳过确认'),
});

export default defineAction({
  id: 'git.forcePush',
  cli: ['git', 'force-push'],
  http: null,
  summary: '强推本地分支到远程分支，再把本地分支改名成远程分支名（危险）',
  flags: {
    local: { type: 'string', hint: '本地分支（默认当前分支）' },
    remote: { type: 'string', hint: '远程分支名' },
    yes: { type: 'boolean', hint: '跳过确认' },
  },
  schema: input,
})(
  async (ctx) =>
    service.runOperation('force-push', {
      local: ctx.local ?? '',
      remote: ctx.remote,
      yes: ctx.yes ? 'true' : 'false',
    }),
  (r) => formatOperationResult(r)
);
