// 模块与注册表的类型系统。
//
// 编译期装载检查：Registry.create 的泛型约束（RegistryChecks）把注册表运行时循环
// （重复模块 id / action id / CLI 路径 / HTTP 路由 + 路由歧义）前移成编译错误——
// 声明处当场红，不等启动。
//
// serve 端的 OOP 约定：模块是 **ModuleBase 的子类**（id/title/actions 是只读成员，
// 业务编排调服务类的方法），注册表是 **Registry 类**（create 静态工厂做装载检查），
// CLI 与 HTTP 各自是 CliApp / ApiRouter / PanelServer 的实例方法。

import type { Assert, Err } from './action.js';
import type { AmbiguousPairs } from './http.js';

/** 模块的运行时形状：ModuleBase 子类都满足它；Registry 与 help 只认这个。 */
export interface AnyModule {
  readonly id: string;
  readonly title: string;
  readonly order?: number;
  readonly actions: readonly unknown[];
}

/**
 * 模块基类。子类用只读字段声明 id / title / actions：
 *
 *   export class HomeModule extends ModuleBase {
 *     readonly id = 'home';
 *     readonly title = '首页';
 *     readonly order = 1;
 *     readonly actions = [ defineAction({...})(...) , ... ] as const;
 *   }
 *
 * - 业务逻辑不写在模块里：模块只做「声明 + 装配」，编排调服务类（HomeService 等）；
 * - actions 数组**必须 as const**：装载检查的类型机器（AllActions 等）靠只读元组
 *   逐元素析构每条 action 的字面量声明，普通数组会让查重悄悄退化成空操作；
 * - readonly 字段保住字面量类型（`readonly id = 'home'` 的类型就是 'home'），
 *   模块 id / CLI 路径 / HTTP 路由的查重全部依赖这一点。
 */
export abstract class ModuleBase {
  abstract readonly id: string;
  abstract readonly title: string;
  /** 排序权重，小的在前；缺省按 100。 */
  readonly order?: number;
  abstract readonly actions: readonly unknown[];
}

// ---- 元组工具：查重 ----

export type Includes<T extends readonly unknown[], V> = T extends readonly [infer H, ...infer R]
  ? [H] extends [V]
    ? [V] extends [H]
      ? true
      : Includes<R, V>
    : Includes<R, V>
  : false;

export type Dup<T extends readonly unknown[], Seen extends readonly unknown[] = []> = T extends readonly [
  infer H,
  ...infer R,
]
  ? Includes<Seen, H> extends true
    ? H | Dup<R, Seen>
    : Dup<R, [...Seen, H]>
  : never;

// ---- 从 action 推出 CLI / HTTP 键 ----

type JoinPath<T extends readonly string[]> = T extends readonly [infer H extends string]
  ? H
  : T extends readonly [infer H extends string, ...infer R extends readonly string[]]
    ? `${H} ${JoinPath<R>}`
    : '';

// 对应 cliPathsOf：单路径直接 join；多路径（别名）逐个 join
export type CliKey<A> = A extends { cli: infer C }
  ? C extends readonly string[]
    ? C[0] extends string
      ? JoinPath<C>
      : C[number] extends infer P
        ? P extends readonly string[]
          ? JoinPath<P>
          : never
        : never
    : never
  : never;

export type HttpKey<A> = A extends { http: infer H }
  ? H extends readonly [string, string]
    ? `${H[0]} ${H[1]}`
    : never
  : never;

// ---- 展平模块表的全部 action ----

type ActionsOf<M> = M extends { actions: infer A extends readonly unknown[] } ? A : [];

export type AllActions<M extends readonly unknown[]> = M extends readonly [infer H, ...infer R]
  ? [...ActionsOf<H>, ...AllActions<R extends readonly unknown[] ? R : []>]
  : [];

// ---- 元组映射工具（先证明是元组再映射，避免泛型 mapped 退化成对象）----

export type ModuleIds<M> = M extends readonly unknown[]
  ? { [K in keyof M]: M[K] extends { id: infer I } ? I : never }
  : [];

export type ActionIds<AA> = AA extends readonly unknown[]
  ? { [K in keyof AA]: AA[K] extends { id: infer I } ? I : never }
  : [];

export type ActionCliKeys<AA> = AA extends readonly unknown[]
  ? { [K in keyof AA]: CliKey<AA[K]> }
  : [];

export type ActionHttpKeys<AA> = AA extends readonly unknown[]
  ? { [K in keyof AA]: HttpKey<AA[K]> }
  : [];

// 过滤元组中的 never（无 http 的 action 产生 never，会污染歧义检测）
export type FilterNever<T extends readonly unknown[]> = T extends readonly [infer H, ...infer R]
  ? [H] extends [never]
    ? FilterNever<R>
    : [H, ...FilterNever<R>]
  : [];

// 模式键带上**方法**：同一个路径挂 GET 与 PATCH 两条 action 是常规 REST 写法
// （例如 GET /api/settings 读、PATCH /api/settings 写），不该被判成歧义；
// 真正该报的是「同一路径 + 同一方法」的重复声明，以及 /x/:a 与 /x/:b 这种结构性重叠。
export type ActionPatterns<AA> = FilterNever<
  AA extends readonly unknown[]
    ? {
        [K in keyof AA]: AA[K] extends { http: infer H }
          ? H extends readonly [infer M, infer P]
            ? M extends string
              ? P extends string
                ? `${M} ${P}`
                : never
              : never
            : never
          : never;
      }
    : []
>;

// ---- 注册表级校验（每条对应 Registry.create 运行时自检的一项）----

export type RegistryChecks<M extends readonly unknown[]> = unknown & Assert<
    [Dup<ModuleIds<M>>] extends [never] ? true : false,
    '模块 id 重复'
  >
  & Assert<
    [Dup<ActionIds<AllActions<M>>>] extends [never] ? true : false,
    'action id 重复'
  >
  & Assert<
    [Dup<ActionCliKeys<AllActions<M>>>] extends [never] ? true : false,
    'CLI 命令路径重复'
  >
  & Assert<
    [Dup<ActionHttpKeys<AllActions<M>>>] extends [never] ? true : false,
    'HTTP 路由重复'
  >
  & Assert<
    [AmbiguousPairs<ActionPatterns<AllActions<M>>>] extends [never] ? true : false,
    '存在结构性歧义的路由（不同模式匹配同一批 URL，任何排序都无法区分）'
  >;

/** 校验通过的模块元组类型；Registry.create 的实现内部用它标注返回值。 */
export type CheckedModules<M extends readonly unknown[]> = M & RegistryChecks<M>;

// 工具重导出，便于业务侧只从 types 入口取类型
export type { Err };
