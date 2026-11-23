// script.run —— 运行内置脚本或任意 .mjs 脚本（内置全局函数已注入）
//
// 一条 action 一个文件：声明（id/cli/http/summary）、契约（zod schema）与实现同文件。
// 模块 index.ts 不手工列举 action——清单由 `pnpm gen:actions` 生成。
import { defineAction } from '../../../runtime/types/action.js';
import * as service from '../../../core/script/service.js';

export default defineAction({
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
        }
);
