// skill 域：管理随包分发的多 skill（主 skill 与可选配套 skill）。
// 平台级能力，action 只做 I/O 编排；发现/分组/安装/导出的真相在 core/skills*.ts。
//
// serve 端的 OOP 约定：业务编排收进 SkillService 类，action 装配层只调方法。
// 这个域没有自身状态（构造无依赖），类的价值在于**给编排一个名字**——
// install 的互斥校验、list 的并行聚合，都是「服务的方法」而不是散在 action 里的内联函数。
import { defineAction } from '../../runtime/types/action.js';
import { defineModule } from '../../runtime/types/module.js';
import * as skills from '../../core/skills/index.js';
import * as skillsGet from '../../core/skills/get.js';
import { badInput } from '../../core/errors/index.js';

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

export default defineModule({
  id: 'skill',
  title: 'Skill',
  order: 20,
  actions: [
    defineAction({
      id: 'skill.list',
      cli: ['skill', 'list'],
      http: ['GET', '/api/skills'],
      summary: '列出可装的 skill 与 group',
    })(
      () => skillService.list(),
      (r) => {
        const lines = ['可装的 skill:'];
        for (const n of r.skills) lines.push('  ' + n + (n === r.defaultGroup ? '  （默认 install）' : ''));
        lines.push('可装的 group:');
        for (const g of r.groups) lines.push('  ' + g + (g === r.defaultGroup ? '  （默认）' : ''));
        return lines.join('\n');
      },
    ),

    defineAction({
      id: 'skill.groups',
      cli: ['skill', 'groups'],
      http: ['GET', '/api/skill-groups'],
      summary: '列出每个 group 含哪些 skill',
    })(
      () => skillService.groups(),
      (r) => {
        const lines = [];
        for (const [key, g] of Object.entries(r.groups)) {
          lines.push(`  ${key.padEnd(12)} [${g.skills.join(', ')}]${g.summary ? '  ' + g.summary : ''}`);
        }
        if (r.warning) lines.push('', '⚠ ' + r.warning);
        return `group 清单（来源: ${r.source}）\n` + lines.join('\n');
      },
    ),

    defineAction({
      id: 'skill.get',
      cli: ['skill', 'get'],
      http: ['GET', '/api/skill-content'],
      summary: '导出 skill 文档（并幂等安装）',
      args: [
        { name: 'name', required: false },
        { name: 'ref', required: false },
      ],
      flags: {
        to: { type: 'string' },
        force: { type: 'boolean' },
      },
    })(
      (ctx) => skillService.get(ctx.name, { ref: ctx.ref, to: ctx.to, force: ctx.force }),
      // 人读模式：前缀 → 全文 → 安装状态，三段拼接。
      (r) => [r.prefix, r.content, '', r.installStatus].join('\n'),
    ),

    defineAction({
      id: 'skill.install',
      cli: ['skill', 'install'],
      http: ['POST', '/api/skill-install'],
      summary: '安装 skill、整组 skill 或全部 skill',
      args: [{ name: 'name', required: false }],
      flags: {
        all: { type: 'boolean' },
        group: { type: 'string' },
        to: { type: 'string' },
        force: { type: 'boolean' },
      },
    })(
      (ctx) => skillService.install({ name: ctx.name, all: ctx.all, group: ctx.group, to: ctx.to, force: ctx.force }),
      (r) => {
        if ('group' in r && Array.isArray((r as skills.GroupInstallResult).skills)) {
          const g = r as skills.GroupInstallResult;
          const label = g.group === '*' ? '全部 skill' : `group ${g.group}`;
          if (g.status === 'conflict') {
            return `${label} 有冲突（未安装任何文件）:\n` +
              g.skills.map((x) => `  冲突: ${x.path}（${x.files} 个文件不同）`).join('\n') +
              '\n确认覆盖: 加 --force';
          }
          return `${label} 已安装:\n` +
            g.skills.map((x) => `  ${x.status === 'skipped' ? '已是最新' : '已安装'}: ${x.path}`).join('\n');
        }
        const x = r as skills.InstallResult;
        if (x.status === 'conflict') {
          return `冲突: ${x.path}（${x.files} 个文件不同）；确认覆盖加 --force`;
        }
        if (x.status === 'skipped') return `已是最新: ${x.path}`;
        return `${x.replaced ? '已替换' : '已安装'}: ${x.path}（${x.files} 个文件）`;
      },
    ),
  ],
});
