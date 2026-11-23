// AUTO-GENERATED —— 由 scripts/gen-actions.mjs 生成，勿手改。
//
// 收录本目录下每个文件的 default 导出（一条 action 一个文件）。
// **加一条 action = 新建一个文件 + 跑 `pnpm gen`**；模块的 index.ts 不需要改。
// 新鲜度由 tests/unit/gen-freshness.test.mjs 对账。

import templateCheckdir from './template-checkdir.js';
import templateCreate from './template-create.js';
import templateDescribe from './template-describe.js';
import templateList from './template-list.js';
import templatePorts from './template-ports.js';
import templatePreview from './template-preview.js';

/**
 * 本模块的全部 action。
 *
 * as const：保留字面量元组形状——注册表的编译期查重（重复 id / CLI 路径 / 路由）
 * 依赖它，丢了就只剩运行时兜底。
 */
export const ACTIONS = [
  templateCheckdir,
  templateCreate,
  templateDescribe,
  templateList,
  templatePorts,
  templatePreview,
] as const;

export { templateCheckdir };
export { templateCreate };
export { templateDescribe };
export { templateList };
export { templatePorts };
export { templatePreview };
