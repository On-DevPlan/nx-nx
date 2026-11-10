// 模块注册表：所有功能域的 action 在此汇合（OOP：Registry 类，create 静态工厂装载）。
//
// CLI 命令表、HTTP 路由表、help 文本三者全部由 registry.actions 派生 —— 这是
// 「Web 上每个操作都有等价 CLI 命令」得以成为**结构性保证**而非口头约定的原因：
// 一条 action 同时声明 cli 与 http，二者写在同一处，不可能分叉。
//
// 新增功能域两步：
//   1. 写 src/modules/<name>/：ModuleBase 子类（action 声明 + 服务编排），export 一个实例
//   2. 在下面 registry 的 create 调用里加上它
//
// 面板页面**不在这里登记**。页面是纯前端事实，由 src/web/frontend/routes/*.ts
// 自动发现（页面本体在 pages/<名>/index.tsx，见 app/pages.ts），与后端模块没有
// 一一对应关系：一个模块可以对应零个、一个或多个页面，多个模块也可以共用一个页面。
// 把两者绑成「同名同数」是旧骨架最贵的一处耦合——它逼着每加一个页面都回来改后端。
import { ModuleBase } from './types/module.js';
import type { AnyModule, RegistryChecks } from './types/module.js';
import { cliPathsOf } from './spec.js';
import { homeModule } from '../modules/home/index.js';
import { skillModule } from '../modules/skill/index.js';
import type { ActionShape } from './types/action.js';

export interface BoundAction {
  id: string;
  module: string;
  cli: unknown;
  http?: unknown;
  web?: boolean;
  run: (...a: unknown[]) => unknown;
  [k: string]: unknown;
}

export class Registry {
  private constructor(
    readonly modules: readonly AnyModule[],
    readonly actions: readonly BoundAction[],
  ) {}

  /**
   * 唯一装载入口（静态工厂：构造函数私有，const 泛型推断只有函数/方法能提供）。
   *
   * 编译期：RegistryChecks 对模块/action id、CLI/HTTP 键查重 + 路由歧义检测
   * （写错在声明处当场红）；运行时：按 order 排序 + 装载自检（与编译期互为备份）。
   */
  static create<const M extends readonly AnyModule[]>(modules: M & RegistryChecks<M>): Registry {
    const sorted = [...modules].sort((a, b) => (a.order ?? 100) - (b.order ?? 100));
    const actions: BoundAction[] = sorted.flatMap((m) =>
      (m.actions || []).map((a) => ({ ...(a as object), module: m.id }) as BoundAction),
    );

    // 装载期自检（运行时防线）：把「两个模块声明了同名命令」这类问题暴露在
    // 启动瞬间，而不是等某个用户敲到那条命令时才发现。
    //
    // 方向性约定（刻意的不对称）：
    //   - 每条 action 都必须有 cli —— 保证「Web 上能做的，CLI 都能做」
    //   - 有 http 才谈得上 Web 入口；http: null 只留给两类：
    //       a) 豁免前缀（serve / server / skill —— 天然是 CLI 侧能力）
    //       b) 显式 web: false（这个操作就是不给面板入口）
    //     其余 http: null 一律视为漏声明，启动即失败（与 eslint 的 local/action-parity 同规）
    //   - 不允许声明 http 却没有 cli，也不允许 http 与 web: false 同时出现
    //
    // 豁免前缀必须与 eslint.config.js 里 local/action-parity 的 cliOnlyPrefixes 一致，
    // tests/unit/registry.test.mjs 会对账。
    const seenIds = new Set<string>();
    const seenCli = new Set<string>();
    const seenHttp = new Set<string>();
    for (const a of actions) {
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
        if (a.web === false) {
          throw new Error(`action 同时声明了 http 与 web: false，语义冲突: ${a.id}`);
        }
      } else if (http === null) {
        const segment = paths[0]?.[0];
        if (a.web !== false && !(segment && CLI_ONLY_PREFIXES.includes(segment))) {
          throw new Error(
            `action 没有声明 HTTP 路由（CLI 与 Web 必须成对；纯 CLI 请显式 web: false 或使用豁免前缀）: ${a.id}`
          );
        }
      } else {
        throw new Error(`action 的 http 必须是路由数组或显式 null: ${a.id}`);
      }

      if (!a.run) throw new Error(`action 缺少 run: ${a.id}`);
    }

    return new Registry(sorted, actions);
  }
}

// 豁免前缀：与 eslint.config.js 里 local/action-parity 的 cliOnlyPrefixes 必须一致
// （tests/unit/registry.test.mjs 对账），先声明再被 create 的自检引用。
export const CLI_ONLY_PREFIXES = ['serve', 'server', 'skill'];

/** 模块元组（const 断言保住字面量类型）：typed client 与编译期查重都靠它的形状。 */
export const MODULES = [homeModule, skillModule] as const;

/** 全项目唯一注册表实例：CliApp / ApiRouter / 编程入口都从它取 action 与命令表。 */
export const registry = Registry.create(MODULES);

// 兼容别名：ACTIONS 是 registry.actions 的投影；tests 与文档沿用旧名。
export const ACTIONS = registry.actions;

// ModuleBase 仅为类型连贯在此重导出：模块作者从 types/module.js 拿基类，
// runtime 侧不主动扩散它。
export type { ModuleBase };
