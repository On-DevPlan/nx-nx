// serviceGroup.start —— 启动主脚本（detached + 日志重定向；--entry 选择一条启动脚本 / 版本）
//
// 一条 action 一个文件：声明（id/cli/http/summary）、契约（zod schema）与实现同文件。
// 模块 index.ts 不手工列举 action——清单由 `pnpm gen:actions` 生成。
import { defineAction } from '../../../runtime/types/action.js';
import * as service from '../service.js';
import { startInput } from '../schemas.js';

export default defineAction({
  id: 'serviceGroup.start',
  cli: ['sg', 'start'],
  http: ['POST', '/api/service-groups/:id/start'],
  summary: '启动主脚本（detached + 日志重定向；--entry 选择一条启动脚本 / 版本）',
  args: ['id'],
  flags: {
    entry: { type: 'string', hint: '启动脚本版本名，如 预发；留空用上次或列表第一条' },
  },
  schema: startInput,
})(
  (ctx) => service.start(ctx.id, ctx.entry),
  (r) => (r.started ? `已启动 (pid ${r.pid})\n  日志: ${r.logFile}` : `未重复启动：${r.detail}`)
);
