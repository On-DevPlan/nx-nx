// skill.list —— 列出可装的 skill 与 group。
import { z } from 'zod';
import { action } from '../../../runtime/action-decorator.js';
import { ActionBase } from '../../../runtime/action-base.js';
import * as skills from '../../../core/skills/index.js';
import { skillListInput, skillListOutput } from '../schemas.js';

export class SkillListAction extends ActionBase {
  @action({
    id: 'skill.list',
    cli: ['skill', 'list'],
    http: ['GET', '/api/skills'],
    summary: '列出可装的 skill 与 group',
    input: skillListInput,
    output: skillListOutput,
    render: (r) => {
      const lines = ['可装的 skill:'];
      for (const n of r.skills) lines.push('  ' + n + (n === r.defaultGroup ? '  （默认 install）' : ''));
      lines.push('可装的 group:');
      for (const g of r.groups) lines.push('  ' + g + (g === r.defaultGroup ? '  （默认）' : ''));
      return lines.join('\n');
    },
  })
  async list(_ctx: z.output<typeof skillListInput>) {
    const [names, manifest] = await Promise.all([
      skills.bundledSkillNames(),
      skills.loadGroups(),
    ]);
    return {
      skills: names,
      groups: Object.keys(manifest.groups),
      defaultGroup: manifest.defaultGroup,
      source: manifest.source,
    };
  }
}
