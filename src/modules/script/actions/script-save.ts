// script.save —— 保存脚本源码（先写临时文件再改名）
//
// 一条 action 一个文件：声明（id/cli/http/summary）、契约（zod schema）与实现同文件。
// 模块 index.ts 不手工列举 action——清单由 `pnpm gen:actions` 生成。
import { defineAction } from '../../../runtime/types/action.js';
import * as service from '../../../core/script/service.js';

export default defineAction({
  id: 'script.save',
  cli: ['script', 'save'],
  http: ['PUT', '/api/scripts/:name/content'],
  summary: '保存脚本源码（先写临时文件再改名）',
  args: ['name'],
  flags: {
    content: { type: 'string', required: true, hint: '脚本全文' },
  },
})(
  (ctx) => service.saveScript(ctx.name, ctx.content),
  (r) => `已保存: ${r.path}`
);
