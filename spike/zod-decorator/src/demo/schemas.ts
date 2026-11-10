// spike：demo 的 schema —— **纯 zod，零 node 依赖**。
//
// 这份文件是「半自动化」的关键证据：它同时被三处消费——
//   1. 服务端：action 的入参校验（CLI 与 HTTP 共用）
//   2. 前端：表单校验（同一份 schema 搬进浏览器包，zod 是浏览器安全的）
//   3. codegen：生成 apiclient 的入参/返回类型
//
// 命名约定（codegen 靠它自动拼出 import 名）：<camelCase(actionId)>Input / Output。
// 约定一旦破坏，codegen 生成的 import 就会指向不存在的符号 —— 由测试钉住。
import { z } from 'zod';

// demo.greet —— 位置参数 + 布尔 flag
export const demoGreetInput = z.object({
  name: z.string().min(1, '名字不能为空'),
  loud: z.boolean().optional(),
});
export const demoGreetOutput = z.object({
  greeting: z.string(),
  count: z.number(),
});

// demo.echo —— 数字默认值 + 数组 + 枚举
export const demoEchoInput = z.object({
  text: z.string(),
  repeat: z.number().int().min(1).max(10).default(1),
  tags: z.array(z.string()).optional(),
  mode: z.enum(['plain', 'upper']).optional(),
});
export const demoEchoOutput = z.object({
  echoed: z.array(z.string()),
  mode: z.string(),
});

// demo.config —— kv（可重复 flag）+ json + 布尔
export const demoConfigInput = z.object({
  set: z.record(z.string(), z.string()).optional(),
  payload: z.unknown().optional(),
  'dry-run': z.boolean().optional(),
});
export const demoConfigOutput = z.object({
  applied: z.record(z.string(), z.string()),
  dryRun: z.boolean(),
});

// demo.ping —— 无参
export const demoPingInput = z.object({});
export const demoPingOutput = z.object({
  pong: z.string(),
});

// demo.item —— 路由参数即位置参数
export const demoItemInput = z.object({
  id: z.string(),
});
export const demoItemOutput = z.object({
  id: z.string(),
  name: z.string(),
});

// demo.stats —— GET + query 参数（query 里的数字是字符串，要先归一化）
export const demoStatsInput = z.object({
  days: z.number().int().min(1).max(365).default(7),
});
export const demoStatsOutput = z.object({
  days: z.number(),
  window: z.string(),
});
