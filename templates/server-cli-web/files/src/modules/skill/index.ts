// skill 模块：管理随包分发的多 skill（主 skill 与可选配套 skill）。
// 平台级能力；发现/分组/安装/导出的真相在 core/skills*.ts。
//
// 单一通道：action 一律 @action 装饰器声明（zod schema 即契约，见 ./schemas.ts），
// 方法即 handler，模块的 actions 字段由 zodActionsOf(this) 从原型上收集。
// 「声明与实现写在一起、类持有服务实例」是注解式 + OOP 的合流点。
//
// 注解式的两笔类型债（0.10.0 验证结论，接受并记录）：
//   - handler 入参类型手写 z.output<typeof schema>（装饰器改不了方法签名）；
//   - 路由 :param 与 args 的一致性检查在收集期红（zodActionsOf）。
import { z } from 'zod';
import { ModuleBase } from '../../runtime/types/module.js';
import { action, zodActionsOf } from '../../runtime/action-decorator.js';
import * as skills from '../../core/skills/index.js';
import * as skillsGet from '../../core/skills/get.js';
import { badInput } from '../../core/errors/index.js';
import {
  skillGetInput,
  skillGetOutput,
  skillGroupsInput,
  skillGroupsOutput,
  skillInstallInput,
  skillInstallOutput,
  skillListInput,
  skillListOutput,
} from './schemas.js';

export class SkillService {
  async list() {
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

  async groups() {
    const manifest = await skills.loadGroups();
    return { source: manifest.source, groups: manifest.groups, warning: manifest.warning };
  }

  async get(name: string | undefined, opts: { ref?: unknown; to?: unknown; force?: unknown } = {}) {
    // 服务是类型边界：core 的导出函数要 string / boolean，这里统一收窄。
    const result = await skillsGet.getSkill(name || '{{name}}', {
      ref: opts.ref == null ? undefined : String(opts.ref),
      to: opts.to == null ? undefined : String(opts.to),
      force: opts.force === true,
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

  async install(input: {
    name?: unknown;
    all?: unknown;
    group?: unknown;
    to?: unknown;
    force?: unknown;
  }) {
    // 服务是类型边界：core 的安装函数要 string | undefined / boolean，
    // action 层传来的 ctx 值经 flag 强转已是这个形状，直调服务的人在这里收窄。
    const opts = {
      to: input.to == null ? undefined : String(input.to),
      force: input.force === true,
    };
    if (input.name && input.group) {
      throw badInput('位置参数 name 与 --group 互斥，只能给一个');
    }
    if (input.all && (input.name || input.group)) {
      throw badInput('--all 与 name / --group 互斥，它会安装全部 skill');
    }
    if (input.all) return skills.installAll(opts);
    if (input.group) return skills.installGroup(String(input.group), opts);
    return skills.installOne(String(input.name || '{{name}}'), opts);
  }
}

export const skillService = new SkillService();

export class SkillModule extends ModuleBase {
  override readonly id = 'skill';
  override readonly title = 'Skill';
  override readonly order = 20;

  constructor(private svc: SkillService = skillService) {
    super();
  }

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
  list(_ctx: z.output<typeof skillListInput>) {
    return this.svc.list();
  }

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
  groups(_ctx: z.output<typeof skillGroupsInput>) {
    return this.svc.groups();
  }

  @action({
    id: 'skill.get',
    cli: ['skill', 'get'],
    http: ['GET', '/api/skill-content'],
    summary: '导出 skill 文档（并幂等安装）',
    args: ['name', 'ref'],
    input: skillGetInput,
    output: skillGetOutput,
    // 人读模式：前缀 → 全文 → 安装状态，三段拼接。
    render: (r) => [r.prefix, r.content, '', r.installStatus].join('\n'),
  })
  get(ctx: z.output<typeof skillGetInput>) {
    return this.svc.get(ctx.name, { ref: ctx.ref, to: ctx.to, force: ctx.force });
  }

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
  install(ctx: z.output<typeof skillInstallInput>) {
    return this.svc.install({ name: ctx.name, all: ctx.all, group: ctx.group, to: ctx.to, force: ctx.force });
  }

  // actions 由装饰器收集（字段放最后：初始化时 id/title 已就绪）。
  override readonly actions = zodActionsOf(this);
}

export const skillModule = new SkillModule();
