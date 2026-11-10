// skill.groups —— 列出每个 group 含哪些 skill。
import { z } from 'zod';
import { action } from '../../../runtime/action-decorator.js';
import { ActionBase } from '../../../runtime/action-base.js';
import * as skills from '../../../core/skills/index.js';
import { skillGroupsInput, skillGroupsOutput } from '../schemas.js';

export class SkillGroupsAction extends ActionBase {
  @action({
    id: 'skill.groups',
    cli: ['skill', 'groups'],
    http: ['GET', '/api/skill-groups'],
    summary: '列出每个 group 含哪些 skill',
    input: skillGroupsInput,
    output: skillGroupsOutput,
    render: (r) => {
      const lines = [];
      for (const [key, g] of Object.entries<{ skills: string[]; summary?: string }>(r.groups)) {
        lines.push(`  ${key.padEnd(12)} [${g.skills.join(', ')}]${g.summary ? '  ' + g.summary : ''}`);
      }
      if (r.warning) lines.push('', '⚠ ' + r.warning);
      return `group 清单（来源: ${r.source}）\n` + lines.join('\n');
    },
  })
  async groups(_ctx: z.output<typeof skillGroupsInput>) {
    const manifest = await skills.loadGroups();
    return { source: manifest.source, groups: manifest.groups, warning: manifest.warning };
  }
}
