// serviceGroup.stop —— 关闭服务：按 stopMode 走（auto=关停脚本→杀端口→杀 pid；script/port/pid 只走单条）
//
// 一条 action 一个文件：声明（id/cli/http/summary）、契约（zod schema）与实现同文件。
// 模块 index.ts 不手工列举 action——清单由 `pnpm gen:actions` 生成。
import { defineAction } from '../../../runtime/types/action.js';
import * as service from '../service.js';
import { stopInput } from '../schemas.js';

export default defineAction({
  id: 'serviceGroup.stop',
  cli: ['sg', 'stop'],
  http: ['POST', '/api/service-groups/:id/stop'],
  summary: '关闭服务：按 stopMode 走（auto=关停脚本→杀端口→杀 pid；script/port/pid 只走单条）',
  args: ['id'],
  flags: {
    mode: { type: 'string', hint: '本次覆盖 stopMode: auto | script | port | pid' },
  },
  schema: stopInput,
})(
  (ctx) => service.stop(ctx.id, ctx.mode),
  (r) => `已关闭（mode=${r.mode}）：${r.detail}`
);
