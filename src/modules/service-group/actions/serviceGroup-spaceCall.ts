// serviceGroup.spaceCall —— 调用管理空间的一个方法（--method 名，--args JSON 数组）
//
// 一条 action 一个文件：声明（id/cli/http/summary）、契约（zod schema）与实现同文件。
// 模块 index.ts 不手工列举 action——清单由 `pnpm gen:actions` 生成。
import { defineAction } from '../../../runtime/types/action.js';
import * as service from '../service.js';
import { formatSpaceCall } from '../space-text.js';
import { spaceCallInput } from '../schemas.js';

export default defineAction({
  id: 'serviceGroup.spaceCall',
  cli: ['sg', 'space-call'],
  http: ['POST', '/api/service-groups/:id/space-call'],
  summary: '调用管理空间的一个方法（--method 名，--args JSON 数组）',
  args: ['id'],
  flags: {
    method: { type: 'string', required: true, hint: '要调用的方法名' },
    args: { type: 'string', hint: '参数（JSON 数组，如 ["demo-group"]）' },
  },
  schema: spaceCallInput,
})(
  (ctx) => {
          let parsed: unknown[] = [];
          if (ctx.args) {
            try {
              const v = JSON.parse(ctx.args);
              parsed = Array.isArray(v) ? v : [v];
            } catch (err) {
              throw new Error(`--args 不是合法 JSON: ${err instanceof Error ? err.message : String(err)}`);
            }
          }
          return service.spaceCall(ctx.id, ctx.method, parsed);
        },
  (r) => formatSpaceCall(r)
);
