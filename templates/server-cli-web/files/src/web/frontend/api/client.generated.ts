// AUTO-GENERATED —— 由 scripts/gen-api-client.mjs（src/runtime/codegen.ts）生成，勿手改。
//
// 类型来自 zod schema（import type，zod 运行时不进浏览器包）；运行时校验在服务端
// （runtime/zod-bridge.ts，CLI 与 HTTP 共用同一份 schema）。传输层是手写的那一半：
// 调 createApiClient 时传入 api/client.ts 的 api() 即可。
// 重新生成：pnpm gen:api。新鲜度由 tests/unit/api-client.test.mjs 对账。

import type { z } from 'zod';
import type {
  BootstrapAction,
  GetSettingsAction,
  GreetAction,
  HealthAction,
  RoutesAction,
  SetSettingsAction,
} from '../../../modules/home/actions/_manifest.generated.js';
import type {
  InstallAction,
  SkillGetAction,
  SkillGroupsAction,
  SkillListAction,
} from '../../../modules/skill/actions/_manifest.generated.js';

/** 传输层契约（手写的那一半）：返回 data（错误信封由 api() 拆好，失败即 throw）。 */
export interface Transport {
  request(method: string, path: string, body?: unknown): Promise<unknown>;
}

export interface ApiClient {
/** 一次取齐面板启动所需的全部上下文 */
  bootstrap(): Promise<Awaited<ReturnType<InstanceType<typeof BootstrapAction>['run']>>>;
/** 读取全部设置（含头部导航分组 / 隐藏 / 平铺顺序） */
  get(): Promise<Awaited<ReturnType<InstanceType<typeof GetSettingsAction>['run']>>>;
/** 打个招呼（演示动作：问候次数累计进本机存储） */
  greet(input: z.input<InstanceType<typeof GreetAction>['_input']>): Promise<Awaited<ReturnType<InstanceType<typeof GreetAction>['run']>>>;
/** 自检：存储目录是否可写 */
  health(): Promise<Awaited<ReturnType<InstanceType<typeof HealthAction>['run']>>>;
/** 列出 CLI 命令与 HTTP 路由的对照表 */
  routes(): Promise<Awaited<ReturnType<InstanceType<typeof RoutesAction>['run']>>>;
/** 修改设置（PATCH 语义：只改传入的项） */
  set(input?: z.input<InstanceType<typeof SetSettingsAction>['_input']>): Promise<Awaited<ReturnType<InstanceType<typeof SetSettingsAction>['run']>>>;
/** 导出 skill 文档（并幂等安装） */
  skillGet(input?: z.input<InstanceType<typeof SkillGetAction>['_input']>): Promise<Awaited<ReturnType<InstanceType<typeof SkillGetAction>['run']>>>;
/** 列出每个 group 含哪些 skill */
  groups(): Promise<Awaited<ReturnType<InstanceType<typeof SkillGroupsAction>['run']>>>;
/** 安装 skill、整组 skill 或全部 skill */
  install(input?: z.input<InstanceType<typeof InstallAction>['_input']>): Promise<Awaited<ReturnType<InstanceType<typeof InstallAction>['run']>>>;
/** 列出可装的 skill 与 group */
  list(): Promise<Awaited<ReturnType<InstanceType<typeof SkillListAction>['run']>>>;
}

export function createApiClient(transport: Transport): ApiClient {
  return {
    // action: home.bootstrap
    async bootstrap() {
      const path = `/api/bootstrap`;
      return (await transport.request("GET", path)) as Awaited<ReturnType<InstanceType<typeof BootstrapAction>['run']>>;
    },
    // action: setting.get
    async get() {
      const path = `/api/settings`;
      return (await transport.request("GET", path)) as Awaited<ReturnType<InstanceType<typeof GetSettingsAction>['run']>>;
    },
    // action: home.greet
    async greet(input: z.input<InstanceType<typeof GreetAction>['_input']>) {
      const inp = input ?? ({} as z.input<InstanceType<typeof GreetAction>['_input']>);
      const path = `/api/greet`;
      const body = { "name": inp["name"], "loud": inp["loud"] };
      return (await transport.request("POST", path, body)) as Awaited<ReturnType<InstanceType<typeof GreetAction>['run']>>;
    },
    // action: home.health
    async health() {
      const path = `/api/health`;
      return (await transport.request("GET", path)) as Awaited<ReturnType<InstanceType<typeof HealthAction>['run']>>;
    },
    // action: home.routes
    async routes() {
      const path = `/api/routes`;
      return (await transport.request("GET", path)) as Awaited<ReturnType<InstanceType<typeof RoutesAction>['run']>>;
    },
    // action: setting.set
    async set(input?: z.input<InstanceType<typeof SetSettingsAction>['_input']>) {
      const inp = input ?? ({} as z.input<InstanceType<typeof SetSettingsAction>['_input']>);
      const path = `/api/settings`;
      const body = { "key": inp["key"], "value": inp["value"], "set": inp["set"], "dry-run": inp["dry-run"] };
      return (await transport.request("PATCH", path, body)) as Awaited<ReturnType<InstanceType<typeof SetSettingsAction>['run']>>;
    },
    // action: skill.get
    async skillGet(input?: z.input<InstanceType<typeof SkillGetAction>['_input']>) {
      const inp = input ?? ({} as z.input<InstanceType<typeof SkillGetAction>['_input']>);
      let path = `/api/skill-content`;
      const q = new URLSearchParams();
      if (inp["name"] !== undefined) q.set("name", String(inp["name"]));
      if (inp["ref"] !== undefined) q.set("ref", String(inp["ref"]));
      if (inp["to"] !== undefined) q.set("to", String(inp["to"]));
      if (inp["force"] !== undefined) q.set("force", String(inp["force"]));
      const query = q.toString();
      if (query) path += (path.includes('?')) ? '&' + query : '?' + query;
      return (await transport.request("GET", path)) as Awaited<ReturnType<InstanceType<typeof SkillGetAction>['run']>>;
    },
    // action: skill.groups
    async groups() {
      const path = `/api/skill-groups`;
      return (await transport.request("GET", path)) as Awaited<ReturnType<InstanceType<typeof SkillGroupsAction>['run']>>;
    },
    // action: skill.install
    async install(input?: z.input<InstanceType<typeof InstallAction>['_input']>) {
      const inp = input ?? ({} as z.input<InstanceType<typeof InstallAction>['_input']>);
      const path = `/api/skill-install`;
      const body = { "name": inp["name"], "all": inp["all"], "group": inp["group"], "to": inp["to"], "force": inp["force"] };
      return (await transport.request("POST", path, body)) as Awaited<ReturnType<InstanceType<typeof InstallAction>['run']>>;
    },
    // action: skill.list
    async list() {
      const path = `/api/skills`;
      return (await transport.request("GET", path)) as Awaited<ReturnType<InstanceType<typeof SkillListAction>['run']>>;
    },
  };
}
