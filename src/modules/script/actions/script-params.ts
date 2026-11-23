// script.params —— 列出脚本声明的参数（源码里的 @param 注释）——面板据此渲染输入框
//
// 一条 action 一个文件：声明（id/cli/http/summary）、契约（zod schema）与实现同文件。
// 模块 index.ts 不手工列举 action——清单由 `pnpm gen:actions` 生成。
import { defineAction } from '../../../runtime/types/action.js';
import * as service from '../../../core/script/service.js';

export default defineAction({
  id: 'script.params',
  cli: ['script', 'params'],
  http: ['GET', '/api/scripts/:name/params'],
  summary: '列出脚本声明的参数（源码里的 @param 注释）——面板据此渲染输入框',
  args: ['name'],
})(
  (ctx) => ({ params: service.readParams(ctx.name) }),
  (r) => {
          if (!r.params.length) return '（该脚本没有声明参数；在源码头部写 // @param 名称 类型 默认值 说明 即可）';
          const lines = ['脚本参数:'];
          for (const p of r.params) {
            const t = p.type === 'select' ? `select(${(p.options ?? []).join('|')})` : p.type;
            lines.push(`  --${p.name.padEnd(14)} ${t.padEnd(20)} 默认 ${p.default || '-'}   ${p.desc}`);
          }
          return lines.join('\n');
        }
);
