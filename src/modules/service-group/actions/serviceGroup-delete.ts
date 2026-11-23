// serviceGroup.delete —— 删除服务组（先停止运行中的服务）
//
// 一条 action 一个文件：声明（id/cli/http/summary）、契约（zod schema）与实现同文件。
// 模块 index.ts 不手工列举 action——清单由 `pnpm gen:actions` 生成。
import { defineAction } from '../../../runtime/types/action.js';
import * as service from '../service.js';
import { idInput } from '../schemas.js';

export default defineAction({
  id: 'serviceGroup.delete',
  cli: ['sg', 'delete'],
  http: ['DELETE', '/api/service-groups/:id'],
  summary: '删除服务组（先停止运行中的服务）',
  args: ['id'],
  schema: idInput,
})(
  (ctx) => service.deleteGroup(ctx.id),
  (r) => `已删除服务组 ${r.id}（${r.stopped}）`
);
