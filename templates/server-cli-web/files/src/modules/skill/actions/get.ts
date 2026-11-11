// skill.get —— 导出 skill 文档（并幂等安装）。
import { z } from 'zod';
import { action } from '../../../runtime/action-decorator.js';
import { ActionBase } from '../../../runtime/action-base.js';
import * as skillsGet from '../../../core/skills/get.js';
import { skillGetInput } from '../schemas.js';

export class SkillGetAction extends ActionBase {
  @action({
    id: 'skill.get',
    cli: ['skill', 'get'],
    http: ['GET', '/api/skill-content'],
    summary: '导出 skill 文档（并幂等安装）',
    args: ['name', 'ref'],
    input: skillGetInput,
    // 人读模式：前缀 → 全文 → 安装状态，三段拼接。
    render: (r) => [r.prefix, r.content, '', r.installStatus].join('\n'),
  })
  async get(ctx: z.output<typeof skillGetInput>) {
    const result = await skillsGet.getSkill(ctx.name || '{{name}}', {
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
  }
}
