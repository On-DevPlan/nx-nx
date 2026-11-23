// system.open —— 用默认浏览器打开本机服务：open 7822 / open localhost:7822 / open <URL>
//
// 一条 action 一个文件：声明（id/cli/http/summary）、契约（zod schema）与实现同文件。
// 模块 index.ts 不手工列举 action——清单由 `pnpm gen:actions` 生成。
import { defineAction } from '../../../runtime/types/action.js';
import { openBrowser } from '../../../core/open.js';
import * as template from '../../template/service.js';
import { normalizeOpenTarget } from '../helpers.js';

export default defineAction({
  id: 'system.open',
  cli: ['open'],
  http: ['POST', '/api/open'],
  summary: '用默认浏览器打开本机服务：open 7822 / open localhost:7822 / open <URL>',
  args: ['target'],
})(
  async (ctx) => {
          const { url, port } = normalizeOpenTarget(ctx.target);
          // 探测只是「锦上添花」，只对本机端口做：服务可能起得慢，浏览器开在前面
          // 等它，比让用户再敲一遍命令强。探不到也照样打开，但要说清楚为什么。
          const listening = port === null ? null : !(await template.probePort(port));
          openBrowser(url);
          return { status: 'ok', url, listening };
        },
  (r) =>
          r.listening === false
            ? `${r.url} 上没有探测到服务（可能还没启动）——浏览器已打开，服务起好刷新即可`
            : `已打开 ${r.url}`
);
