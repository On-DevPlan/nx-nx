// serviceGroup.script —— 组内脚本入口：--op read/save/create/delete（全部在服务组命名空间内，不碰全局脚本模块）
//
// 一条 action 一个文件：声明（id/cli/http/summary）、契约（zod schema）与实现同文件。
// 模块 index.ts 不手工列举 action——清单由 `pnpm gen:actions` 生成。
import { defineAction } from '../../../runtime/types/action.js';
import * as service from '../service.js';
import { groupScriptOpInput } from '../schemas.js';

export default defineAction({
  id: 'serviceGroup.script',
  cli: ['sg', 'script'],
  http: ['POST', '/api/service-groups/:id/script'],
  summary: '组内脚本入口：--op read/save/create/delete（全部在服务组命名空间内，不碰全局脚本模块）',
  args: ['id'],
  flags: {
    op: { type: 'string', default: 'read', hint: 'read | save | create | delete' },
    name: { type: 'string', hint: '脚本名（不含 .mjs，不能带路径）' },
    content: { type: 'string', hint: 'save / create 的脚本全文' },
    contentFile: { type: 'string', hint: '从本机文件读入脚本全文（AI 生成完整脚本时优先用这个）' },
  },
  schema: groupScriptOpInput,
})(
  (ctx) => service.groupScriptOp(ctx.id, ctx.op, ctx.name, ctx.content, ctx.contentFile),
  (r) => {
          if (r.op === 'read') return `// ${r.groupId}/${r.name}  ${r.path}\n${r.content ?? ''}`;
          if (r.op === 'delete') return `已删除 ${r.groupId}/${r.name}: ${r.path}`;
          return `已${r.op === 'create' ? '创建' : '保存'} ${r.groupId}/${r.name}: ${r.path}`;
        }
);
