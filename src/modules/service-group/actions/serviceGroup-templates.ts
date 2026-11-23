// serviceGroup.templates —— 列出服务组模板（模板 = 脚本 + 配置 + 下一步命令；默认 node-ping）
//
// 一条 action 一个文件：声明（id/cli/http/summary）、契约（zod schema）与实现同文件。
// 模块 index.ts 不手工列举 action——清单由 `pnpm gen:actions` 生成。
import { defineAction } from '../../../runtime/types/action.js';
import * as service from '../service.js';
import { formatTemplates } from '../template-text.js';

export default defineAction({
  id: 'serviceGroup.templates',
  cli: ['sg', 'templates'],
  http: ['GET', '/api/service-templates'],
  summary: '列出服务组模板（模板 = 脚本 + 配置 + 下一步命令；默认 node-ping）',
})(
  () => ({ templates: service.templates() }),
  (r) => formatTemplates(r.templates)
);
