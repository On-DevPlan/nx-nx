// git.operations —— 列出 git 模块支持的全部操作与参数。
//
// 纯只读：给 agent 与面板一份「这个模块能干什么」的清单。
// 危险操作（cleanup-history / force-push）也在清单里，但标注了 risk。
import { z } from 'zod';
import { defineAction } from '../../../runtime/types/action.js';
import * as service from '../service.js';

/** git.operations 的入参契约（CLI 与 HTTP 共用同一份）。 */
const input = z.object({});

export default defineAction({
  id: 'git.operations',
  cli: ['git', 'operations'],
  http: ['GET', '/api/git/operations'],
  summary: '列出 git 模块支持的全部操作与参数',
  schema: input,
})(async () => service.operationMeta(), (r) => {
  const lines = ['可用操作:'];
  for (const op of r) {
    lines.push(`  ${op.id.padEnd(20)} ${op.title}${op.risk === 'danger' ? '  [危险]' : ''}`);
    lines.push(`  ${' '.repeat(20)} ${op.desc}`);
    if (op.scenario) lines.push(`  ${' '.repeat(20)} 什么时候用: ${op.scenario}`);
    if (op.fields.length) {
      lines.push(`  ${' '.repeat(20)} 参数: ${op.fields.map((f) => `--${f.name}`).join(' ')}`);
    }
  }
  return lines.join('\n');
});
