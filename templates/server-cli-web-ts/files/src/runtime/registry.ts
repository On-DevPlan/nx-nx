// 模块注册表：所有功能域的 action 在此汇合。
//
// CLI 命令表、HTTP 路由表、help 文本三者全部由此派生 —— 这是
// 「Web 上每个操作都有等价 CLI 命令」得以成为**结构性保证**而非口头约定的原因：
// 一条 action 同时声明 cli 与 http，二者写在同一处，不可能分叉。
//
// 新增功能域只需两步：
//   1. 写 src/modules/<name>/（index.ts 声明 actions，service.ts 写业务，view.tsx 写面板）
//   2. 在下面 import 并加进 defineModules；再到 web/frontend/registry.ts 登记视图
// 编译期类型检查 + tests/unit 一致性断言，漏登记直接失败。
import { defineModules } from './types/module.js';
import type { ActionShape } from './types/action.js';
import { cliPathsOf } from './spec.js';
import home from '../modules/home/index.js';

// 编译期：defineModules 对模块/action id、CLI/HTTP 键查重 + 路由歧义检测；
// 运行时：按 order 排序。
export const MODULES = defineModules([home]);

export interface BoundAction {
  id: string;
  module: string;
  cli: unknown;
  http?: unknown;
  run: (...a: unknown[]) => unknown;
  [k: string]: unknown;
}

export const ACTIONS: BoundAction[] = MODULES.flatMap((m) =>
  (m.actions || []).map((a) => ({ ...(a as object), module: m.id }) as BoundAction),
);

// 装载期自检（运行时防线，与编译期检查互为备份）：
// 把「两个模块声明了同名命令」这类问题暴露在启动瞬间，
// 而不是等某个用户敲到那条命令时才发现。
//
// 方向性约定（刻意的不对称）：
//   - 每条 action 都必须有 cli —— 保证「Web 上能做的，CLI 都能做」
//   - http 允许为 null（纯 CLI 命令），但**不允许**声明 http 却没有 cli
const seenIds = new Set<string>();
const seenCli = new Set<string>();
const seenHttp = new Set<string>();
for (const a of ACTIONS) {
  if (seenIds.has(a.id)) throw new Error('action id 重复: ' + a.id);
  seenIds.add(a.id);

  const paths = cliPathsOf(a as unknown as { cli: ActionShape['cli'] });
  if (!paths.length) throw new Error(`action 没有声明 CLI 命令（Web 操作必须有 CLI 等价）: ${a.id}`);
  for (const path of paths) {
    const key = path.join(' ');
    if (seenCli.has(key)) throw new Error(`CLI 命令重复: ${key}（action ${a.id}）`);
    seenCli.add(key);
  }

  const http = a.http;
  if (http) {
    const [method, pattern] = http as [string, string];
    const httpKey = method + ' ' + pattern;
    if (seenHttp.has(httpKey)) throw new Error(`HTTP 路由重复: ${httpKey}（action ${a.id}）`);
    seenHttp.add(httpKey);
  } else if (http !== null) {
    throw new Error(`action 的 http 必须是路由数组或显式 null: ${a.id}`);
  }

  if (!a.run) throw new Error(`action 缺少 run: ${a.id}`);
}
