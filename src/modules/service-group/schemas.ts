// 服务组域的输入契约：CLI 与 HTTP 共用同一份 zod schema。
//
// 为什么不写在 index.ts：一个 action 声明 + 渲染函数已经很占行数，
// 再塞五种输入形状就会撞上单文件 300 行的硬上限。更重要的是——
// 「id 长什么样」「mode 有哪几种」是**领域规则**，不是某个 handler 的细节；
// 集中在这里，新增 action 时直接复用，不会各写一份正则漂移。
import { z } from 'zod';

export const groupId = z
  .string()
  .regex(/^[a-z][a-z0-9-]{0,31}$/, '服务组 id 须小写字母开头，≤32 位，仅含小写字母/数字/连字符');

export const idInput = z.object({ id: groupId });

export const statusInput = z.object({ id: groupId.optional() });

export const initInput = z.object({
  id: groupId,
  template: z.string().default('node-ping'),
  port: z.coerce.number().int().min(1).max(65535).optional(),
  name: z.string().trim().min(1).optional(),
  force: z.boolean().optional(),
  dry: z.boolean().optional(),
});

export const setInput = z.object({
  id: groupId,
  config: z.string().refine((s) => {
    try {
      const v: unknown = JSON.parse(s);
      return Boolean(v) && typeof v === 'object' && !Array.isArray(v);
    } catch {
      return false;
    }
  }, 'config 必须是 JSON 对象字符串'),
});

export const startInput = z.object({
  id: groupId,
  values: z
    .string()
    .optional()
    .refine((s) => {
      if (s === undefined || s === '') return true;
      try {
        const v: unknown = JSON.parse(s);
        return Boolean(v) && typeof v === 'object' && !Array.isArray(v);
      } catch {
        return false;
      }
    }, 'values 必须是启动参数字符串到字符串的 JSON 对象'),
});

export const stopInput = z.object({
  id: groupId,
  mode: z.enum(['auto', 'script', 'port', 'pid']).optional(),
});

export const autohealInput = z.object({
  id: groupId,
  state: z.enum(['on', 'off']),
});

export const spaceCallInput = z.object({
  id: groupId,
  method: z.string().trim().min(1, '方法名不能为空'),
  args: z
    .string()
    .refine((s) => {
      try {
        return Array.isArray(JSON.parse(s));
      } catch {
        return false;
      }
    }, '--args 必须是 JSON 数组')
    .optional(),
});
