// git.status —— 查看仓库状态：分支、进行中的操作、冲突、未提交改动。
//
// 一条 action 一个文件：声明（id/cli/http/summary）、契约（zod schema）与实现同文件。
// 模块 index.ts 不手工列举 action——清单由 `pnpm gen:actions` 扫本目录生成。
import { z } from 'zod';
import { defineAction } from '../../../runtime/types/action.js';
import * as service from '../service.js';
import { formatStatus } from '../text.js';

/** git.status 的入参契约（CLI 与 HTTP 共用同一份）。 */
const input = z.object({});

export default defineAction({
  id: 'git.status',
  cli: ['git', 'status'],
  http: ['GET', '/api/git/status'],
  summary: '查看仓库状态：分支、进行中的操作、冲突、未提交改动',
  schema: input,
})(async () => service.runOperation('status'), (r) => formatStatus(r));
