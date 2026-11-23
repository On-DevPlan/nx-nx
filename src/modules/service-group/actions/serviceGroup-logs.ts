// serviceGroup.logs —— 查看服务组日志：事件（启动/停止/检测失败/自愈）/ 主脚本 IO 尾部 / HTTP 请求日志清单
//
// 一条 action 一个文件：声明（id/cli/http/summary）、契约（zod schema）与实现同文件。
// 模块 index.ts 不手工列举 action——清单由 `pnpm gen:actions` 生成。
import { defineAction } from '../../../runtime/types/action.js';
import * as service from '../service.js';
import { idInput } from '../schemas.js';

export default defineAction({
  id: 'serviceGroup.logs',
  cli: ['sg', 'logs'],
  http: ['GET', '/api/service-groups/:id/logs'],
  summary: '查看服务组日志：事件（启动/停止/检测失败/自愈）/ 主脚本 IO 尾部 / HTTP 请求日志清单',
  args: ['id'],
  schema: idInput,
})(
  (ctx) => service.logs(ctx.id),
  (r) => {
          const lines: string[] = [];
          if (r.events.trim()) lines.push('事件日志:', r.events.trimEnd());
          if (r.main.trim()) lines.push('主脚本日志（尾部）:', r.main.trimEnd());
          if (r.clients.trim()) lines.push('client 执行记录:', r.clients.trimEnd());
          if (r.http.length) {
            lines.push(`HTTP 请求日志（${r.http.length} 条，最近在前）:`);
            for (const h of r.http.slice(0, 20)) lines.push(`  ${h.name}  ${h.size} 字节`);
          }
          if (!lines.length) lines.push('（该服务组还没有日志）');
          return lines.join('\n');
        }
);
