// script.list —— 列出随包分发的脚本与用法
//
// 一条 action 一个文件：声明（id/cli/http/summary）、契约（zod schema）与实现同文件。
// 模块 index.ts 不手工列举 action——清单由 `pnpm gen:actions` 生成。
import { defineAction } from '../../../runtime/types/action.js';
import * as service from '../../../core/script/service.js';

export default defineAction({
  id: 'script.list',
  cli: ['script', 'list'],
  http: ['GET', '/api/scripts'],
  summary: '列出随包分发的脚本与用法',
})(
  () => ({ scripts: service.scripts() }),
  (r) => {
          if (!r.scripts.length) return '（暂无内置脚本）';
          const lines = ['内置脚本:'];
          for (const s of r.scripts) {
            lines.push(`  ${s.name}${s.description ? '  ·  ' + s.description : ''}`);
            if (s.usage) lines.push(`      ${s.usage}`);
          }
          lines.push('', '内置全局函数清单: nx-nx script aliases');
          return lines.join('\n');
        }
);
