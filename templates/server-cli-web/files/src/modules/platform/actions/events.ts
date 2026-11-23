// events —— 变更通知流（SSE 长连接；CLI 等价 NDJSON）。
//
// 变更通知标准的入口端点：任何 store 写入（save/mutate 成功落盘）都会广播
// topic，这条 action 把通知搬到两条通道——HTTP 走 SSE（面板 EventSource 直连，
// 收到即重新 fetch），CLI 走 NDJSON 逐行。别名 watch 与 events 等价。
//
// stream: true 的机制：ApiRouter 在 zod 校验之后把 req/res/url 塞进
// input.__raw 透传，action 自己接管响应（SSE 不是 req/resp 形状，不走 JSON 信封）。
import { z } from 'zod';
import type { ServerResponse } from 'node:http';
import { action } from '../../../runtime/action-decorator.js';
import { ActionBase, type ActionInput, type ActionRunMeta } from '../../../runtime/action-base.js';
import { streamNDJSON, streamSSE } from '../live.js';

/** events 的入参契约。 */
const input = z.object({
  timeout: z.number().optional().describe('最多监听多少秒后自动结束（默认不限，Ctrl+C 结束）'),
  limit: z.number().optional().describe('最多输出多少条通知后自动结束（默认不限）'),
});

export class EventsAction extends ActionBase<typeof input> {
  @action({
    id: 'events',
    cli: [['events'], ['watch']],
    http: ['GET', '/api/events'],
    summary: '变更通知流：数据写入即推送（SSE 长连接；CLI 等价 NDJSON）',
    input,
    stream: true,
  })
  override async run(ctx: ActionInput<this['_input']>, opts: ActionRunMeta = {}): Promise<void> {
    // __raw 是 ApiRouter 在 zod parse 之后注入的运行时通道句柄（不在公共契约
    // schema 里——zod v4 默认剥未知键，先塞会被丢掉）。这里局部展开让它可见。
    const raw = ctx as typeof ctx & { __raw?: { res?: ServerResponse } };
    if (opts.transport === 'http' && raw.__raw?.res) {
      await streamSSE(raw.__raw.res);
      return;
    }
    await streamNDJSON({ timeoutSec: ctx.timeout, limit: ctx.limit });
  }
}
