// serviceGroup.set —— 创建或整组更新服务组配置（JSON 传入）
//
// 一条 action 一个文件：声明（id/cli/http/summary）、契约（zod schema）与实现同文件。
// 模块 index.ts 不手工列举 action——清单由 `pnpm gen:actions` 生成。
import { defineAction } from '../../../runtime/types/action.js';
import * as service from '../service.js';
import { setInput } from '../schemas.js';

export default defineAction({
  id: 'serviceGroup.set',
  cli: ['sg', 'set'],
  http: ['PUT', '/api/service-groups/:id'],
  summary: '创建或整组更新服务组配置（JSON 传入）',
  args: ['id'],
  flags: {
    config: { type: "string", required: true, hint: "服务组配置 JSON（name/main/stop/killPort/health/shared/clients）" },
  },
  schema: setInput,
})(
  (ctx) => service.setGroup(ctx.id, ctx.config),
  (r) =>
          `已保存服务组 ${r.id}（${r.name}）\n  main: ${r.main?.script ?? '(未配置)'} · health: ${r.health ? r.health.kind + ':' + r.health.port : '无'} · 关闭: mode=${r.stopMode} · clients: ${r.clients.join(', ') || '无'}`
);
