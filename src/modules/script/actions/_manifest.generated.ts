// AUTO-GENERATED —— 由 scripts/gen-actions.mjs 生成，勿手改。
//
// 收录本目录下每个文件的 default 导出（一条 action 一个文件）。
// **加一条 action = 新建一个文件 + 跑 `pnpm gen`**；模块的 index.ts 不需要改。
// 新鲜度由 tests/unit/gen-freshness.test.mjs 对账。

import scriptAliases from './script-aliases.js';
import scriptCreate from './script-create.js';
import scriptDelete from './script-delete.js';
import scriptList from './script-list.js';
import scriptParams from './script-params.js';
import scriptRead from './script-read.js';
import scriptRun from './script-run.js';
import scriptRuns from './script-runs.js';
import scriptSandbox from './script-sandbox.js';
import scriptSave from './script-save.js';

/**
 * 本模块的全部 action。
 *
 * as const：保留字面量元组形状——注册表的编译期查重（重复 id / CLI 路径 / 路由）
 * 依赖它，丢了就只剩运行时兜底。
 */
export const ACTIONS = [
  scriptAliases,
  scriptCreate,
  scriptDelete,
  scriptList,
  scriptParams,
  scriptRead,
  scriptRun,
  scriptRuns,
  scriptSandbox,
  scriptSave,
] as const;

export { scriptAliases };
export { scriptCreate };
export { scriptDelete };
export { scriptList };
export { scriptParams };
export { scriptRead };
export { scriptRun };
export { scriptRuns };
export { scriptSandbox };
export { scriptSave };
