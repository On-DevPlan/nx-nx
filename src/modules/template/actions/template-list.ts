// template.list —— 列出所有可用模板
//
// 一条 action 一个文件：声明（id/cli/http/summary）、契约（zod schema）与实现同文件。
// 模块 index.ts 不手工列举 action——清单由 `pnpm gen:actions` 生成。
import { defineAction } from '../../../runtime/types/action.js';
import * as service from '../service.js';

export default defineAction({
  id: 'template.list',
  cli: ['template', 'list'],
  http: ['GET', '/api/templates'],
  summary: '列出所有可用模板',
})(
  () => service.list(),
  (r) => {
          if (!r.templates.length) return '（暂无模板——在 templates/<id>/ 下建一个）';
          const lines = r.templates.map(
            (t) => `${t.id.padEnd(20)} ${t.name}${t.description ? '  ·  ' + t.description : ''}`
          );
          if (r.errors.length) {
            lines.push('', '有模板不合法（未列入上表）:');
            for (const e of r.errors) lines.push(`  ${e.id}: ${e.message}`);
          }
          return lines.join('\n');
        }
);
