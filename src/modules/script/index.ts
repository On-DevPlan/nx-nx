// 脚本域：跑随包分发的 .mjs 脚本，内置全局函数（别名模块）已注入。
//
// 与「模板」「skill」两个域同形：一份 action 声明 → CLI 命令 + HTTP 路由 + help 文本。
// 脚本本身是纯 .mjs（零构建、零依赖），Node 侧只做「哪个脚本 + 哪些参数」的编排。
//
// 脚本怎么拿到内置函数：解释器（assets/scripts/_runner.mjs）在导入脚本前把别名
// 模块里的函数挂到 globalThis 上，脚本里直接用裸名调用（walk(dir)、run(cmd, args)）。
import { defineAction } from '../../runtime/types/action.js';
import { defineModule } from '../../runtime/types/module.js';
import * as service from '../../core/script/service.js';

export default defineModule({
  id: 'script',
  title: '脚本',
  order: 30,
  actions: [
    defineAction({
      id: 'script.list',
      cli: ['script', 'list'],
      http: ['GET', '/api/scripts'],
      summary: '列出随包分发的脚本与用法',
    })(
      () => ({ scripts: service.scripts() }),
      (r) => {
        if (!r.scripts.length) return '（暂无内置脚本）';
        const lines = ['内置脚本:'];
        for (const s of r.scripts) {
          lines.push(`  ${s.name}${s.description ? '  ·  ' + s.description : ''}`);
          if (s.usage) lines.push(`      ${s.usage}`);
        }
        lines.push('', '内置全局函数清单: nx-nx script aliases');
        return lines.join('\n');
      },
    ),

    defineAction({
      id: 'script.aliases',
      cli: ['script', 'aliases'],
      http: ['GET', '/api/script-aliases'],
      summary: '列出脚本里可直接调用的内置全局函数（别名模块）',
    })(
      () => service.aliases().then((aliases) => ({ aliases })),
      (r) => {
        if (!r.aliases.length) return '（别名模块为空）';
        const groups = new Map<string, typeof r.aliases>();
        for (const a of r.aliases) {
          const g = groups.get(a.group) || [];
          g.push(a);
          groups.set(a.group, g);
        }
        const lines = ['内置全局函数（脚本里直接用裸名调用）:'];
        for (const [group, items] of groups) {
          lines.push(`  ${group}:`);
          for (const a of items) lines.push(`    ${a.name.padEnd(12)} ${a.desc}`);
        }
        return lines.join('\n');
      },
    ),

    defineAction({
      id: 'script.read',
      cli: ['script', 'read'],
      http: ['GET', '/api/scripts/:name/content'],
      summary: '读取脚本源码',
      args: ['name'],
    })(
      (ctx) => service.readScript(ctx.name),
      (r) => r.content,
    ),

    defineAction({
      id: 'script.save',
      cli: ['script', 'save'],
      http: ['PUT', '/api/scripts/:name/content'],
      summary: '保存脚本源码（先写临时文件再改名）',
      args: ['name'],
      flags: {
        content: { type: 'string', required: true, hint: '脚本全文' },
      },
    })(
      (ctx) => service.saveScript(ctx.name, ctx.content),
      (r) => `已保存: ${r.path}`,
    ),

    defineAction({
      id: 'script.create',
      cli: ['script', 'create'],
      http: ['POST', '/api/scripts'],
      summary: '新建脚本并登记到 manifest',
      flags: {
        name: { type: 'string', required: true, hint: '脚本名（不含 .mjs）' },
        description: { type: 'string', hint: '一句话说明' },
        usage: { type: 'string', hint: '用法示例' },
        content: { type: 'string', hint: '初始源码（留空则生成模板）' },
      },
    })(
      (ctx) => service.createScript(ctx),
      (r) => `已创建: ${r.path}`,
    ),

    defineAction({
      id: 'script.delete',
      cli: [
        ['script', 'delete'],
        ['script', 'rm'],
      ],
      http: ['DELETE', '/api/scripts/:name'],
      summary: '删除脚本并从 manifest 移除',
      args: ['name'],
    })(
      (ctx) => service.deleteScript(ctx.name),
      (r) => `已删除: ${r.path}`,
    ),

    defineAction({
      id: 'script.run',
      cli: [
        ['script', 'run'],
        ['js', 'run'],
      ],
      http: ['POST', '/api/script-run'],
      summary: '运行内置脚本或任意 .mjs 脚本（内置全局函数已注入）',
      args: [{ name: 'name' }, { name: 'args', required: false, rest: true }],
      // 脚本自己的参数由脚本定（--root / --to / --mode …），声明期枚举不了，
      // 所以走开放式：未知 flag 原样转成 argv 交给脚本。
      openFlags: true,
    })(
      async (ctx, meta) => {
        const flags: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(ctx)) {
          if (k === 'name' || k === 'args') continue;
          flags[k] = v;
        }
        const result = await service.runScript(ctx.name, {
          args: [...(ctx.args ?? []), ...service.flagTokens(flags)],
        });
        // CLI：脚本的非零退出码就是这次调用的退出码。
        // HTTP：不能污染常驻 serve 进程的退出码——面板里跑失败只体现在返回值里。
        if (result.code !== 0 && meta?.transport === 'cli') process.exitCode = result.code;
        return result;
      },
      (r) => {
        const out: string[] = [];
        if (r.stdout.trim()) out.push(r.stdout.trimEnd());
        if (r.stderr.trim()) out.push(r.stderr.trimEnd());
        if (r.code !== 0) out.push(`（脚本退出码 ${r.code}）`);
        return out.join('\n');
      },
    ),
  ],
});
