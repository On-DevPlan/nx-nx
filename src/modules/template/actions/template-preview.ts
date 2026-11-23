// template.preview —— 预览将生成的文件清单（不写盘）
//
// 一条 action 一个文件：声明（id/cli/http/summary）、契约（zod schema）与实现同文件。
// 模块 index.ts 不手工列举 action——清单由 `pnpm gen:actions` 生成。
import { defineAction } from '../../../runtime/types/action.js';
import { collectOptions } from '../options.js';
import * as service from '../service.js';

export default defineAction({
  id: 'template.preview',
  cli: ['template', 'preview'],
  http: ['POST', '/api/templates/:id/preview'],
  summary: '预览将生成的文件清单（不写盘）',
  args: ['id'],
  openFlags: true,
  flags: { dir: { type: 'string' }, set: { type: 'string' } },
})(
  async (ctx) => {
          const d = await service.describe(ctx.id);
          const options = collectOptions(ctx, d.template.options || []);
          // dir 走 options（与 create 同形）：siblings 模板的钩子按 ctx.dir 判断是否允许展开。
          return service.preview({ id: ctx.id, options: { ...options, dir: ctx.dir as string | undefined } });
        },
  (r) => {
          const lines = [`将创建 ${r.count} 个文件 → ${r.vars.name || '(未命名)'}`, ''];
          lines.push(...r.files.map((f) => '  ' + f));
          return lines.join('\n');
        }
);
