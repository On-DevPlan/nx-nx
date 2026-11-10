// AUTO-GENERATED —— 由 spike/zod-decorator/src/codegen.ts 生成，勿手改。
//
// 形状：接口给类型，实现给路由与校验；传输层（base url / 鉴权 / 错误信封）不在这里，
// 由手写的 Transport 提供 —— 这就是「半自动化」的那一半。

import type { z } from 'zod';
import {
  demoConfigInput,
  demoConfigOutput,
  demoEchoInput,
  demoEchoOutput,
  demoGreetInput,
  demoGreetOutput,
  demoItemInput,
  demoItemOutput,
  demoPingOutput,
  demoStatsInput,
  demoStatsOutput,
} from '../src/demo/schemas.js';

/** 手写的那一半：传输层契约 */
export interface Transport {
  request(method: string, path: string, body?: unknown): Promise<unknown>;
}

export interface ApiClient {
/** 打个招呼 */
  greet(input: z.input<typeof demoGreetInput>): Promise<z.output<typeof demoGreetOutput>>;
/** 回声（数字默认值 / 数组 / 枚举） */
  echo(input: z.input<typeof demoEchoInput>): Promise<z.output<typeof demoEchoOutput>>;
/** 改配置（可重复 kv flag / json / dry-run） */
  config(input?: z.input<typeof demoConfigInput>): Promise<z.output<typeof demoConfigOutput>>;
/** 探活 */
  ping(): Promise<z.output<typeof demoPingOutput>>;
/** 统计（query 里的数字也要归一化） */
  stats(input?: z.input<typeof demoStatsInput>): Promise<z.output<typeof demoStatsOutput>>;
/** 按 id 取条目（路由参数即位置参数） */
  item(input: z.input<typeof demoItemInput>): Promise<z.output<typeof demoItemOutput>>;
}

export function createApiClient(transport: Transport): ApiClient {
  return {
    async greet(input: z.input<typeof demoGreetInput>) {
      const parsed = demoGreetInput.parse(input ?? {});
      const path = `/api/greet`;
      const body = { "name": parsed["name"], "loud": parsed["loud"] };
      return demoGreetOutput.parse(await transport.request("POST", path, body));
    },
    async echo(input: z.input<typeof demoEchoInput>) {
      const parsed = demoEchoInput.parse(input ?? {});
      const path = `/api/echo`;
      const body = { "text": parsed["text"], "repeat": parsed["repeat"], "tags": parsed["tags"], "mode": parsed["mode"] };
      return demoEchoOutput.parse(await transport.request("POST", path, body));
    },
    async config(input?: z.input<typeof demoConfigInput>) {
      const parsed = demoConfigInput.parse(input ?? {});
      const path = `/api/config`;
      const body = { "set": parsed["set"], "payload": parsed["payload"], "dry-run": parsed["dry-run"] };
      return demoConfigOutput.parse(await transport.request("PATCH", path, body));
    },
    async ping() {
      let path = `/api/ping`;
      const q = new URLSearchParams();
      const query = q.toString();
      if (query) path += (path.includes('?')) ? '&' + query : '?' + query;
      return demoPingOutput.parse(await transport.request("GET", path));
    },
    async stats(input?: z.input<typeof demoStatsInput>) {
      const parsed = demoStatsInput.parse(input ?? {});
      let path = `/api/stats`;
      const q = new URLSearchParams();
      if (parsed["days"] !== undefined) q.set("days", String(parsed["days"]));
      const query = q.toString();
      if (query) path += (path.includes('?')) ? '&' + query : '?' + query;
      return demoStatsOutput.parse(await transport.request("GET", path));
    },
    async item(input: z.input<typeof demoItemInput>) {
      const parsed = demoItemInput.parse(input ?? {});
      let path = `/api/items/${encodeURIComponent(String(parsed["id"]))}`;
      const q = new URLSearchParams();
      const query = q.toString();
      if (query) path += (path.includes('?')) ? '&' + query : '?' + query;
      return demoItemOutput.parse(await transport.request("GET", path));
    },
  };
}
