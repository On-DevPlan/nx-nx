// script.read —— 读取脚本源码
//
// 一条 action 一个文件：声明（id/cli/http/summary）、契约（zod schema）与实现同文件。
// 模块 index.ts 不手工列举 action——清单由 `pnpm gen:actions` 生成。
import { defineAction } from '../../../runtime/types/action.js';
import * as service from '../../../core/script/service.js';

export default defineAction({
  id: 'script.read',
  cli: ['script', 'read'],
  http: ['GET', '/api/scripts/:name/content'],
  summary: '读取脚本源码',
  args: ['name'],
})(
  (ctx) => service.readScript(ctx.name),
  (r) => r.content
);
