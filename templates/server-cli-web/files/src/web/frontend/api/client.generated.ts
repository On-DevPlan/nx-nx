// AUTO-GENERATED —— 由 scripts/gen-api-client.mjs（src/runtime/codegen.ts）生成，勿手改。
//
// 类型来自 zod schema（import type，zod 运行时不进浏览器包）；运行时校验在服务端
// （runtime/zod-bridge.ts，CLI 与 HTTP 共用同一份 schema）。传输层是手写的那一半：
// 调 createApiClient 时传入 api/client.ts 的 api() 即可。
// 重新生成：pnpm gen:api。新鲜度由 tests/unit/api-client.test.mjs 对账。

import type { z } from 'zod';
import type {
  homeBootstrapOutput,
  homeGreetInput,
  homeGreetOutput,
  homeHealthOutput,
  homeRoutesOutput,
  settingGetOutput,
  settingSetInput,
  settingSetOutput,
} from '../../../modules/home/schemas.js';

/** 传输层契约（手写的那一半）：返回 data（错误信封由 api() 拆好，失败即 throw）。 */
export interface Transport {
  request(method: string, path: string, body?: unknown): Promise<unknown>;
}

export interface ApiClient {
/** 一次取齐面板启动所需的全部上下文 */
  bootstrap(): Promise<z.output<typeof homeBootstrapOutput>>;
/** 列出 CLI 命令与 HTTP 路由的对照表 */
  routes(): Promise<z.output<typeof homeRoutesOutput>>;
/** 自检：存储目录是否可写 */
  health(): Promise<z.output<typeof homeHealthOutput>>;
/** 打个招呼（演示动作：问候次数累计进本机存储） */
  greet(input: z.input<typeof homeGreetInput>): Promise<z.output<typeof homeGreetOutput>>;
/** 读取全部设置（含头部导航分组 / 隐藏 / 平铺顺序） */
  get(): Promise<z.output<typeof settingGetOutput>>;
/** 修改设置（PATCH 语义：只改传入的项） */
  set(input?: z.input<typeof settingSetInput>): Promise<z.output<typeof settingSetOutput>>;
}

export function createApiClient(transport: Transport): ApiClient {
  return {
    // action: home.bootstrap
    async bootstrap() {
      const path = `/api/bootstrap`;
      return (await transport.request("GET", path)) as z.output<typeof homeBootstrapOutput>;
    },
    // action: home.routes
    async routes() {
      const path = `/api/routes`;
      return (await transport.request("GET", path)) as z.output<typeof homeRoutesOutput>;
    },
    // action: home.health
    async health() {
      const path = `/api/health`;
      return (await transport.request("GET", path)) as z.output<typeof homeHealthOutput>;
    },
    // action: home.greet
    async greet(input: z.input<typeof homeGreetInput>) {
      const inp = input ?? ({} as z.input<typeof homeGreetInput>);
      const path = `/api/greet`;
      const body = { "name": inp["name"], "loud": inp["loud"] };
      return (await transport.request("POST", path, body)) as z.output<typeof homeGreetOutput>;
    },
    // action: setting.get
    async get() {
      const path = `/api/settings`;
      return (await transport.request("GET", path)) as z.output<typeof settingGetOutput>;
    },
    // action: setting.set
    async set(input?: z.input<typeof settingSetInput>) {
      const inp = input ?? ({} as z.input<typeof settingSetInput>);
      const path = `/api/settings`;
      const body = { "key": inp["key"], "value": inp["value"], "set": inp["set"], "dry-run": inp["dry-run"] };
      return (await transport.request("PATCH", path, body)) as z.output<typeof settingSetOutput>;
    },
  };
}
