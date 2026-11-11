// HTTP 路由层（OOP：ApiRouter 类）：路由表由 action.http 编译而来，与 CLI 同源。
//
// 这里没有手写路由 —— 每条路由都来自某个模块的 action 声明，
// 所以「面板上有按钮、CLI 里没命令」在结构上不可能发生。
// ApiRouter 在构造期把注册表的 actions 编译成排序好的路由表，
// handle() 是 PanelServer 的 /api/* 入口——一次编译，常驻复用。
import type { IncomingMessage, ServerResponse } from 'node:http';
import { compileRoute, usageOf } from './spec.js';
import { normalizeCliValue, parseInput } from './zod-bridge.js';
import type { ZodBoundAction } from './action-decorator.js';
import { toErrorPayload, httpStatusOf, CODES } from '../core/errors/index.js';
import type { ErrorCode } from '../core/errors/index.js';
import type { CompiledRoute } from './spec.js';

interface RouteEntry {
  action: ZodBoundAction;
  route: CompiledRoute;
}

// 逐段比较两条模式，决定谁该先匹配：**字面量段优先于参数段**，段数多的优先。
//
// 为什么要排序而不是按声明顺序：`GET /api/repos/status` 与 `GET /api/repos/:id`
// 都能匹配 `/api/repos/status`，谁先声明谁赢。一旦有人调整 actions 顺序，
// 前者就会被后者抢走——这种 bug 只在运行时、且只在特定路径上出现，极难排查。
//
// 正确比较：算"前 N 段里**字面量段**的总个数"，多者优先；同字数时
// 按"从左到右遇到的第一处分歧段"——字面量胜出。
// （无状态比较器，保持模块级纯函数——没有状态的东西不装进类里。）
function routeSpecificity(pattern: string): string[] {
  return pattern.split('/').filter(Boolean);
}

function compareRoutes(a: RouteEntry, b: RouteEntry): number {
  const pa = routeSpecificity((a.action.http as [string, string])[1]);
  const pb = routeSpecificity((b.action.http as [string, string])[1]);
  const litA = pa.filter((s) => !s.startsWith(':')).length;
  const litB = pb.filter((s) => !s.startsWith(':')).length;
  if (litA !== litB) return litB - litA; // 字面量段越多越具体
  if (pa.length !== pb.length) return pb.length - pa.length;
  for (let i = 0; i < pa.length; i++) {
    const litA2 = !pa[i]!.startsWith(':');
    const litB2 = !pb[i]!.startsWith(':');
    if (litA2 !== litB2) return litA2 ? -1 : 1;
  }
  return 0;
}

export function sendJson(res: ServerResponse, status: number, obj: unknown): void {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  res.end(JSON.stringify(obj));
}

export class ApiRouter {
  private readonly routes: RouteEntry[];

  constructor(actions: readonly ZodBoundAction[]) {
    this.routes = actions
      .filter((a) => a.http)
      .map((action) => ({
        action,
        route: compileRoute(action as { http: readonly [string, string] }),
      }))
      .sort(compareRoutes);
  }

  /** PanelServer 的 /api/* 入口：逐条尝试路由表，命中即执行并回 JSON。 */
  async handle(req: IncomingMessage, res: ServerResponse, url: URL): Promise<void> {
    const method = (req.method || 'GET').toUpperCase();

    for (const { action, route } of this.routes) {
      if (route.method !== method) continue;
      const m = route.regex.exec(url.pathname);
      if (!m) continue;

      if (method !== 'GET' && method !== 'HEAD' && !this.originAllowed(req)) {
        sendJson(res, 403, {
          ok: false,
          error: '跨站请求被拒绝（面板仅接受本机来源）',
          code: CODES.BLOCKED satisfies ErrorCode,
        });
        return;
      }

      try {
        // 单一通道：路由参数 / query / body 里的值统一过 normalizeCliValue
        // （route 与 query 天然是字符串；body 的 JSON 值归一化是幂等的），
        // 再 zod 校验。出参不守 schema——实现即契约（前端类型从实现推断）。
        const fields = action.fields;
        const usage = usageOf(action);
        const raw: Record<string, unknown> = {};
        route.keys.forEach((k, i) => {
          const f = fields.find((x) => x.name === k);
          const v = decodeURIComponent(m[i + 1]!);
          raw[k] = f ? normalizeCliValue(f, v) : v;
        });
        if (method === 'GET' || method === 'HEAD') {
          // query 里的未知键忽略（面板可能带缓存穿透参数）；CLI 侧未知 flag 是报错的
          for (const [k, v] of url.searchParams) {
            const f = fields.find((x) => x.name === k);
            if (f) raw[k] = normalizeCliValue(f, v);
          }
        } else {
          const body = await this.readBody(req).catch(() => ({}));
          for (const [k, v] of Object.entries(body)) {
            const f = fields.find((x) => x.name === k);
            raw[k] = f ? normalizeCliValue(f, v) : v;
          }
        }
        const parsed = parseInput(action.input, raw, usage);
        const data = await action.run(parsed);
        sendJson(res, 200, { ok: true, data });
      } catch (err) {
        // 错误码 → HTTP 状态只在这一处映射（core/errors 提供表）
        const p = toErrorPayload(err);
        const payload: Record<string, unknown> = { ok: false, error: p.message, code: p.code };
        if (p.details !== undefined) payload.details = p.details;
        sendJson(res, httpStatusOf(p.code), payload);
      }
      return;
    }

    sendJson(res, 404, { ok: false, error: '接口不存在: ' + method + ' ' + url.pathname });
  }

  private async readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const c of req) {
      size += c.length;
      if (size > 4 * 1024 * 1024) throw new Error('请求体过大');
      chunks.push(c as Buffer);
    }
    if (!chunks.length) return {};
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>;
  }

  // 跨站防护。服务虽然只绑 127.0.0.1，但用户浏览器里的任意页面都能向它发起请求——
  // 少了这道校验，一个恶意网页就能 POST /api/repos/scan 或 DELETE /api/repos/:id。
  // 浏览器发跨域请求必带 Origin，非浏览器客户端（curl / agent / 测试）不带，故放行。
  private originAllowed(req: IncomingMessage): boolean {
    const origin = req.headers.origin;
    if (!origin) return true;
    try {
      const h = new URL(origin).hostname;
      return h === '127.0.0.1' || h === 'localhost' || h === '::1';
    } catch {
      return false;
    }
  }
}
