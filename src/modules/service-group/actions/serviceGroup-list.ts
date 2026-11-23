// serviceGroup.list —— 列出服务组（配置 + 运行态）
//
// 一条 action 一个文件：声明（id/cli/http/summary）、契约（zod schema）与实现同文件。
// 模块 index.ts 不手工列举 action——清单由 `pnpm gen:actions` 生成。
import { defineAction } from '../../../runtime/types/action.js';
import * as service from '../service.js';
import { formatGroupList } from '../group-text.js';

export default defineAction({
  id: 'serviceGroup.list',
  cli: ['sg', 'list'],
  http: ['GET', '/api/service-groups'],
  summary: '列出服务组（配置 + 运行态）',
})(
  () => ({ groups: service.listGroups() }),
  (r) => formatGroupList(r.groups)
);
