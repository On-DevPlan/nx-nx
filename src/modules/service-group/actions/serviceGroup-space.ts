// serviceGroup.space —— 查看管理空间：方法清单 + 状态堆快照（可 JSON 表示的部分）
//
// 一条 action 一个文件：声明（id/cli/http/summary）、契约（zod schema）与实现同文件。
// 模块 index.ts 不手工列举 action——清单由 `pnpm gen:actions` 生成。
import { defineAction } from '../../../runtime/types/action.js';
import * as service from '../service.js';
import { formatSpace } from '../space-text.js';
import { idInput } from '../schemas.js';

export default defineAction({
  id: 'serviceGroup.space',
  cli: ['sg', 'space'],
  http: ['GET', '/api/service-groups/:id/space'],
  summary: '查看管理空间：方法清单 + 状态堆快照（可 JSON 表示的部分）',
  args: ['id'],
  schema: idInput,
})(
  (ctx) => service.spaceIntrospect(ctx.id),
  (r) => formatSpace(r)
);
