// script.runs —— 最近的短脚本运行台账（时间 / 耗时 / 产出键 / 错误）
//
// 一条 action 一个文件：声明（id/cli/http/summary）、契约（zod schema）与实现同文件。
// 模块 index.ts 不手工列举 action——清单由 `pnpm gen:actions` 生成。
import { defineAction } from '../../../runtime/types/action.js';
import * as sandbox from '../../../core/script/sandbox.js';

export default defineAction({
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
        }
);
