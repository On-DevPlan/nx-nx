// git.migrate-workspace —— 把工作区迁移到目标分支。
//
// 流程：临时 commit → 切到目标分支 → merge --squash → reset --mixed。
// 不产生新 commit，目标分支上保留的是「工作区内容」而非一条提交。
import { z } from 'zod';
import { defineAction } from '../../../runtime/types/action.js';
import * as service from '../service.js';
import { formatOperationResult } from '../text.js';

/** git.migrate-workspace 的入参契约（CLI 与 HTTP 共用同一份）。 */
const input = z.object({
  branch: z
    .string()
    .trim()
    .min(1, '分支名不能为空')
    .regex(/^[A-Za-z0-9._/-]+$/, '分支名只能包含字母、数字与 - _ . /')
    .describe('目标分支名；不存在会自动创建'),
  commit: z.string().trim().optional().describe('临时 commit 消息（仅在工作区有改动时用）'),
});

export default defineAction({
  id: 'git.migrateWorkspace',
  cli: ['git', 'migrate-workspace'],
  http: null,
  summary: '把工作区迁移到目标分支（临时 commit → 切分支 → squash merge → 清暂存区）',
  flags: {
    branch: { type: 'string', hint: '目标分支名' },
    commit: { type: 'string', hint: '临时 commit 消息' },
  },
  schema: input,
})(
  async (ctx) =>
    service.runOperation('migrate-workspace', {
      branch: ctx.branch,
      commit: ctx.commit ?? '',
    }),
  (r) => formatOperationResult(r)
);
