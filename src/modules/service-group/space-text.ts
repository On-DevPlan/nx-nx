// 管理空间相关命令的文本呈现（CLI 输出 / HTTP 文本回执共用）。
//
// 为什么要单独成文件：服务组模块的动作表已经到行数上限，
// 而空间的文案自成一块（清单 / 状态 / 调用痕迹），拆出来各自都好读。
import type { SpaceActionResult } from '../../core/service/namespace.js';

/** sg space：方法清单 + 状态堆 + 调用记录 */
export function formatSpace(r: SpaceActionResult): string {
  if (!r.ok) return `✘ 空间装载失败：${r.error}`;
  const lines = ['管理空间:'];
  const methods = r.methods ?? [];
  if (methods.length) {
    lines.push(`  方法（${methods.length}）:`);
    for (const m of methods) lines.push(`    ${m.name}(${m.arity})${m.async ? ' async' : ''}`);
  } else {
    lines.push('  （空间没有方法——在面板里挂 globalThis.xxx = function () {} 或用 defineSpace）');
  }
  const heap = r.heap ?? [];
  if (heap.length) {
    lines.push(`  状态（${heap.length}）:`);
    for (const h of heap) lines.push(`    ${h.key}: ${h.describe}`);
  }
  const depth = (r.space as { stackDepth?: number } | undefined)?.stackDepth ?? 0;
  if (depth) lines.push(`  调用记录: ${depth} 次`);
  return lines.join('\n');
}

/** sg space-call：返回值 + 调用后的空间状态 + 这次调用的调用栈 */
export function formatSpaceCall(r: SpaceActionResult): string {
  if (!r.ok) {
    const lines = [`✘ 调用失败：${r.error}`];
    if (r.stack?.length) {
      lines.push('  调用栈:');
      for (const f of r.stack.slice(0, 8)) lines.push(`    ${f}`);
    }
    return lines.join('\n');
  }
  const lines = [`✔ ${r.method}() = ${JSON.stringify(r.value)}`];
  // 调用后的空间状态：空间是个实体，方法调用会改变它——得让人看见。
  if (r.heap?.length) {
    lines.push('  空间状态（调用后）:');
    for (const h of r.heap) lines.push(`    ${h.key}: ${h.describe}`);
  }
  // 调用栈：这次调用的落点与痕迹。
  const last = r.frames?.[r.frames.length - 1];
  if (last) {
    lines.push(`  调用栈: ${last.method} @ ${last.at} → ${last.resultType ?? last.error ?? '?'}`);
    for (const f of last.frames.slice(0, 4)) lines.push(`    ${f}`);
  }
  return lines.join('\n');
}
