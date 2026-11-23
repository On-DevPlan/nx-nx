// skill.groups —— 列出每个 group 含哪些 skill。
//
// 契约（zod schema）就声明在本文件里——入参类型由基类泛型模板封装。
import { z } from 'zod';
import { action } from '../../../runtime/action-decorator.js';
import { ActionBase, type ActionInput } from '../../../runtime/action-base.js';
import * as skills from '../../../core/skills/index.js';

/** skill.groups 的入参契约（无参数）。 */
const input = z.object({});

export class SkillGroupsAction extends ActionBase<typeof input> {
  @action({
    id: 'skill.groups',
    cli: ['skill', 'groups'],
    http: ['GET', '/api/skill-groups'],
    summary: '列出每个 group 含哪些 skill',
    input,
    render: (r) => {
      const lines = [];
      for (const [key, g] of Object.entries<{ skills: string[]; summary?: string }>(r.groups)) {
        lines.push(`  ${key.padEnd(12)} [${g.skills.join(', ')}]${g.summary ? '  ' + g.summary : ''}`);
      }
      if (r.warning) lines.push('', '⚠ ' + r.warning);
      return `group 清单（来源: ${r.source}）\n` + lines.join('\n');
    },
  })
  override async run(_ctx: ActionInput<this['_input']>) {
    const manifest = await skills.loadGroups();
    return { source: manifest.source, groups: manifest.groups, warning: manifest.warning };
  }
}
