// system.store —— 显示存储路径（可用环境变量覆盖）
//
// 一条 action 一个文件：声明（id/cli/http/summary）、契约（zod schema）与实现同文件。
// 模块 index.ts 不手工列举 action——清单由 `pnpm gen:actions` 生成。
import { defineAction } from '../../../runtime/types/action.js';
import { storePathFromEnv, STORE_ENV } from '../../../core/paths.js';

export default defineAction({
  id: 'system.store',
  cli: ['store', 'path'],
  http: ['GET', '/api/store'],
  summary: '显示存储路径（可用环境变量覆盖）',
})(
  () => ({ status: 'ok', path: storePathFromEnv(), env: STORE_ENV }),
  (r) => `${r.path}    （环境变量 ${r.env} 或 --store 覆盖）`
);
