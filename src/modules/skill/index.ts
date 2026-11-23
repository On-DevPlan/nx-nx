// skill 域：管理随包分发的多 skill（主 skill nx-nx + 开发 skill nx-dev）。
// 平台级能力，action 只做 I/O 编排；发现/分组/安装/导出的真相在 core/skills*.ts。
//
// **装配层**：一条 action 一个文件（actions/<名>.ts），清单由 `pnpm gen:actions`
// 扫 actions/ 目录生成（actions/_manifest.generated.ts）——加一条 action =
// 新建一个文件 + 跑一次生成，本文件一行都不用改。
import { defineModule } from '../../runtime/types/module.js';
import { ACTIONS } from './actions/_manifest.generated.js';

export default defineModule({
  id: 'skill',
  title: 'Skill',
  order: 20,
  actions: ACTIONS,
});
