// skill.get —— 导出 skill 文档（并幂等安装）。
//
// 契约（zod schema）就声明在本文件里——入参类型由基类泛型模板封装。
import { z } from 'zod';
import { action } from '../../../runtime/action-decorator.js';
import { ActionBase, type ActionInput } from '../../../runtime/action-base.js';
import * as skillsGet from '../../../core/skills/get.js';

/** skill.get 的入参契约。 */
const input = z.object({
  name: z.string().optional().describe('skill 名（缺省为内置默认 skill）'),
  ref: z.string().optional().describe('编辑历史回退点（如 v3；缺省取最新）'),
  to: z.string().optional().describe('安装目标目录（缺省 ~/.claude/skills）'),
  force: z.boolean().optional().describe('目标已存在且内容不同时强制覆盖'),
});

export class SkillGetAction extends ActionBase<typeof input> {
  @action({
    id: 'skill.get',
    cli: ['skill', 'get'],
    http: ['GET', '/api/skill-content'],
    summary: '导出 skill 文档（并幂等安装）',
    args: ['name', 'ref'],
    input,
    // 人读模式：前缀 → 全文 → 安装状态，三段拼接。
    render: (r) => [r.prefix, r.content, '', r.installStatus].join('\n'),
  })
  override async run(ctx: ActionInput<this['_input']>) {
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
