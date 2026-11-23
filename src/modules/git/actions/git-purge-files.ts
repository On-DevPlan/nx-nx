// git.purge-files —— 从历史里清除指定文件（危险）。
//
// 用法有两种，一种安全一种危险，差别只在 --files：
//   nx-nx git purge-files --pattern '\.(docx|mp4)$'
//     → 只扫描快照、列出匹配文件与大小，**不动历史**（安全，可以随便敲）
//   nx-nx git purge-files --pattern '\.(docx|mp4)$' --files 'a.docx,b.mp4' --force
//     → 把这些文件从「创建点往后」的整段历史里删掉（重写历史，必须显式 --force）
//
// 重写前强制备份 .git；每阶段失败都把备份路径带出来。
import { z } from 'zod';
import { defineAction } from '../../../runtime/types/action.js';
import * as service from '../service.js';
import { formatOperationResult } from '../text.js';

/** git.purge-files 的入参契约（CLI 与 HTTP 共用同一份）。 */
const input = z.object({
  base: z.string().trim().default('HEAD').describe('快照 commit（默认当前 HEAD）'),
  pattern: z
    .string()
    .trim()
    .default('\\.(docx|mp4|exe)$')
    .describe('文件路径正则（忽略大小写）'),
  files: z.array(z.string().trim()).optional().describe('要清除的文件路径；留空则只列清单'),
  scope: z
    .enum(['all', 'branch'])
    .default('all')
    .describe('重写范围：all=所有分支与标签（彻底清除）；branch=仅当前分支'),
  'keep-empty': z.boolean().default(false).describe('保留因清除文件而变空的提交'),
  push: z.boolean().default(false).describe('最后强制推送到远程（分支与标签一起）'),
  gc: z.boolean().default(true).describe('回收磁盘空间（删掉旧对象）'),
  force: z.boolean().default(false).describe('确认重写历史（危险操作必须显式加）'),
});

export default defineAction({
  id: 'git.purgeFiles',
  cli: ['git', 'purge-files'],
  http: null,
  summary:
    '从历史里清除文件：按正则找出快照里的文件与大小，选中后重写「创建点往后」的全部历史（危险）',
  flags: {
    base: { type: 'string', default: 'HEAD', hint: '快照 commit（默认当前 HEAD）' },
    pattern: { type: 'string', default: '\\.(docx|mp4|exe)$', hint: '文件路径正则' },
    files: { type: 'array', hint: '要清除的文件（逗号分隔）；留空只列清单' },
    scope: { type: 'string', default: 'all', enum: ['all', 'branch'], hint: '重写范围' },
    'keep-empty': { type: 'boolean', hint: '保留因清除文件而变空的提交' },
    push: { type: 'boolean', hint: '最后强制推送到远程（分支与标签一起）' },
    gc: { type: 'boolean', default: true, hint: '回收磁盘空间' },
    force: { type: 'boolean', hint: '确认重写历史' },
  },
  schema: input,
})(
  async (ctx) =>
    service.runOperation('purge-files', {
      base: ctx.base,
      pattern: ctx.pattern,
      files: ctx.files ?? [],
      scope: ctx.scope,
      'keep-empty': ctx['keep-empty'] ? 'true' : 'false',
      push: ctx.push ? 'true' : 'false',
      gc: ctx.gc ? 'true' : 'false',
      force: ctx.force ? 'true' : 'false',
    }),
  (r) => formatOperationResult(r)
);
