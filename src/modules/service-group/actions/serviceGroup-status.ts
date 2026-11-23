// serviceGroup.status —— 查看运行态快照（不带 id 看全部）
//
// 一条 action 一个文件：声明（id/cli/http/summary）、契约（zod schema）与实现同文件。
// 模块 index.ts 不手工列举 action——清单由 `pnpm gen:actions` 生成。
import { defineAction } from '../../../runtime/types/action.js';
import * as service from '../service.js';
import { statusInput } from '../schemas.js';

export default defineAction({
  id: 'serviceGroup.status',
  cli: ['sg', 'status'],
  http: ['GET', '/api/service-groups-runtime'],
  summary: '查看运行态快照（不带 id 看全部）',
  args: [{ name: 'id', required: false }],
  schema: statusInput,
})(
  (ctx) => service.status(ctx.id),
  (r) => JSON.stringify(r, null, 2)
);
