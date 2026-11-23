// template.create —— 按模板生成项目
//
// 一条 action 一个文件：声明（id/cli/http/summary）、契约（zod schema）与实现同文件。
// 模块 index.ts 不手工列举 action——清单由 `pnpm gen:actions` 生成。
import { defineAction } from '../../../runtime/types/action.js';
import { collectOptions } from '../options.js';
import * as service from '../service.js';

export default defineAction({
  id: 'template.create',
  cli: ['template', 'create'],
  http: ['POST', '/api/templates/:id/create'],
  summary: '按模板生成项目',
  args: ['id'],
  openFlags: true,
  flags: {
    dir: { type: 'string', hint: '输出目录', required: false },
    set: { type: 'string', hint: 'k=v,k=v', required: false },
    'dry-run': { type: 'boolean' },
  },
})(
  async (ctx) => {
          const d = await service.describe(ctx.id);
          const options = collectOptions(ctx, d.template.options || []);
          return service.create({
            id: ctx.id,
            options: { ...options, dir: ctx.dir },
            dryRun: !!ctx['dry-run'],
          });
        },
  (r) => {
          const lines = [
            (r.dryRun ? '[预览] 将创建 ' : '已创建 ') + r.count + ' 个文件',
            '输出: ' + r.outputDir,
          ];
          const extra = r.extra as { note?: string } | null;
          if (extra?.note) lines.push(extra.note);
          if (r.nextSteps?.length) {
            lines.push('', '下一步:');
            for (const s of r.nextSteps) lines.push('  ' + s);
          }
          return lines.join('\n');
        }
);
