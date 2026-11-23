// script.aliases —— 列出脚本里可直接调用的内置全局函数（别名模块）
//
// 一条 action 一个文件：声明（id/cli/http/summary）、契约（zod schema）与实现同文件。
// 模块 index.ts 不手工列举 action——清单由 `pnpm gen:actions` 生成。
import { defineAction } from '../../../runtime/types/action.js';
import * as service from '../../../core/script/service.js';

export default defineAction({
  id: 'script.aliases',
  cli: ['script', 'aliases'],
  http: ['GET', '/api/script-aliases'],
  summary: '列出脚本里可直接调用的内置全局函数（别名模块）',
})(
  () => service.aliases().then((aliases) => ({ aliases })),
  (r) => {
          if (!r.aliases.length) return '（别名模块为空）';
          const groups = new Map<string, typeof r.aliases>();
          for (const a of r.aliases) {
            const g = groups.get(a.group) || [];
            g.push(a);
            groups.set(a.group, g);
          }
          const lines = ['内置全局函数（脚本里直接用裸名调用）:'];
          for (const [group, items] of groups) {
            lines.push(`  ${group}:`);
            for (const a of items) lines.push(`    ${a.name.padEnd(12)} ${a.desc}`);
          }
          return lines.join('\n');
        }
);
