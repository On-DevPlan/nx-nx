// git.interactive —— 进入 git 交互模式：选操作 → 逐项补参数 → 确认 → 执行。
//
// 纯 CLI（http: null）：交互模式要接管终端的 stdin，HTTP 端没有这个前提。
// 非 TTY 环境（管道 / CI / --json）自动降级为只读快照，行为可脚本化。
//
// 「渐进式」的三条规矩（见 interactive.ts）：
//   1. 能从仓库现状推导出来的参数不问，直接采用并告诉用户采用了什么；
//   2. 只有一个选项的不问，自动选中；
//   3. 只问真正需要人拍板的（选哪个分支、选哪些文件）。
import { z } from 'zod';
import { defineAction } from '../../../runtime/types/action.js';
import * as service from '../service.js';
import { formatOperationResult, formatSnapshot } from '../text.js';
import type { GitInteractiveOutcome } from '../types.js';

/** git.interactive 的入参契约（CLI 与 HTTP 共用同一份）。 */
const input = z.object({
  operation: z.string().trim().optional().describe('预选操作；留空则从列表里选'),
});

export default defineAction({
  id: 'git.interactive',
  cli: [
    ['git', 'i'],
    ['git', 'interactive'],
  ],
  http: null,
  summary: '进入 git 交互模式：选操作 → 逐项补参数（能推导的不问）→ 确认 → 执行',
  // 交互式流程的开关：**必须声明**，否则 runtime 不认这条命令是交互式的，
  // 会一直走 run 的只读快照降级路径（用户敲 `git i` 看到的是一份清单，不是菜单）。
  // flow 名对应 core/terminal/flows.ts 里登记的流程；装载期自检盯着有没有漏登记。
  interactive: { flow: 'git' },
  args: [{ name: 'operation', required: false }],
  flags: {
    operation: { type: 'string', hint: '预选操作，如 extract-commits；留空则从列表里选' },
  },
  schema: input,
})(
  async (): Promise<GitInteractiveOutcome> => {
    // 走到这里说明不是真 TTY：降级为只读快照。
    return { kind: 'snapshot', snapshot: await service.interactiveSnapshot() };
  },
  (r) => {
    if (r.kind === 'snapshot') return formatSnapshot(r.snapshot);
    // 真 TTY 下结果已由交互流程打印过，这里不要再打印一遍。
    if (r.printed) return '';
    return formatOperationResult(r.result);
  }
);
