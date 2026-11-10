// action 装饰器：在 ModuleBase 子类的方法上声明 action（zod schema 即契约）。
//
// 来源：spike/zod-decorator（0.10.0 验证）的 action.ts + registry.ts，
// 装饰方法 → zodActionsOf(instance) 收集 →
// 模块的 actions 字段。单一通道：全部业务 action 与平台命令都走这里。
//
// 三条实测结论（0.10.0 验证逼出来的，改前先读）：
//
// (a) 元数据挂在**方法函数**上（WeakMap），不碰 `context.metadata`。
//     tsx（esbuild）会给 context.metadata 传对象，但 `Symbol.metadata` 在 Node 22 里
//     是 undefined——tsc 编译后交给原生 Node 时 context.metadata 就是 undefined，
//     元数据会静默丢失。挂函数上与运行时无关，最稳。
//
// (b) 装饰器**不改方法签名**（TC39 要求返回类型与原方法兼容），handler 的入参类型
//     只能手写 `z.output<typeof schema>`。z.input（调用方形状，.default 字段可选）
//     与 z.output（解析后形状，.default 字段必填）别混：handler 拿的是 z.output。
//
// (c) 一个 action 必须同时声明 input 与 output schema——装饰器拿不到 handler
//     的返回值类型，输出类型只能显式声明。这是 codegen apiclient 的类型来源。
import { describeInput, type FieldDesc } from './zod-bridge.js';
import type { ZodType } from 'zod';

/** 装饰式 action 绑定到实例后的公共形状（registry.actions 的元素类型）。 */
export interface BoundAction {
  id: string;
  module: string;
  cli: readonly string[];
  http?: readonly [string, string];
  summary?: string;
  run: (input: unknown) => unknown;
  render?: (result: any, ctx?: any) => string;
  [k: string]: unknown;
}

export interface ActionMeta {
  /** 全局唯一 id，编成 `模块.动作`（如 `home.greet`） */
  id: string;
  /** CLI 命令路径的各段（如 ['greet']） */
  cli: readonly string[];
  /** HTTP 路由：[METHOD, PATTERN]。缺省 = 纯 CLI */
  http?: readonly [string, string];
  /** 一句话说明，进 help 与面板 */
  summary?: string;
  /** 位置参数：字段名按声明顺序消费 argv */
  args?: readonly string[];
  /** 输入 schema：CLI 与 HTTP 共用的真相源 */
  input: ZodType;
  /** 输出 schema：codegen apiclient 的返回类型来源。缺省 = 不守出参（平台命令）。 */
  output?: ZodType;
  /** CLI 人读渲染（面板不用——面板拿 data 走 JSON）。 */
  /** 参数用 any：上下文类型若给 never，r.greeting 这类属性访问会整片红； */
  /** ctx 是 CLI 解析产物（help 的 render 要读 ctx.topic）。 */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- 见上；eslint 对 any 仅警告
  render?: (result: any, ctx?: any) => string;
}

/** 装饰器元数据表：方法函数 → 声明。WeakMap 不阻止方法被 GC。 */
const META = new WeakMap<object, ActionMeta>();

/**
 * 标注一个 action 方法。用法：
 *
 * ```ts
 * export class HomeModule extends ModuleBase {
 *   @action({ id: 'home.greet', cli: ['greet'], http: ['POST', '/api/greet'],
 *             args: ['name'], input: homeGreetInput, output: homeGreetOutput,
 *             render: (r) => r.greeting })
 *   greet(ctx: z.output<typeof homeGreetInput>) { return this.svc.greet(ctx.name, ctx.loud === true); }
 * }
 * ```
 */
export function action(meta: ActionMeta) {
  return function <F extends (...args: never[]) => unknown>(value: F, context: { kind: string }): F {
    if (context.kind !== 'method') {
      throw new Error(`@action 只能标注方法（收到 kind=${context.kind}）`);
    }
    META.set(value as unknown as object, meta);
    return value;
  };
}

/** 取某个方法上的 action 声明；没标注过返回 undefined */
export function metaOf(method: unknown): ActionMeta | undefined {
  if (typeof method !== 'function') return undefined;
  return META.get(method as object);
}

/**
 * 装饰式 action 绑定到实例后的形状：在 BoundAction 之上多带 zod 契约。
 * CliApp 与 ApiRouter 据此走 zod 解析通道（单一通道，全部 action 都带 fields）。
 */
export interface ZodBoundAction extends BoundAction {
  id: string;
  cli: readonly string[];
  http?: readonly [string, string];
  summary?: string;
  /** 位置参数字段名（describeInput 的排序依据） */
  args?: readonly string[];
  /** 逐字段说明（收集时用 describeInput 算好一次，CLI/HTTP/usage/codegen 共用） */
  fields: FieldDesc[];
  input: ZodType;
  output?: ZodType;
  render?: (result: any, ctx?: any) => string;
}

/**
 * 收集一个实例（ModuleBase 子类）里被 @action 标注的方法，绑定成 actions 数组。
 *
 * handler 以**实例**为 `this` 调用——注解式的卖点就是「声明与实现写在一起、
 * 类可以持有状态」（服务经构造注入，handler 调 this.svc.*）。
 * 收集时用 getOwnPropertyDescriptor 取值而不是 proto[name]——
 * 后者会执行 getter，只为了看一眼它有没有被装饰器标过。
 *
 * 装载期自检：路由 :param 未在 args 里声明 → 当场报错（单通道下这是该一致性
 * 的唯一防线——类型层无法校验运行期才拼出来的元数据）。
 */
export function zodActionsOf(instance: object): ZodBoundAction[] {
  const proto = Object.getPrototypeOf(instance);
  const moduleId = String((instance as { id?: unknown }).id ?? '');
  const out: ZodBoundAction[] = [];
  for (const name of Object.getOwnPropertyNames(proto)) {
    if (name === 'constructor') continue;
    const descriptor = Object.getOwnPropertyDescriptor(proto, name);
    const method = descriptor?.value;
    if (typeof method !== 'function') continue;
    const meta = metaOf(method);
    if (!meta) continue;

    if (meta.http) {
      const declared = new Set(meta.args ?? []);
      for (const p of routeParams(meta.http[1])) {
        if (!declared.has(p)) {
          throw new Error(
            `action ${meta.id} 的路由 ${meta.http[1]} 含 :${p}，但 args 里没声明同名位置参数` +
              '（运行时会是 undefined）',
          );
        }
      }
    }

    const fields = meta.input ? describeInput(meta.input, meta.args ?? []) : [];
    out.push({
      id: meta.id,
      cli: meta.cli,
      http: meta.http,
      summary: meta.summary,
      module: moduleId,
      fields,
      input: meta.input,
      output: meta.output,
      render: meta.render,
      run: (ctx: unknown) => (method as (i: unknown) => unknown).call(instance, ctx),
    });
  }
  return out;
}

/** 路由模式里的 :param */
export function routeParams(pattern: string): string[] {
  return [...pattern.matchAll(/:([\w-]+)/g)].map((m) => m[1]!);
}
