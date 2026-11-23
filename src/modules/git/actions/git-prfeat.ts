// git.prfeat —— 基于当前分支创建 workerea-<名字> 与 feat-<名字>，并切到工作分支。
//
// 纯 CLI：改分支结构是有副作用的动作，不做面板上的「一键按钮」。
import { z } from 'zod';
import { defineAction } from '../../../runtime/types/action.js';
import * as service from '../service.js';
import { formatOperationResult } from '../text.js';

/** git.prfeat 的入参契约（CLI 与 HTTP 共用同一份）。 */
const input = z.object({
  name: z
    .string()
    .trim()
    .min(1, '特性名字不能为空')
    .max(60, '特性名字过长')
    .regex(/^[A-Za-z0-9._-]+$/, '特性名字只能包含字母、数字与 - _ .')
    .describe('特性名字（英文）；会生成 workerea-<名字> 与 feat-<名字>'),
});

export default defineAction({
  id: 'git.prfeat',
  cli: ['git', 'prfeat'],
  http: null,
  summary: '创建 workerea-<名字> 与 feat-<名字> 分支并切到工作分支',
  flags: {
    name: { type: 'string', hint: '特性名字（英文）' },
  },
  schema: input,
})(async (ctx) => service.runOperation('prfeat', { name: ctx.name }), (r) => formatOperationResult(r));
