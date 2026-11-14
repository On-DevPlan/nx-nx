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
import * as sandbox from '../../core/script/sandbox.js';

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
      id: 'script.params',
      cli: ['script', 'params'],
      http: ['GET', '/api/scripts/:name/params'],
      summary: '列出脚本声明的参数（源码里的 @param 注释）——面板据此渲染输入框',
      args: ['name'],
    })(
      (ctx) => ({ params: service.readParams(ctx.name) }),
      (r) => {
        if (!r.params.length) return '（该脚本没有声明参数；在源码头部写 // @param 名称 类型 默认值 说明 即可）';
        const lines = ['脚本参数:'];
        for (const p of r.params) {
          const t = p.type === 'select' ? `select(${(p.options ?? []).join('|')})` : p.type;
          lines.push(`  --${p.name.padEnd(14)} ${t.padEnd(20)} 默认 ${p.default || '-'}   ${p.desc}`);
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
      flags: {
        // 这个不是给脚本的，是给解释器的：先装载共享面板再执行（面板产出走 heap 返回）
        panel: { type: 'string', hint: '先装载共享面板（如 demo.shared），其变量堆随结果返回' },
      },
    })(
      async (ctx, meta) => {
        const flags: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(ctx)) {
          if (k === 'name' || k === 'args' || k === 'panel') continue;
          flags[k] = v;
        }
        const result = await service.runScript(ctx.name, {
          args: [...(ctx.args ?? []), ...service.flagTokens(flags)],
          shared: ctx.panel,
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

    // ---- 短脚本沙箱 ----
    //
    // 与 script.run 并列的第二条执行路：真 Node 跑业务脚本，沙箱跑「片段」。
    // 沙箱里没有 fs / 网络 / process，只有 log / args / set / heap / panel / use / call。
    defineAction({
      id: 'script.sandbox',
      cli: [
        ['js', 'sandbox'],
        ['script', 'sandbox'],
      ],
      http: ['POST', '/api/script-sandbox'],
      summary: '在沙箱（QuickJS 虚拟机）里跑一段代码：可用共享面板、产出可 JSON 化的变量堆',
      args: [{ name: 'name', required: false }],
      flags: {
        code: { type: 'string', hint: '内联代码片段（优先于 name）' },
        panel: { type: 'string', hint: '共享面板名/路径，多个用逗号分隔' },
        args: { type: 'array', hint: '参数（逗号分隔；HTTP 可直接传数组）' },
        timeoutMs: { type: 'number', hint: '执行时限（默认 5000ms）' },
        memoryMb: { type: 'number', hint: '内存上限（默认 64MB）' },
      },
    })(
      (ctx) =>
        sandbox.runSandbox({
          name: ctx.name,
          code: ctx.code,
          panel: ctx.panel,
          args: ctx.args,
          timeoutMs: ctx.timeoutMs,
          memoryMb: ctx.memoryMb,
        }),
      (r) => {
        const out: string[] = [];
        out.push(
          `${r.ok ? '沙箱执行完成' : '沙箱执行失败'}（${r.durationMs}ms · 上限 ${r.timeoutMs}ms/${r.memoryMb}MB` +
            (r.panels.length ? ` · 面板 ${r.panels.join(', ')}` : '') +
            '）',
        );
        if (r.error) out.push(`  错误: ${r.error}`);
        if (r.logs.length) {
          out.push('', '日志:');
          for (const l of r.logs) out.push(`  ${l}`);
        }
        if (r.heap.length) {
          out.push('', '变量堆:');
          for (const h of r.heap) out.push(`  ${h.key}  [${h.type}]  ${h.describe}`);
        } else if (r.ok) {
          out.push('', '变量堆为空——用 set(key, value) 把产出放进去');
        }
        return out.join('\n');
      },
    ),

    defineAction({
      id: 'script.runs',
      cli: [
        ['js', 'runs'],
        ['script', 'runs'],
      ],
      http: ['GET', '/api/script-runs'],
      summary: '最近的短脚本运行台账（时间 / 耗时 / 产出键 / 错误）',
      flags: {
        limit: { type: 'number', default: 20, hint: '取最近多少条（默认 20）' },
      },
    })(
      (ctx) => ({ runs: sandbox.recentRuns(Math.min(200, Math.max(1, Number(ctx.limit) || 20))) }),
      (r) => {
        if (!r.runs.length) return '（还没有运行记录）';
        const lines = ['最近运行:'];
        for (const x of r.runs) {
          const mark = x.ok ? 'ok  ' : 'FAIL';
          lines.push(
            `  ${x.at}  ${mark}  ${String(x.durationMs).padStart(5)}ms  ${x.source}` +
              (x.heapKeys.length ? `  → ${x.heapKeys.join(', ')}` : '') +
              (x.error ? `  ! ${x.error}` : ''),
          );
        }
        return lines.join('\n');
      },
    ),
  ],
});
