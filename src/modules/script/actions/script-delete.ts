// script.delete —— 删除脚本并从 manifest 移除
//
// 一条 action 一个文件：声明（id/cli/http/summary）、契约（zod schema）与实现同文件。
// 模块 index.ts 不手工列举 action——清单由 `pnpm gen:actions` 生成。
import { defineAction } from '../../../runtime/types/action.js';
import * as service from '../../../core/script/service.js';

export default defineAction({
  id: 'script.delete',
  cli: [
    ['script', 'delete'],
    ['script', 'rm'],
  ],
  http: ['DELETE', '/api/scripts/:name'],
  summary: '删除脚本并从 manifest 移除',
  args: ['name'],
})(
  (ctx) => service.deleteScript(ctx.name),
  (r) => `已删除: ${r.path}`
);
