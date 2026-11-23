// 模板域：action 声明。CLI 命令表、HTTP 路由表、help 文本全部由这里派生，
// 所以「面板上有按钮、CLI 里没命令」在结构上不可能发生。
//
// openFlags: true 的 action 表示它的可选项**由数据驱动**（模板的 option schema），
// 声明期无法枚举。这类 action 在 run 里自行按 schema 取白名单，见 pickOptions。
//
// **装配层**：一条 action 一个文件（actions/<名>.ts），清单由 `pnpm gen:actions`
// 扫 actions/ 目录生成（actions/_manifest.generated.ts）——加一条 action =
// 新建一个文件 + 跑一次生成，本文件一行都不用改。
import { defineModule } from '../../runtime/types/module.js';
import { ACTIONS } from './actions/_manifest.generated.js';

export default defineModule({
  id: 'template',
  title: '模板',
  order: 10,
  actions: ACTIONS,
});
