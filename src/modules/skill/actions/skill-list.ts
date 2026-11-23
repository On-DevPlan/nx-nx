// skill.list —— 列出可装的 skill 与 group
//
// 一条 action 一个文件：声明（id/cli/http/summary）、契约（zod schema）与实现同文件。
// 模块 index.ts 不手工列举 action——清单由 `pnpm gen:actions` 生成。
import { defineAction } from '../../../runtime/types/action.js';
import * as skills from '../../../core/skills/index.js';

export default defineAction({
  id: 'skill.list',
  cli: ['skill', 'list'],
  http: ['GET', '/api/skills'],
  summary: '列出可装的 skill 与 group',
})(
  async () => {
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
        },
  (r) => {
          const lines = ['可装的 skill:'];
          for (const n of r.skills) lines.push('  ' + n + (n === r.defaultGroup ? '  （默认 install）' : ''));
          lines.push('可装的 group:');
          for (const g of r.groups) lines.push('  ' + g + (g === r.defaultGroup ? '  （默认）' : ''));
          return lines.join('\n');
        }
);
