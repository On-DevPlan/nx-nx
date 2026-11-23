// script.create —— 新建脚本并登记到 manifest
//
// 一条 action 一个文件：声明（id/cli/http/summary）、契约（zod schema）与实现同文件。
// 模块 index.ts 不手工列举 action——清单由 `pnpm gen:actions` 生成。
import { defineAction } from '../../../runtime/types/action.js';
import * as service from '../../../core/script/service.js';

export default defineAction({
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
  (r) => `已创建: ${r.path}`
);
