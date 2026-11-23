// 脚本域：跑随包分发的 .mjs 脚本，内置全局函数（别名模块）已注入。
//
// 与「模板」「skill」两个域同形：一份 action 声明 → CLI 命令 + HTTP 路由 + help 文本。
// 脚本本身是纯 .mjs（零构建、零依赖），Node 侧只做「哪个脚本 + 哪些参数」的编排。
//
// 脚本怎么拿到内置函数：解释器（assets/scripts/_runner.mjs）在导入脚本前把别名
// 模块里的函数挂到 globalThis 上，脚本里直接用裸名调用（walk(dir)、run(cmd, args)）。
//
// **装配层**：一条 action 一个文件（actions/<名>.ts），清单由 `pnpm gen:actions`
// 扫 actions/ 目录生成（actions/_manifest.generated.ts）——加一条 action =
// 新建一个文件 + 跑一次生成，本文件一行都不用改。
import { defineModule } from '../../runtime/types/module.js';
import { ACTIONS } from './actions/_manifest.generated.js';

export default defineModule({
  id: 'script',
  title: '脚本',
  order: 30,
  actions: ACTIONS,
});
