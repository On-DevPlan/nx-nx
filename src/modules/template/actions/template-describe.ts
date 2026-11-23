// template.describe —— 查看某个模板的说明与可选项
//
// 一条 action 一个文件：声明（id/cli/http/summary）、契约（zod schema）与实现同文件。
// 模块 index.ts 不手工列举 action——清单由 `pnpm gen:actions` 生成。
import { defineAction } from '../../../runtime/types/action.js';
import * as service from '../service.js';

export default defineAction({
  id: 'template.describe',
  cli: ['template', 'describe'],
  http: ['GET', '/api/templates/:id'],
  summary: '查看某个模板的说明与可选项',
  args: ['id'],
})(
  (ctx) => service.describe(ctx.id),
  (r) => {
          const t = r.template;
          const lines = [`${t.id} · ${t.name}`, ''];
          if (t.description) lines.push(t.description, '');
          lines.push('可选项:');
          for (const o of t.options || []) {
            const type = o.type || 'string';
            const vals = o.values ? ` <${o.values.join('|')}>` : type === 'boolean' ? '' : ` <${type}>`;
            const req = o.required ? ' (必填)' : '';
            const def =
              o.default !== undefined && o.default !== null && o.default !== ''
                ? `  默认: ${o.default}`
                : '';
            lines.push(`  --${o.name}${vals}${req}   ${o.label || ''}${def}`);
            if (o.hint) lines.push(`      ${o.hint}`);
          }
          if (t.nextSteps?.length) {
            lines.push('', '生成后建议:');
            for (const s of t.nextSteps) lines.push('  ' + s);
          }
          return lines.join('\n');
        }
);
