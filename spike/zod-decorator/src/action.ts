// spike：动作声明层 —— 「zod schema + 注解（装饰器）」的最小可验证模型。
//
// 要验证的问题（来自任务原文）：
//   1. CLI 能不能完全自动化（树 / help / 解析 / 派发全部派生，零手写 switch）
//   2. 给前端用的 apiclient 能自动到什么程度（剩下的必须手写什么，要能量化）
//   3. 注解方式在 Node 22 + tsx + TS 5.9 下能不能用，代价是什么
//
// 三条实现选择，都是实测逼出来的：
//
// (a) 元数据挂在**方法函数**上（WeakMap），不碰 `context.metadata`。
//     实测：tsx（esbuild）会给 `context.metadata` 传一个对象，但 `Symbol.metadata`
//     在 Node 22.23 里是 undefined——一旦用 tsc 编译后交给原生 Node，
//     `context.metadata` 就是 undefined，元数据会静默丢失。挂函数上与运行时无关，最稳。
//
// (b) 装饰器**不改方法签名**。TC39 标准装饰器要求返回类型与原方法兼容，
//     因此装饰器无法把 schema 的类型注入到方法参数上——handler 的入参类型
//     只能自己写 `z.output<typeof schema>`。这是注解式相对 builder 式的类型劣势。
//
//     注意 input / output 两个类型各有用处，别混：
//       - `z.input`  = 调用方要提供的形状（`.default()` 的字段在这里是可选的）
//       - `z.output` = 解析后的形状（默认值已填上，`.default()` 的字段在这里必填）
//     handler 拿到的是**解析后**的值 → 用 z.output；前端 client 的入参 → 用 z.input。
//
// (c) 一个 action 必须同时声明 **input schema 与 output schema**。
//     装饰器拿不到 handler 的返回值类型，输出类型只能靠 output schema 显式声明；
//     这正是「前端 apiclient 半自动化」的根源之一（详见 codegen.ts 头注释）。
import type { ZodType } from 'zod';

export interface ActionMeta {
  /** 全局唯一 id，编成 `模块.动作`（如 `demo.greet`） */
  id: string;
  /** CLI 命令路径的各段（树的一层）。如 ['greet'] 或 ['sg', 'run'] */
  cli: readonly string[];
  /** 额外的 CLI 别名（完整路径） */
  aliases?: readonly (readonly string[])[];
  /** HTTP 路由：[METHOD, PATTERN]。缺省 = 纯 CLI */
  http?: readonly [string, string];
  /** 一句话说明，进 help 与前端 */
  summary?: string;
  /** 位置参数：字段名按声明顺序消费 argv */
  args?: readonly string[];
  /** 输入 schema：CLI 与 HTTP 共用的真相源 */
  input: ZodType;
  /** 输出 schema：前端 client 的返回类型来源 */
  output: ZodType;
}

/** 装饰器元数据表：方法函数 → 声明 */
const META = new WeakMap<object, ActionMeta>();

/**
 * 标注一个 action 方法。
 *
 * 用法：
 * ```ts
 * class DemoApi {
 *   @action({ id: 'demo.greet', cli: ['greet'], http: ['POST', '/api/greet'],
 *             input: demoGreetInput, output: demoGreetOutput })
 *   greet(ctx: z.input<typeof demoGreetInput>) { ... }
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
