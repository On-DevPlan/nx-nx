// skill 模块的 zod 契约：每个 action 一对 input/output schema。
//
// 命名约定（codegen 靠它自动拼 import 名）：<camelCase(actionId)>Input / Output，
// 如 skill.install → skillInstallInput。约定破了 codegen 会生成指向不存在符号的
// import，tests/unit/api-client.test.mjs 的新鲜度对账当场红。
//
// 输出 schema 是真实守门（runtime/zod-bridge 的 parseOutput 逐次校验）——
// 字段以 core/skills 的实际返回为准（InstallResult / GroupInstallResult /
// SkillGetResult），不要凭记忆杜撰。
import { z } from 'zod';

// ---- 公共碎片 ----
const installResultShape = z.object({
  status: z.enum(['ok', 'conflict', 'skipped']),
  name: z.string().optional(),
  path: z.string(),
  files: z.number(),
  installed: z.boolean().optional(),
  replaced: z.boolean().optional(),
});

// ---- skill.list ----
export const skillListInput = z.object({});
export const skillListOutput = z.object({
  skills: z.array(z.string()),
  groups: z.array(z.string()),
  defaultGroup: z.string(),
  source: z.string(),
});

// ---- skill.groups ----
export const skillGroupsInput = z.object({});
export const skillGroupsOutput = z.object({
  source: z.string(),
  groups: z.record(
    z.string(),
    z.object({
      skills: z.array(z.string()),
      summary: z.string().optional(),
    }),
  ),
  warning: z.string().optional(),
});

// ---- skill.get ----
export const skillGetInput = z.object({
  name: z.string().optional(),
  ref: z.string().optional(),
  to: z.string().optional(),
  force: z.boolean().optional(),
});
export const skillGetOutput = z.object({
  skillName: z.string(),
  ref: z.string(),
  contentBytes: z.number(),
  prefix: z.string(),
  content: z.string(),
  installStatus: z.string(),
});

// ---- skill.install（单个 InstallResult 或整组 GroupInstallResult）----
export const skillInstallInput = z.object({
  name: z.string().optional(),
  all: z.boolean().optional(),
  group: z.string().optional(),
  to: z.string().optional(),
  force: z.boolean().optional(),
});
export const skillInstallOutput = z.union([
  z.object({
    status: z.enum(['ok', 'conflict']),
    group: z.string(),
    skills: z.array(installResultShape),
  }),
  installResultShape,
]);
