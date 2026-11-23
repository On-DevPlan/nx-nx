// serviceGroup.hub —— hub 概览：一组看清 server / client / 空间方法 / 当前状态
//
// 一条 action 一个文件：声明（id/cli/http/summary）、契约（zod schema）与实现同文件。
// 模块 index.ts 不手工列举 action——清单由 `pnpm gen:actions` 生成。
import { defineAction } from '../../../runtime/types/action.js';
import * as service from '../service.js';
import { idInput } from '../schemas.js';

export default defineAction({
  id: 'serviceGroup.hub',
  cli: ['sg', 'hub'],
  http: ['GET', '/api/service-groups/:id/hub'],
  summary: 'hub 概览：一组看清 server / client / 空间方法 / 当前状态',
  args: ['id'],
  schema: idInput,
})(
  (ctx) => service.hubOverview(ctx.id),
  (r) => {
          const lines = [`hub ${r.id} · ${r.name}`];
          if (r.server) {
            const s = r.server;
            const mark = s.status !== 'running' ? '·' : s.alive === false ? '✘' : '✔';
            lines.push(`  server  ${mark} ${s.script} ${s.args.join(' ')}`.trimEnd());
            lines.push(
              `          状态 ${s.status}${s.pid ? ` (pid ${s.pid})` : ''}${s.entry ? ` · 版本 ${s.entry}` : ''}${s.port ? ` · 端口 ${s.port}` : ''}${s.detail ? ` · ${s.detail}` : ''}`,
            );
          } else {
            lines.push('  server  （未配置）');
          }
          lines.push(`  client  ${r.clients.length ? r.clients.join(' → ') : '（无）'}`);
          lines.push(`  stop    ${r.stop}`);
          lines.push(`  health  ${r.health}`);
          if (r.space) {
            lines.push(`  space   ${r.space.panel} · check=${r.space.check}`);
            lines.push(`          方法 ${r.space.methods.length ? r.space.methods.join(', ') : '（无）'}`);
          } else {
            lines.push('  space   （未绑定）');
          }
          lines.push(`  下一步  ${r.nextCommand}`);
          return lines.join('\n');
        }
);
