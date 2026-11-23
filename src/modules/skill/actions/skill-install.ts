// skill.install —— 安装 skill、整组 skill 或全部 skill（--all 直接覆盖，不需要 --force）
//
// 一条 action 一个文件：声明（id/cli/http/summary）、契约（zod schema）与实现同文件。
// 模块 index.ts 不手工列举 action——清单由 `pnpm gen:actions` 生成。
import { defineAction } from '../../../runtime/types/action.js';
import * as skills from '../../../core/skills/index.js';
import { badInput } from '../../../core/errors/index.js';

export default defineAction({
  id: 'skill.install',
  cli: ['skill', 'install'],
  http: ['POST', '/api/skill-install'],
  summary: '安装 skill、整组 skill 或全部 skill（--all 直接覆盖，不需要 --force）',
  args: [{ name: 'name', required: false }],
  flags: {
    all: { type: 'boolean' },
    group: { type: 'string' },
    to: { type: 'string' },
    force: { type: 'boolean' },
  },
})(
  async (ctx) => {
          const opts = { to: ctx.to, force: ctx.force };
          if (ctx.name && ctx.group) {
            throw badInput('位置参数 name 与 --group 互斥，只能给一个');
          }
          if (ctx.all && (ctx.name || ctx.group)) {
            throw badInput('--all 与 name / --group 互斥，它会安装全部 skill');
          }
          if (ctx.all) return skills.installAll(opts);
          if (ctx.group) return skills.installGroup(ctx.group, opts);
          return skills.installOne(ctx.name || 'nx-nx', opts);
        },
  (r) => {
          if ('group' in r && Array.isArray((r as skills.GroupInstallResult).skills)) {
            const g = r as skills.GroupInstallResult;
            const label = g.group === '*' ? '全部 skill' : `group ${g.group}`;
            if (g.status === 'conflict') {
              return `${label} 有冲突（未安装任何文件）:\n` +
                g.skills.map((x) => `  冲突: ${x.path}（${x.files} 个文件不同）`).join('\n') +
                '\n确认覆盖: 加 --force';
            }
            return `${label} 已安装:\n` +
              g.skills.map((x) => `  ${x.status === 'skipped' ? '已是最新' : '已安装'}: ${x.path}`).join('\n');
          }
          const x = r as skills.InstallResult;
          if (x.status === 'conflict') {
            return `冲突: ${x.path}（${x.files} 个文件不同）；确认覆盖加 --force`;
          }
          if (x.status === 'skipped') return `已是最新: ${x.path}`;
          return `${x.replaced ? '已替换' : '已安装'}: ${x.path}（${x.files} 个文件）`;
        }
);
