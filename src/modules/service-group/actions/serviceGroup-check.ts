// serviceGroup.check —— 立即执行一次活性检测（端口/HTTP），返回 { alive, detail }
//
// 一条 action 一个文件：声明（id/cli/http/summary）、契约（zod schema）与实现同文件。
// 模块 index.ts 不手工列举 action——清单由 `pnpm gen:actions` 生成。
import { defineAction } from '../../../runtime/types/action.js';
import * as service from '../service.js';
import { idInput } from '../schemas.js';

export default defineAction({
  id: 'serviceGroup.check',
  cli: ['sg', 'check'],
  http: ['GET', '/api/service-groups/:id/alive'],
  summary: '立即执行一次活性检测（端口/HTTP），返回 { alive, detail }',
  args: ['id'],
  schema: idInput,
})(
  (ctx) => service.check(ctx.id),
  (r) => `${r.alive ? '✔ 活' : '✘ 失活'}  ${r.detail}`
);
