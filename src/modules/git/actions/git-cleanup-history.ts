// git.cleanup-history —— 幽灵镜像清理历史（危险）。
//
// 契约：保留标题 / 作者 / 邮箱 / 日期 / 拓扑，把每个 commit 的文件树换成
// 一个 rewrite.txt；末尾追加 2 个 commit（删 placeholder + 注入当前快照）。
// 执行前强制备份 .git，每阶段失败都把备份路径带出来。
import { z } from 'zod';
import { defineAction } from '../../../runtime/types/action.js';
import * as service from '../service.js';
import { formatOperationResult } from '../text.js';

/** git.cleanup-history 的入参契约（CLI 与 HTTP 共用同一份）。 */
const input = z.object({
  'main-branch': z.string().trim().optional().describe('主分支（默认自动发现）'),
  limit: z.coerce.number().int().min(0).max(100000).default(50).describe('幽灵化的提交数量上限（0 = 全部）'),
  message: z.string().trim().optional().describe('快照 commit 消息'),
  remote: z.string().trim().default('origin').describe('远程名'),
  push: z.boolean().default(false).describe('最后强制推送到远程'),
  'keep-untracked': z.boolean().default(false).describe('快照一并提交未追踪文件'),
  yes: z.boolean().default(false).describe('跳过中间确认（推送仍需 FORCE-PUSH）'),
});

export default defineAction({
  id: 'git.cleanupHistory',
  cli: ['git', 'cleanup-history'],
  http: null,
  summary: '幽灵镜像清理历史：保留标题/作者/时间/拓扑，把内容换成 rewrite.txt（危险）',
  flags: {
    'main-branch': { type: 'string', hint: '主分支（默认自动发现）' },
    limit: { type: 'number', default: 50, hint: '幽灵化的提交数量上限（0 = 全部）' },
    message: { type: 'string', hint: '快照 commit 消息' },
    remote: { type: 'string', default: 'origin', hint: '远程名' },
    push: { type: 'boolean', hint: '最后强制推送到远程' },
    'keep-untracked': { type: 'boolean', hint: '快照一并提交未追踪文件' },
    yes: { type: 'boolean', hint: '跳过中间确认（推送仍需 FORCE-PUSH）' },
  },
  schema: input,
})(
  async (ctx) =>
    service.runOperation('cleanup-history', {
      'main-branch': ctx['main-branch'] ?? '',
      limit: String(ctx.limit),
      message: ctx.message ?? '',
      remote: ctx.remote,
      push: ctx.push ? 'true' : 'false',
      'keep-untracked': ctx['keep-untracked'] ? 'true' : 'false',
      yes: ctx.yes ? 'true' : 'false',
    }),
  (r) => formatOperationResult(r)
);
