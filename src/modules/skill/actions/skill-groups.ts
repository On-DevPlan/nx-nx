// skill.groups —— 列出每个 group 含哪些 skill
//
// 一条 action 一个文件：声明（id/cli/http/summary）、契约（zod schema）与实现同文件。
// 模块 index.ts 不手工列举 action——清单由 `pnpm gen:actions` 生成。
import { defineAction } from '../../../runtime/types/action.js';
import * as skills from '../../../core/skills/index.js';

export default defineAction({
  id: 'skill.groups',
  cli: ['skill', 'groups'],
  http: ['GET', '/api/skill-groups'],
  summary: '列出每个 group 含哪些 skill',
})(
  async () => {
          const manifest = await skills.loadGroups();
          return { source: manifest.source, groups: manifest.groups, warning: manifest.warning };
        },
  (r) => {
          const lines = [];
          for (const [key, g] of Object.entries(r.groups)) {
            lines.push(`  ${key.padEnd(12)} [${g.skills.join(', ')}]${g.summary ? '  ' + g.summary : ''}`);
          }
          if (r.warning) lines.push('', '⚠ ' + r.warning);
          return `group 清单（来源: ${r.source}）\n` + lines.join('\n');
        }
);
