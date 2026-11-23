// 服务组域：主/次脚本编排 + 活性检测 + 自愈 + 管理空间 + 执行流水线。
//
// 概念（与脚本域的关系）：
//   服务组 = 1 个主脚本（长驻服务，IO 重定向到日志）+ N 个 client 脚本（依次执行的请求方）
//   活性检测 = 端口可连 / HTTP 可响应；连续失败达阈值 → 自愈重启（serve 进程内的 watcher）
//   管理空间 = 共享面板（<group>.shared.mjs）被装载后的可管理实体：
//               有名字、有状态（堆）、有方法（可列举 / 可调用）、有调用栈。
//               空间里的 bool 方法在执行 server 之前先 check——不通过就不启动。
//
// 所有操作同时是 CLI 命令与 HTTP 路由；Web「服务」页的每个按钮都有等价命令。
//
// **装配层**：一条 action 一个文件（actions/<名>.ts），清单由 `pnpm gen:actions`
// 扫 actions/ 目录生成（actions/_manifest.generated.ts）——加一条 action =
// 新建一个文件 + 跑一次生成，本文件一行都不用改。
import { defineModule } from '../../runtime/types/module.js';
import { ACTIONS } from './actions/_manifest.generated.js';

export default defineModule({
  id: 'service-group',
  title: '服务',
  order: 35,
  actions: ACTIONS,
});
