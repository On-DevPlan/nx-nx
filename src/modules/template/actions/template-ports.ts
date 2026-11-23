// template.ports —— 探测可用的本机端口（供 serve / vite 使用）
//
// 一条 action 一个文件：声明（id/cli/http/summary）、契约（zod schema）与实现同文件。
// 模块 index.ts 不手工列举 action——清单由 `pnpm gen:actions` 生成。
import { defineAction } from '../../../runtime/types/action.js';
import * as service from '../service.js';

export default defineAction({
  id: 'template.ports',
  cli: ['template', 'ports'],
  http: ['GET', '/api/ports'],
  summary: '探测可用的本机端口（供 serve / vite 使用）',
  flags: { start: { type: 'number' }, count: { type: 'number', default: 4 } },
})(
  (ctx) =>
          service
            .probePorts({ start: ctx.start || service.FAMILY_PORT_START, count: ctx.count || 4 })
            .then((ports) => ({ status: 'ok', ports })),
  (r) => r.ports.join('\n')
);
