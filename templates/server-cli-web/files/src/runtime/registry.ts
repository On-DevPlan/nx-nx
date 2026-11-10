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
import type { AnyModule } from './types/module.js';
import type { ZodBoundAction } from './action-decorator.js';
import { cliPathsOf } from './spec.js';
import { platformModule } from '../modules/platform/index.js';
import { homeModule } from '../modules/home/index.js';
import { skillModule } from '../modules/skill/index.js';

export class Registry {
  private constructor(
    readonly modules: readonly AnyModule[],
    readonly actions: readonly ZodBoundAction[],
  ) {}

  /**
   * 唯一装载入口。单一通道（@action 装饰器）下 actions 是运行时收集的数组，
   * 编译期 RegistryChecks 已随 builder 通道移除——装载正确性由这里的运行时
   * 自检负责（重复 id / 重复 CLI 路由 / 缺 run / 缺 http 的纯 CLI 混淆）。
   * 运行时按 order 排序。
   */
  static create(modules: readonly ModuleBase[]): Registry {
    const sorted = [...modules].sort((a, b) => (a.order ?? 100) - (b.order ?? 100));
    const actions: ZodBoundAction[] = sorted.flatMap((m) =>
      (m.actions || []).map((a) => ({ ...(a as object), module: m.id }) as ZodBoundAction),
    );

    // 装载期自检（唯一防线——单一通道下没有编译期对账可互为备份）：
    // 把「两个模块声明了同名命令」这类问题暴露在启动瞬间，而不是等某个用户
    // 敲到那条命令时才发现。
    //
    // 方向性约定：
    //   - 每条 action 都必须有 cli —— 保证「Web 上能做的，CLI 都能做」
    //   - http 缺省 = 纯 CLI（@action 装饰器里不写 http 就是有意不给面板入口；
    //     面板入口的硬闸在 tests/unit/registry.test.mjs 的「非 GET 操作必须有
    //     面板入口」——非 GET 的 action 必须在前端被引用到）
    //   - 声明了 http 却没有 cli 同样启动即失败
    const seenIds = new Set<string>();
    const seenCli = new Set<string>();
    const seenHttp = new Set<string>();
    for (const a of actions) {
      if (seenIds.has(a.id)) throw new Error('action id 重复: ' + a.id);
      seenIds.add(a.id);

      const paths = cliPathsOf(a);
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
      } else {
        // http 缺省 = 纯 CLI（@action 装饰器不写 http 就是有意不给面板入口）
        if (!a.run) throw new Error(`action 缺少 run: ${a.id}`);
        continue;
      }

      if (!a.run) throw new Error(`action 缺少 run: ${a.id}`);
    }

    return new Registry(sorted, actions);
  }
}

/** 模块元组：平台 + 各业务域（tests/unit/registry.test.mjs 对账模块目录一一对应）。 */
export const MODULES = [platformModule, homeModule, skillModule] as const;

/** 全项目唯一注册表实例：CliApp / ApiRouter / 编程入口都从它取 action 与命令表。 */
export const registry = Registry.create(MODULES);

// 兼容别名：ACTIONS 是 registry.actions 的投影；tests 与文档沿用旧名。
export const ACTIONS = registry.actions;

// ModuleBase 仅为类型连贯在此重导出：模块作者从 types/module.js 拿基类，
// runtime 侧不主动扩散它。
export type { ModuleBase };
