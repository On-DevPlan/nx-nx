// serviceGroup.init —— 按模板创建服务组：生成脚本 + 写配置 + 打印下一步（默认模板 node-ping）
//
// 一条 action 一个文件：声明（id/cli/http/summary）、契约（zod schema）与实现同文件。
// 模块 index.ts 不手工列举 action——清单由 `pnpm gen:actions` 生成。
import { defineAction } from '../../../runtime/types/action.js';
import * as service from '../service.js';
import { formatInit } from '../template-text.js';
import { initInput } from '../schemas.js';

export default defineAction({
  id: 'serviceGroup.init',
  cli: ['sg', 'init'],
  http: ['POST', '/api/service-groups-init/:id'],
  summary: '按模板创建服务组：生成脚本 + 写配置 + 打印下一步（默认模板 node-ping）',
  args: ['id'],
  flags: {
    template: { type: 'string', default: 'node-ping', hint: '模板 id（sg templates 查看）' },
    port: { type: 'number', hint: '监听端口（默认取模板配置）' },
    name: { type: 'string', hint: '显示名（默认取模板配置）' },
    force: { type: 'boolean', hint: '覆盖已存在的同名脚本与服务组' },
    dry: { type: 'boolean', hint: '只看会生成什么，不落盘' },
  },
  // 命令行表面（help / 强转）由上表描述，合法性在这里收口：
  // id 正则与模板里的校验同一口径，端口范围不再靠 service 里手写判断兜底。
  schema: initInput,
})(
  (ctx) =>
          service.initFromTemplate({
            groupId: ctx.id,
            templateId: ctx.template,
            port: ctx.port,
            name: ctx.name,
            force: ctx.force,
            dryRun: ctx.dry,
          }),
  (r) => formatInit(r)
);
