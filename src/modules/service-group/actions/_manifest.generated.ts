// AUTO-GENERATED —— 由 scripts/gen-actions.mjs 生成，勿手改。
//
// 收录本目录下每个文件的 default 导出（一条 action 一个文件）。
// **加一条 action = 新建一个文件 + 跑 `pnpm gen`**；模块的 index.ts 不需要改。
// 新鲜度由 tests/unit/gen-freshness.test.mjs 对账。

import serviceGroupAutoheal from './serviceGroup-autoheal.js';
import serviceGroupCheck from './serviceGroup-check.js';
import serviceGroupDelete from './serviceGroup-delete.js';
import serviceGroupHub from './serviceGroup-hub.js';
import serviceGroupInit from './serviceGroup-init.js';
import serviceGroupList from './serviceGroup-list.js';
import serviceGroupLogs from './serviceGroup-logs.js';
import serviceGroupRun from './serviceGroup-run.js';
import serviceGroupScript from './serviceGroup-script.js';
import serviceGroupSet from './serviceGroup-set.js';
import serviceGroupShow from './serviceGroup-show.js';
import serviceGroupSpace from './serviceGroup-space.js';
import serviceGroupSpaceCall from './serviceGroup-spaceCall.js';
import serviceGroupSpaces from './serviceGroup-spaces.js';
import serviceGroupStart from './serviceGroup-start.js';
import serviceGroupStatus from './serviceGroup-status.js';
import serviceGroupStop from './serviceGroup-stop.js';
import serviceGroupTemplates from './serviceGroup-templates.js';

/**
 * 本模块的全部 action。
 *
 * as const：保留字面量元组形状——注册表的编译期查重（重复 id / CLI 路径 / 路由）
 * 依赖它，丢了就只剩运行时兜底。
 */
export const ACTIONS = [
  serviceGroupAutoheal,
  serviceGroupCheck,
  serviceGroupDelete,
  serviceGroupHub,
  serviceGroupInit,
  serviceGroupList,
  serviceGroupLogs,
  serviceGroupRun,
  serviceGroupScript,
  serviceGroupSet,
  serviceGroupShow,
  serviceGroupSpace,
  serviceGroupSpaceCall,
  serviceGroupSpaces,
  serviceGroupStart,
  serviceGroupStatus,
  serviceGroupStop,
  serviceGroupTemplates,
] as const;

export { serviceGroupAutoheal };
export { serviceGroupCheck };
export { serviceGroupDelete };
export { serviceGroupHub };
export { serviceGroupInit };
export { serviceGroupList };
export { serviceGroupLogs };
export { serviceGroupRun };
export { serviceGroupScript };
export { serviceGroupSet };
export { serviceGroupShow };
export { serviceGroupSpace };
export { serviceGroupSpaceCall };
export { serviceGroupSpaces };
export { serviceGroupStart };
export { serviceGroupStatus };
export { serviceGroupStop };
export { serviceGroupTemplates };
