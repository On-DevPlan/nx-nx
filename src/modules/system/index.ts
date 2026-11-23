// 系统模块：只做聚合与自检，没有自己的业务状态。
//
// 分层例外：本模块是**刻意的聚合器**，允许 import 其他模块的 service。
// 其余模块之间禁止互相依赖（eslint 的否定式禁列强制，见 eslint.config.js）。
//
// **装配层**：一条 action 一个文件（actions/<名>.ts），清单由 `pnpm gen:actions`
// 扫 actions/ 目录生成（actions/_manifest.generated.ts）——加一条 action =
// 新建一个文件 + 跑一次生成，本文件一行都不用改。
import { defineModule } from '../../runtime/types/module.js';
import { ACTIONS } from './actions/_manifest.generated.js';

// 共用辅助函数随模块一起导出（单测与其它调用方按模块路径取）。
export { normalizeOpenTarget, parseHttpQuery } from './helpers.js';

export default defineModule({
  id: 'system',
  title: '系统',
  order: 1,
  actions: ACTIONS,
});
