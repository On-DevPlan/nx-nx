// AUTO-GENERATED —— 由 scripts/gen-actions.mjs 生成，勿手改。
//
// 收录本目录下每个文件的 default 导出（一条 action 一个文件）。
// **加一条 action = 新建一个文件 + 跑 `pnpm gen`**；模块的 index.ts 不需要改。
// 新鲜度由 tests/unit/gen-freshness.test.mjs 对账。

import skillGet from './skill-get.js';
import skillGroups from './skill-groups.js';
import skillInstall from './skill-install.js';
import skillList from './skill-list.js';

/**
 * 本模块的全部 action。
 *
 * as const：保留字面量元组形状——注册表的编译期查重（重复 id / CLI 路径 / 路由）
 * 依赖它，丢了就只剩运行时兜底。
 */
export const ACTIONS = [
  skillGet,
  skillGroups,
  skillInstall,
  skillList,
] as const;

export { skillGet };
export { skillGroups };
export { skillInstall };
export { skillList };
