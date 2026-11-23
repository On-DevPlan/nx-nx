// serviceGroup.run —— 运行客户端流水线：按配置顺序执行 clients（不启动/停止服务）
//
// 一条 action 一个文件：声明（id/cli/http/summary）、契约（zod schema）与实现同文件。
// 模块 index.ts 不手工列举 action——清单由 `pnpm gen:actions` 生成。
import { defineAction } from '../../../runtime/types/action.js';
import * as service from '../service.js';
import { idInput } from '../schemas.js';

export default defineAction({
  id: 'serviceGroup.run',
  cli: ['sg', 'run'],
  http: ['POST', '/api/service-groups/:id/run'],
  summary: '运行客户端流水线：按配置顺序执行 clients（不启动/停止服务）',
  args: ['id'],
  schema: idInput,
})(
  (ctx) => service.run(ctx.id),
  (r) => {
          const lines = [`${r.ok ? '✔' : '✘'} 流水线 ${r.groupId}:`];
          for (const s of r.steps) {
            lines.push(`  ${s.ok ? '✔' : '✘'} ${s.step.padEnd(12)} ${s.script}`);
            if (s.detail) {
              for (const l of s.detail.split('\n').slice(0, 12)) lines.push(`      ${l}`);
            }
          }
          return lines.join('\n');
        }
);
