// events 端点的传输层：把 core/events 的进程内通知搬到两条通道上。
//
// 同一条 run 按 transport 分流（变更通知标准的「双通道等价」）：
//   HTTP → SSE 长连接（面板 EventSource 直连）
//   CLI  → NDJSON 逐行（agent 可管道消费）
//
// 通知不带业务 payload（见 core/events.ts 的标准说明），所以帧很小、
// 两边都不需要序列化复杂数据。
import type { ServerResponse } from 'node:http';
import { subscribe } from '../../core/events.js';

/** SSE 帧间隔的常量集中地（测试里缩短心跳不必改业务代码）。 */
export const SSE_HEARTBEAT_MS = 25_000;

/** HTTP 传输：SSE。挂上订阅，写入即推送；客户端断开即清理并结束 Promise。 */
export function streamSSE(res: ServerResponse): Promise<void> {
  res.writeHead(200, {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-store',
    connection: 'keep-alive',
    // 反向代理（nginx 等）默认缓冲响应，会把长连的帧攒住——明确关掉
    'x-accel-buffering': 'no',
  });
  res.write('retry: 3000\n\n');
  res.write(': connected\n\n');

  // 心跳：保活中间设备的长连（默认 25s 一次，远小于常见 60s 空闲超时）
  const heartbeat = setInterval(() => {
    try {
      res.write(': ping\n\n');
    } catch {
      /* 写失败由 close 事件收尾 */
    }
  }, SSE_HEARTBEAT_MS);

  let seq = 0;
  const unsubscribe = subscribe((topic) => {
    seq += 1;
    // 单调 id：浏览器 EventSource 重连可凭 Last-Event-ID 对齐（通知是信号
    // 不是状态，重放无意义，这里只保证不重复不回退）
    try {
      res.write(`id: ${seq}\nevent: changed\ndata: ${JSON.stringify({ topic })}\n\n`);
    } catch {
      /* 同上 */
    }
  });

  return new Promise<void>((resolve) => {
    res.on('close', () => {
      clearInterval(heartbeat);
      unsubscribe();
      resolve();
    });
  });
}

export interface StreamNDJSONOptions {
  timeoutSec?: number;
  limit?: number;
  signal?: AbortSignal;
}

/** CLI 传输：NDJSON 逐行（一行一条通知）。timeout/limit 给长连划边界。 */
export async function streamNDJSON({ timeoutSec, limit, signal }: StreamNDJSONOptions = {}): Promise<void> {
  let count = 0;
  let done: () => void;
  const finished = new Promise<void>((resolve) => {
    done = resolve;
  });
  const timer = timeoutSec ? setTimeout(done!, timeoutSec * 1000) : undefined;

  const unsubscribe = subscribe((topic) => {
    count += 1;
    process.stdout.write(JSON.stringify({ topic }) + '\n');
    if (limit && count >= limit) done!();
  });

  const onAbort = () => done!();
  signal?.addEventListener('abort', onAbort, { once: true });

  try {
    await finished;
  } finally {
    unsubscribe();
    if (timer) clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}
