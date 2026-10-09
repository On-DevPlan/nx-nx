// 模板域：action 声明。CLI 命令表、HTTP 路由表、help 文本全部由这里派生，
// 所以「面板上有按钮、CLI 里没命令」在结构上不可能发生。
//
// openFlags: true 的 action 表示它的可选项**由数据驱动**（模板的 option schema），
// 声明期无法枚举。这类 action 在 run 里自行按 schema 取白名单，见 pickOptions。
import { defineAction } from '../../runtime/types/action.js';
import { defineModule } from '../../runtime/types/module.js';
import type { OptionSpec } from '../../core/templates.js';
import * as service from './service.js';

// 从 ctx 里挑出属于该模板选项的键。
//
// 为什么需要白名单：ctx 同时含 CLI 全局 flag（--json/--store）、
// 平台命令自带 flag、以及 action 自己声明的 flag。不筛一遍，
// 用户的任意输入都会被当成模板选项传给 resolveVars，默认值全被冲掉。
//
// 极端情况：模板选项名与全局 flag 撞名时（如模板也有个 port 而 CLI 无同名全局），
// 以模板选项为准——调用方传的就是给模板的。
function pickOptions(ctx: Record<string, unknown>, options: readonly OptionSpec[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const opt of options) {
    if (ctx[opt.name] !== undefined) out[opt.name] = ctx[opt.name];
  }
  return out;
}

// `--set k=v` 形态的兜底：值里带空格或需要强制字符串时用，
// 也解决了「选项名与 flag 名撞车」的歧义。
function parseSetList(raw: unknown): Record<string, unknown> {
  if (!raw) return {};
  const list = Array.isArray(raw) ? raw.map(String) : String(raw).split(',');
  const out: Record<string, unknown> = {};
  for (const item of list) {
    const i = item.indexOf('=');
    if (i <= 0) continue;
    out[item.slice(0, i)] = item.slice(i + 1);
  }
  return out;
}

function collectOptions(ctx: Record<string, unknown>, options: readonly OptionSpec[]): Record<string, unknown> {
  return { ...pickOptions(ctx, options), ...parseSetList(ctx.set) };
}

export default defineModule({
  id: 'template',
  title: '模板',
  order: 10,
  actions: [
    defineAction({
      id: 'template.list',
      cli: ['template', 'list'],
      http: ['GET', '/api/templates'],
      summary: '列出所有可用模板',
    })(
      () => service.list(),
      (r) => {
        if (!r.templates.length) return '（暂无模板——在 templates/<id>/ 下建一个）';
        const lines = r.templates.map(
          (t) => `${t.id.padEnd(20)} ${t.name}${t.description ? '  ·  ' + t.description : ''}`
        );
        if (r.errors.length) {
          lines.push('', '有模板不合法（未列入上表）:');
          for (const e of r.errors) lines.push(`  ${e.id}: ${e.message}`);
        }
        return lines.join('\n');
      },
    ),

    defineAction({
      id: 'template.describe',
      cli: ['template', 'describe'],
      http: ['GET', '/api/templates/:id'],
      summary: '查看某个模板的说明与可选项',
      args: ['id'],
    })(
      (ctx) => service.describe(ctx.id),
      (r) => {
        const t = r.template;
        const lines = [`${t.id} · ${t.name}`, ''];
        if (t.description) lines.push(t.description, '');
        lines.push('可选项:');
        for (const o of t.options || []) {
          const type = o.type || 'string';
          const vals = o.values ? ` <${o.values.join('|')}>` : type === 'boolean' ? '' : ` <${type}>`;
          const req = o.required ? ' (必填)' : '';
          const def =
            o.default !== undefined && o.default !== null && o.default !== ''
              ? `  默认: ${o.default}`
              : '';
          lines.push(`  --${o.name}${vals}${req}   ${o.label || ''}${def}`);
          if (o.hint) lines.push(`      ${o.hint}`);
        }
        if (t.nextSteps?.length) {
          lines.push('', '生成后建议:');
          for (const s of t.nextSteps) lines.push('  ' + s);
        }
        return lines.join('\n');
      },
    ),

    defineAction({
      id: 'template.preview',
      cli: ['template', 'preview'],
      http: ['POST', '/api/templates/:id/preview'],
      summary: '预览将生成的文件清单（不写盘）',
      args: ['id'],
      openFlags: true,
      flags: { dir: { type: 'string' }, set: { type: 'string' } },
    })(
      async (ctx) => {
        const d = await service.describe(ctx.id);
        const options = collectOptions(ctx, d.template.options || []);
        return service.preview({ id: ctx.id, options });
      },
      (r) => {
        const lines = [`将创建 ${r.count} 个文件 → ${r.vars.name || '(未命名)'}`, ''];
        lines.push(...r.files.map((f) => '  ' + f));
        return lines.join('\n');
      },
    ),

    defineAction({
      id: 'template.create',
      cli: ['template', 'create'],
      http: ['POST', '/api/templates/:id/create'],
      summary: '按模板生成项目',
      args: ['id'],
      openFlags: true,
      flags: {
        dir: { type: 'string', hint: '输出目录', required: false },
        set: { type: 'string', hint: 'k=v,k=v', required: false },
        'dry-run': { type: 'boolean' },
      },
    })(
      async (ctx) => {
        const d = await service.describe(ctx.id);
        const options = collectOptions(ctx, d.template.options || []);
        return service.create({
          id: ctx.id,
          options: { ...options, dir: ctx.dir },
          dryRun: !!ctx['dry-run'],
        });
      },
      (r) => {
        const lines = [
          (r.dryRun ? '[预览] 将创建 ' : '已创建 ') + r.count + ' 个文件',
          '输出: ' + r.outputDir,
        ];
        const extra = r.extra as { note?: string } | null;
        if (extra?.note) lines.push(extra.note);
        if (r.nextSteps?.length) {
          lines.push('', '下一步:');
          for (const s of r.nextSteps) lines.push('  ' + s);
        }
        return lines.join('\n');
      },
    ),

    defineAction({
      id: 'template.ports',
      cli: ['template', 'ports'],
      http: ['GET', '/api/ports'],
      summary: '探测可用的本机端口（供 serve / vite 使用）',
      flags: { start: { type: 'number' }, count: { type: 'number', default: 4 } },
    })(
      (ctx) =>
        service
          .probePorts({ start: ctx.start || service.FAMILY_PORT_START, count: ctx.count || 4 })
          .then((ports) => ({ status: 'ok', ports })),
      (r) => r.ports.join('\n'),
    ),

    defineAction({
      id: 'template.checkdir',
      cli: ['template', 'check-dir'],
      http: ['POST', '/api/check-dir'],
      summary: '检查目标目录是否可用（存在且非空则不可用）',
      flags: { dir: { type: 'string', required: true } },
    })(
      (ctx) => service.checkDir({ dir: ctx.dir }),
      (r) =>
        r.usable
          ? `可用: ${r.path}${r.exists ? '（已存在但为空）' : '（不存在，将新建）'}`
          : `不可用: ${r.path} 已有 ${r.entries} 项内容`,
    ),
  ],
});
