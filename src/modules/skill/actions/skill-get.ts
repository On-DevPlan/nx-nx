// skill.get —— 导出 skill 文档（并幂等安装）
//
// 一条 action 一个文件：声明（id/cli/http/summary）、契约（zod schema）与实现同文件。
// 模块 index.ts 不手工列举 action——清单由 `pnpm gen:actions` 生成。
import { defineAction } from '../../../runtime/types/action.js';
import * as skillsGet from '../../../core/skills/get.js';

export default defineAction({
  id: 'skill.get',
  cli: ['skill', 'get'],
  http: ['GET', '/api/skill-content'],
  summary: '导出 skill 文档（并幂等安装）',
  args: [
    { name: 'name', required: false },
    { name: 'ref', required: false },
  ],
  flags: {
    to: { type: 'string' },
    force: { type: 'boolean' },
  },
})(
  async (ctx) => {
          const result = await skillsGet.getSkill(ctx.name || 'nx-nx', {
            ref: ctx.ref,
            to: ctx.to,
            force: ctx.force,
          });
          return {
            skillName: result.skillName,
            ref: result.ref,
            contentBytes: result.contentBytes,
            prefix: skillsGet.skillGetPrefix(result.skillName, result.ref),
            content: result.content,
            installStatus: skillsGet.installStatusLine(result.install),
          };
        },
  (r) => [r.prefix, r.content, '', r.installStatus].join('\n')
);
