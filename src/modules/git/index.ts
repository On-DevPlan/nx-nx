// git 模块：装配层。
//
// **一条 action 一个文件**（actions/<名>.ts）——声明、契约（zod schema）与实现同文件；
// 清单由 `pnpm gen:actions` 扫 actions/ 目录生成（actions/_manifest.generated.ts）。
// 于是「加一条 action」= 新建一个文件 + 跑一次生成，本文件一行都不用改。
//
// 两条入口：
//   nx-nx git i        交互式（渐进式：能推导的不问，只问需要人拍板的）
//   nx-nx git <操作>   直连（非交互，参数全靠 flag）
// 两条入口跑的是**同一个 run**（modules/git/ops/**），所以不会跑偏。
import { defineModule } from '../../runtime/types/module.js';
import { registerFlow } from '../../core/terminal/flows.js';
import { runInteractive } from './interactive.js';
import { ACTIONS } from './actions/_manifest.generated.js';

// 登记交互流程：runtime 按名字取，core 与 runtime 都不需要知道 git 的存在。
// 装载期自检（runtime/registry.ts）盯着：声明了 interactive.flow 却没登记的，
// 启动时就报错，而不是等用户敲到那条命令才炸。
registerFlow('git', async (ctx) => {
  const operation = typeof ctx.operation === 'string' ? ctx.operation : undefined;
  const result = await runInteractive({ operation });
  return { printed: true, data: { kind: 'operation', result, printed: true } };
});

export default defineModule({
  id: 'git',
  title: 'Git',
  order: 40,
  actions: ACTIONS,
});
