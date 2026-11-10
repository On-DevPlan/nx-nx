// skill.install —— 安装 skill、整组 skill 或全部 skill。
//
// 互斥校验在这里（不是散在 action 层）：name / --group / --all 三者只能给一个。
import { z } from 'zod';
import { action } from '../../../runtime/action-decorator.js';
import { ActionBase } from '../../../runtime/action-base.js';
import * as skills from '../../../core/skills/index.js';
import { badInput } from '../../../core/errors/index.js';
import { skillInstallInput, skillInstallOutput } from '../schemas.js';

export class InstallAction extends ActionBase {
  @action({
    id: 'skill.install',
    cli: ['skill', 'install'],
    http: ['POST', '/api/skill-install'],
    summary: '安装 skill、整组 skill 或全部 skill',
    args: ['name'],
    input: skillInstallInput,
    output: skillInstallOutput,
    render: (r) => {
      if ('group' in r && Array.isArray(r.skills)) {
        const label = r.group === '*' ? '全部 skill' : `group ${r.group}`;
        if (r.status === 'conflict') {
          return `${label} 有冲突（未安装任何文件）:\n` +
            r.skills.map((x: { path: string; files: number }) => `  冲突: ${x.path}（${x.files} 个文件不同）`).join('\n') +
            '\n确认覆盖: 加 --force';
        }
        return `${label} 已安装:\n` +
          r.skills.map((x: { status: string; path: string }) => `  ${x.status === 'skipped' ? '已是最新' : '已安装'}: ${x.path}`).join('\n');
      }
      if (r.status === 'conflict') {
        return `冲突: ${r.path}（${r.files} 个文件不同）；确认覆盖加 --force`;
      }
      if (r.status === 'skipped') return `已是最新: ${r.path}`;
      return `${r.replaced ? '已替换' : '已安装'}: ${r.path}（${r.files} 个文件）`;
    },
  })
  async install(ctx: z.output<typeof skillInstallInput>) {
    const opts = {
      to: ctx.to == null ? undefined : String(ctx.to),
      force: ctx.force === true,
    };
    if (ctx.name && ctx.group) {
      throw badInput('位置参数 name 与 --group 互斥，只能给一个');
    }
    if (ctx.all && (ctx.name || ctx.group)) {
      throw badInput('--all 与 name / --group 互斥，它会安装全部 skill');
    }
    if (ctx.all) return skills.installAll(opts);
    if (ctx.group) return skills.installGroup(String(ctx.group), opts);
    return skills.installOne(String(ctx.name || '{{name}}'), opts);
  }
}
