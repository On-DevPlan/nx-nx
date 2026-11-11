// skill 模块的 zod 契约：每个 action 一对 input/output schema。
//
// 命名约定（codegen 靠它自动拼 import 名）：<camelCase(actionId)>Input，
// 如 skill.install → skillInstallInput。约定破了 codegen 会生成指向不存在符号的
// import，tests/unit/api-client.test.mjs 的新鲜度对账当场红。
//
import { z } from 'zod';

// ---- 公共碎片 ----
// ---- skill.list ----
export const skillListInput = z.object({});
// ---- skill.groups ----
export const skillGroupsInput = z.object({});
// ---- skill.get ----
export const skillGetInput = z.object({
  name: z.string().optional(),
  ref: z.string().optional(),
  to: z.string().optional(),
  force: z.boolean().optional(),
});
// ---- skill.install（单个 InstallResult 或整组 GroupInstallResult）----
export const skillInstallInput = z.object({
  name: z.string().optional(),
  all: z.boolean().optional(),
  group: z.string().optional(),
  to: z.string().optional(),
  force: z.boolean().optional(),
});
