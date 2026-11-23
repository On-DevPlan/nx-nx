// system.routes —— 列出 CLI 命令与 HTTP 路由的对照表
//
// 一条 action 一个文件：声明（id/cli/http/summary）、契约（zod schema）与实现同文件。
// 模块 index.ts 不手工列举 action——清单由 `pnpm gen:actions` 生成。
import { defineAction } from '../../../runtime/types/action.js';
import { commandTable } from '../bootstrap.js';

export default defineAction({
  id: 'system.routes',
  cli: ['routes'],
  http: ['GET', '/api/routes'],
  summary: '列出 CLI 命令与 HTTP 路由的对照表',
})(
  async () => {
          const table = await commandTable();
          return {
            status: 'ok',
            count: table.length,
            routes: table.map((c) => ({
              id: c.id,
              module: c.module,
              cli: c.command,
              http: c.http ? `${c.http.method} ${c.http.path}` : null,
              summary: c.summary,
            })),
          };
        },
  (r) => {
          const lines = [`共 ${r.count} 条命令（CLI ↔ HTTP 对照）`, ''];
          const width = Math.max(...r.routes.map((x) => x.cli.length));
          for (const x of r.routes) {
            lines.push('  ' + x.cli.padEnd(width + 2) + (x.http || '(仅 CLI)') + '   ' + (x.summary || ''));
          }
          return lines.join('\n');
        }
);
