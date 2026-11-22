// 启动脚本（版本）解析：把配置里的一条 entry 变成「脚本 + 完整 argv + 环境变量 + 端口」。
//
// 这里只做纯函数，不碰文件；runtime / stop / pipeline 共用同一份口径，
// 免得「启动时用 18081，探活却盯 18080」这种假失活。
import type { HealthConfig, LaunchEntry, ServiceGroupConfig } from './store.js';

export interface ResolvedLaunch {
  /** 命中的启动脚本条目；没配 launch.entries 时为 undefined（走 main 的原始参数） */
  entry?: LaunchEntry;
  script: string;
  args: string[];
  env: Record<string, string>;
  port?: number;
  health?: HealthConfig;
}

/** 在组配置里按版本名找一条启动脚本；没给名字时用列表第一条。 */
export function findLaunchEntry(g: ServiceGroupConfig, name?: string): LaunchEntry | undefined {
  const entries = g.launch?.entries ?? [];
  const wanted = String(name ?? '').trim();
  if (!entries.length) {
    if (wanted) {
      throw new Error(`服务组 ${g.id} 没有启动脚本列表，不能选版本「${wanted}」；请先在设置页添加启动脚本`);
    }
    return undefined;
  }
  if (!wanted) return entries[0];
  const hit = entries.find((e) => e.name === wanted);
  if (!hit) {
    throw new Error(
      `服务组 ${g.id} 没有启动脚本「${wanted}」；可用: ${entries.map((e) => e.name).join(' / ')}`,
    );
  }
  return hit;
}

/** 从 argv 里取 --port 的值：支持 `--port 18080` 与 `--port=18080`，最后一个生效。 */
export function portFromArgs(args: string[]): number | undefined {
  let found: number | undefined;
  for (let i = 0; i < args.length; i++) {
    const cur = args[i];
    let raw: string | undefined;
    if (cur === '--port') raw = args[i + 1];
    else if (cur?.startsWith('--port=')) raw = cur.slice('--port='.length);
    if (!raw) continue;
    const n = Number(raw);
    if (Number.isInteger(n) && n > 0 && n <= 65535) found = n;
  }
  return found;
}

/** 显式 port 覆盖 argv：先把旧的 --port / --port= 删掉，再追加唯一一份。 */
export function applyExplicitPort(args: string[], port?: number): string[] {
  if (!port) return [...args];
  const out = [...args];
  for (let i = out.length - 1; i >= 0; i--) {
    if (out[i] === '--port') out.splice(i, 2);
    else if (out[i]?.startsWith('--port=')) out.splice(i, 1);
  }
  out.push('--port', String(port));
  return out;
}

/**
 * 解析一次启动。
 * - entryName 为空：用列表第一条（调用方通常传 runtime.entry 保持上次选择）。
 * - 没有 launch.entries：脚本用 main.script，参数用 main.args，行为与旧版一致。
 */
export function resolveLaunch(g: ServiceGroupConfig, entryName?: string): ResolvedLaunch {
  const entry = findLaunchEntry(g, entryName);
  const script = entry?.script || g.main?.script;
  if (!script) throw new Error(`服务组 ${g.id} 未配置主脚本（main），也没有可用的启动脚本`);
  const rawArgs = entry ? entry.args : (g.main?.args ?? []);
  const args = applyExplicitPort(rawArgs, entry?.port);
  const port = entry?.port ?? portFromArgs(args);
  const health = g.health
    ? port && port !== g.health.port
      ? { ...g.health, port }
      : g.health
    : undefined;
  return {
    entry,
    script,
    args,
    env: entry?.env ?? {},
    port,
    health,
  };
}
