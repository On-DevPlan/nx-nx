// system.bootstrap —— 一次取齐面板启动所需的全部上下文
//
// 一条 action 一个文件：声明（id/cli/http/summary）、契约（zod schema）与实现同文件。
// 模块 index.ts 不手工列举 action——清单由 `pnpm gen:actions` 生成。
import { defineAction } from '../../../runtime/types/action.js';
import { bootstrap } from '../bootstrap.js';

export default defineAction({
  id: 'system.bootstrap',
  cli: ['bootstrap', 'show'],
  http: ['GET', '/api/bootstrap'],
  summary: '一次取齐面板启动所需的全部上下文',
})(
  () => bootstrap(),

);
