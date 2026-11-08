// 让 CLI 命令作用在 **serve 那个常驻空间** 上。
//
// 为什么：空间现在是常驻实体（面板只装载一次），但 CLI 直跑是一次性进程——
// 它自己起一个空间，看不到 serve 里那个。于是「命令」与「界面」作用在两个实体上，
// 状态与调用记录对不上。
//
// 做法：serve 启动时把端口写到 ~/.nx-nx/serve.json；CLI 读到它就把空间动作
// 转给 serve（走已有的 HTTP 路由），由 serve 在它的常驻空间上执行。
// serve 不可达就退回本地会话（各起各的也能用，只是看不到对方的状态）。
//
// 防回环：serve 进程自己带着 NX_NX_SERVE_PORT（serve 启动时写进环境），
// 见到它就不往远端发——否则 serve 处理请求时又去请求自己。
import { rmSync } from 'node:fs';
import { serveInfoPath } from './paths.js';
import { readJsonFile, writeJsonAtomic } from './store-json.js';
import type { SpaceActionResult } from './namespace.js';

export interface ServeInfo {
  port: number;
  pid?: number;
  startedAt?: number;
}

/** 读 serve 的落点信息；没有或端口不合法返回 null */
export function readServeInfo(): ServeInfo | null {
  const raw = readJsonFile<ServeInfo>(serveInfoPath());
  const port = Number(raw?.port);
  if (!Number.isFinite(port) || port <= 0) return null;
  return { port, pid: raw?.pid, startedAt: raw?.startedAt };
}

/** 记下 serve 的落点（serve 启动时调用） */
export function writeServeInfo(info: ServeInfo): void {
  writeJsonAtomic(serveInfoPath(), info);
}

/** 清掉落点信息（serve 退出时调用，免得留下指向死进程的线索） */
export function clearServeInfo(): void {
  try {
    rmSync(serveInfoPath(), { force: true });
  } catch {
    /* 删不掉就算了：调用方会因连不上而退回本地 */
  }
}

/** 当前进程是否就是 serve（或 serve 的子进程）——是就别往远端发 */
function insideServe(): boolean {
  return Boolean(process.env.NX_NX_SERVE_PORT);
}

/**
 * 把空间动作转给本机 serve 执行。
 * @returns serve 不可达 / 没在跑 → null（调用方退回本地）
 */
export async function remoteSpaceAction(
  groupId: string,
  action: 'introspect' | 'call',
  opts: { method?: string; args?: unknown[] } = {},
): Promise<SpaceActionResult | null> {
  if (insideServe()) return null;
  const info = readServeInfo();
  if (!info) return null;
  // 兜底：目标端口就是本机 serve 自己 → 别把请求转给自己（会无限回环）
  if (process.env.NX_NX_SERVE_PORT && Number(process.env.NX_NX_SERVE_PORT) === info.port) {
    return null;
  }

  const base = `http://127.0.0.1:${info.port}/api/service-groups/${encodeURIComponent(groupId)}`;
  try {
    if (action === 'introspect') {
      const r = await fetch(`${base}/space`, { signal: AbortSignal.timeout(5000) });
      if (!r.ok) return null;
      return unwrap(await r.json());
    }
    const r = await fetch(`${base}/space-call`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      // args 传 JSON 字符串：路由层把 body 字段直接当 flag 用，flag 的类型是字符串
      body: JSON.stringify({ method: String(opts.method ?? ''), args: JSON.stringify(opts.args ?? []) }),
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok) return null;
    return unwrap(await r.json());
  } catch {
    // 连不上 / 超时 → 交给调用方退回本地
    return null;
  }
}

/** 面板 API 的响应统一裹 { ok, data } —— 剥壳拿到内容 */
function unwrap(payload: unknown): SpaceActionResult | null {
  const obj = payload as { ok?: boolean; data?: unknown } | null;
  if (!obj || obj.ok !== true) return null;
  return (obj.data ?? null) as SpaceActionResult | null;
}
