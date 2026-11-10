// home 模块的 zod 契约：每个 action 一对 input/output schema。
//
// 这份文件是「半自动化」的关键证据：它同时被三处消费——
//   1. 服务端：@action 装饰器引用它做入参校验（CLI 与 HTTP 共用同一份）
//   2. codegen：生成前端 apiclient 的入参/返回类型（import type，零运行时进浏览器包）
//   3. 未来：前端表单校验可按需 import 同一份 schema（zod 本身浏览器安全）
//
// 命名约定（codegen 靠它自动拼 import 名）：<camelCase(actionId)>Input / Output，
// 如 home.greet → homeGreetInput。约定破了 codegen 会生成指向不存在符号的代码，
// tests/unit/api-client.test.mjs 的新鲜度对账会当场红。
//
// 已知边界（0.10.0 验证结论，别踩）：
//   - z.coerce 不能用（'false'→true、''→0）——归一化在 runtime/zod-bridge.ts 做；
//   - handler 入参类型手写 z.output（解析后形状）；前端 client 入参是 z.input；
//   - `set` 这类 kv 字段的值是多态的（字符串/数组/对象都可能），用 z.unknown()
//     让服务层的 schema 校验器（service.ts 的 SCHEMA.coerce）继续当家。
import { z } from 'zod';

const commandEntryShape = z.object({
  id: z.string(),
  module: z.string(),
  command: z.string(),
  usage: z.string(),
  http: z.object({ method: z.string(), path: z.string() }).nullable(),
  summary: z.string().optional(),
});

// ---- home.bootstrap ----
export const homeBootstrapInput = z.object({});
export const homeBootstrapOutput = z.object({
  app: z.object({ name: z.string(), title: z.string(), description: z.string(), version: z.string() }),
  storePath: z.string(),
  storeEnv: z.string(),
  commands: z.array(commandEntryShape),
});

// ---- home.routes ----
export const homeRoutesInput = z.object({});
export const homeRoutesOutput = z.object({
  status: z.literal('ok'),
  count: z.number(),
  routes: z.array(
    z.object({
      id: z.string(),
      module: z.string(),
      cli: z.string(),
      http: z.string().nullable(),
      summary: z.string().optional(),
    }),
  ),
});

// ---- home.health ----
export const homeHealthInput = z.object({});
export const homeHealthOutput = z.object({
  status: z.enum(['ok', 'blocked']),
  storePath: z.string(),
  reason: z.string(),
});

// ---- home.greet ----
export const homeGreetInput = z.object({
  name: z.string().min(1, '名字不能为空'),
  loud: z.boolean().optional(),
});
export const homeGreetOutput = z.object({
  greeting: z.string(),
  name: z.string(),
  count: z.number(),
  at: z.string(),
});

/** 推断出的出参类型（handler 与前端 client 都用它）。 */
export type GreetingResult = z.output<typeof homeGreetOutput>;

// ---- setting.get ----
export const settingGetInput = z.object({});
export const settingGetOutput = z.object({
  settings: z.looseObject({
    navGroups: z.array(z.object({ title: z.string(), views: z.array(z.string()) })),
    navHidden: z.array(z.string()),
    navOrder: z.array(z.string()),
    theme: z.string(),
  }),
  schema: z.array(z.object({ key: z.string(), hint: z.string() })),
});

// ---- setting.set ----
export const settingSetInput = z.object({
  key: z.string().optional(),
  // --value 是 CLI 字符串 token；结构化值走 --set（record unknown，值多态由
  // service.ts 的 SCHEMA.coerce 当家）。声明成 string 而不是 unknown：
  // unknown 会被 zod-bridge 判成 json 字段，--value dark 会被误 JSON.parse。
  value: z.string().optional(),
  set: z.record(z.string(), z.unknown()).optional(),
  'dry-run': z.boolean().optional(),
});
export const settingSetOutput = z.union([
  z.object({
    status: z.literal('skipped'),
    dryRun: z.literal(true),
    wouldSet: z.record(z.string(), z.unknown()),
  }),
  z.object({ status: z.literal('ok'), settings: settingGetOutput.shape.settings }),
]);
