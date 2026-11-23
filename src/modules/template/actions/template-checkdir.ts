// template.checkdir —— 检查目标目录是否可用（存在且非空则不可用）
//
// 一条 action 一个文件：声明（id/cli/http/summary）、契约（zod schema）与实现同文件。
// 模块 index.ts 不手工列举 action——清单由 `pnpm gen:actions` 生成。
import { defineAction } from '../../../runtime/types/action.js';
import * as service from '../service.js';

export default defineAction({
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
            : `不可用: ${r.path} 已有 ${r.entries} 项内容`
);
