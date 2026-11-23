// serviceGroup.show —— 查看服务组配置与运行态详情
//
// 一条 action 一个文件：声明（id/cli/http/summary）、契约（zod schema）与实现同文件。
// 模块 index.ts 不手工列举 action——清单由 `pnpm gen:actions` 生成。
import { defineAction } from '../../../runtime/types/action.js';
import * as service from '../service.js';
import { formatGroupShow } from '../group-text.js';
import { idInput } from '../schemas.js';

export default defineAction({
  id: 'serviceGroup.show',
  cli: ['sg', 'show'],
  http: ['GET', '/api/service-groups/:id'],
  summary: '查看服务组配置与运行态详情',
  args: ['id'],
  schema: idInput,
})(
  (ctx) => service.showGroup(ctx.id),
  (r) => formatGroupShow(r)
);
