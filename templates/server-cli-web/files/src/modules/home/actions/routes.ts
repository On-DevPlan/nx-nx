// home.routes —— CLI 命令 ↔ HTTP 路由的对照表。
//
// 命令表来自运行时的 CliApp（registry 的投影），动态 import 避开装载期成环：
// registry → 本模块 →（运行时）cli → registry。
import { z } from 'zod';
import { action } from '../../../runtime/action-decorator.js';
import { ActionBase } from '../../../runtime/action-base.js';
import { commandEntry } from '../../../runtime/help.js';
import { homeRoutesInput, homeRoutesOutput } from '../schemas.js';

export class RoutesAction extends ActionBase {
  @action({
    id: 'home.routes',
    cli: ['routes'],
    http: ['GET', '/api/routes'],
    summary: '列出 CLI 命令与 HTTP 路由的对照表',
    input: homeRoutesInput,
    output: homeRoutesOutput,
    render: (r) => {
      const lines = [`共 ${r.count} 条命令（CLI ↔ HTTP 对照）`, ''];
      const width = Math.max(...r.routes.map((x: { cli: string }) => x.cli.length));
      for (const x of r.routes) {
        lines.push('  ' + x.cli.padEnd(width + 2) + (x.http || '(仅 CLI)') + '   ' + (x.summary || ''));
      }
      return lines.join('\n');
    },
  })
  async routes(_ctx: z.output<typeof homeRoutesInput>) {
    const { cliApp } = await import('../../../runtime/cli.js');
    const table = cliApp.commands.map(commandEntry);
    return {
      status: 'ok' as const,
      count: table.length,
      routes: table.map((c) => ({
        id: c.id,
        module: c.module,
        cli: c.command,
        http: c.http ? `${c.http.method} ${c.http.path}` : null,
        summary: c.summary,
      })),
    };
  }
}
