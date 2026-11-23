// skill.list —— 列出可装的 skill 与 group。
//
// 契约（zod schema）就声明在本文件里——入参类型由基类泛型模板封装。
import { z } from 'zod';
import { action } from '../../../runtime/action-decorator.js';
import { ActionBase, type ActionInput } from '../../../runtime/action-base.js';
import * as skills from '../../../core/skills/index.js';

/** skill.list 的入参契约（无参数）。 */
const input = z.object({});

export class SkillListAction extends ActionBase<typeof input> {
  @action({
    id: 'skill.list',
    cli: ['skill', 'list'],
    http: ['GET', '/api/skills'],
    summary: '列出可装的 skill 与 group',
    input,
    render: (r) => {
      const lines = ['可装的 skill:'];
      for (const n of r.skills) lines.push('  ' + n + (n === r.defaultGroup ? '  （默认 install）' : ''));
      lines.push('可装的 group:');
      for (const g of r.groups) lines.push('  ' + g + (g === r.defaultGroup ? '  （默认）' : ''));
      return lines.join('\n');
    },
  })
  override async run(_ctx: ActionInput<this['_input']>) {
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
