// serviceGroup.spaces —— 列出本机的管理空间（每个空间有哪些方法）
//
// 一条 action 一个文件：声明（id/cli/http/summary）、契约（zod schema）与实现同文件。
// 模块 index.ts 不手工列举 action——清单由 `pnpm gen:actions` 生成。
import { defineAction } from '../../../runtime/types/action.js';
import * as service from '../service.js';

export default defineAction({
  id: 'serviceGroup.spaces',
  cli: ['sg', 'spaces'],
  http: ['GET', '/api/service-spaces'],
  summary: '列出本机的管理空间（每个空间有哪些方法）',
})(
  () => ({ spaces: service.listSpaces() }),
  (r) => {
          if (!r.spaces.length) {
            return '（还没有登记的空间——执行一次 sg space <组> 后会自动登记）';
          }
          const lines = ['管理空间:'];
          for (const s of r.spaces) {
            lines.push(`  ${s.id}  ${s.name}  ${s.methods.length} 个方法  ${s.panel}`);
            if (s.methods.length) {
              lines.push(`    ${s.methods.map((m) => m.name).join(', ')}`);
            }
          }
          return lines.join('\n');
        }
);
