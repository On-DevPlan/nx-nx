// script.sandbox —— 在沙箱（QuickJS 虚拟机）里跑一段代码：可用共享面板、产出可 JSON 化的变量堆
//
// 一条 action 一个文件：声明（id/cli/http/summary）、契约（zod schema）与实现同文件。
// 模块 index.ts 不手工列举 action——清单由 `pnpm gen:actions` 生成。
import { defineAction } from '../../../runtime/types/action.js';
import * as sandbox from '../../../core/script/sandbox.js';

export default defineAction({
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
        }
);
