// serviceGroup.autoheal —— 自愈开关：state=on 失活即重启 / state=off 只记录不处理（监控不停）
//
// 一条 action 一个文件：声明（id/cli/http/summary）、契约（zod schema）与实现同文件。
// 模块 index.ts 不手工列举 action——清单由 `pnpm gen:actions` 生成。
import { defineAction } from '../../../runtime/types/action.js';
import * as service from '../service.js';
import { autohealInput } from '../schemas.js';

export default defineAction({
  id: 'serviceGroup.autoheal',
  cli: ['sg', 'autoheal'],
  http: ['POST', '/api/service-groups/:id/autoheal'],
  summary: '自愈开关：state=on 失活即重启 / state=off 只记录不处理（监控不停）',
  args: ['id'],
  flags: {
    state: { type: 'string', required: true, hint: 'on | off' },
  },
  schema: autohealInput,
})(
  (ctx) => service.autoheal(ctx.id, ctx.state),
  (r) =>
          `服务组 ${r.id} 自愈已${r.autoHeal ? '开启（失活即重启）' : '关闭（只记录，监控不停）'}` +
          (r.watching ? '\n  当前在运行：监控已按新设置重建' : '\n  当前未运行：下次启动时生效')
);
