// 启动版本参数：把一组「端口 / 配置文件 / 环境」表单值翻译成 argv 与环境变量。
//
// 这里只做纯函数，不碰文件；runtime / stop / pipeline 共用同一份口径，
// 免得「启动时用 18081，探活却盯 18080」这种假失活。
import type { HealthConfig, LaunchParam, ServiceGroupConfig } from './store.js';

export type LaunchValues = Record<string, string>;

/** 补齐默认值：只保留配置里声明过的参数，避免把任意键塞进环境/argv。 */
export function normalizeLaunchValues(g: ServiceGroupConfig, values?: LaunchValues): LaunchValues {
  const out: LaunchValues = {};
  for (const p of g.launch?.params ?? []) {
    const v = values?.[p.key];
    out[p.key] = v !== undefined ? String(v) : (p.default ?? '');
  }
  return out;
}

/** 按参数声明生成最终 argv：同名 flag 会被替换（例如模板里的默认 --port）。 */
export function applyLaunchArgs(g: ServiceGroupConfig, baseArgs: string[], values?: LaunchValues): string[] {
  const vals = normalizeLaunchValues(g, values);
  const args = [...baseArgs];
  for (const p of g.launch?.params ?? []) {
    if (!p.arg) continue;
    const v = vals[p.key];
    if (!v) continue;
    const flag = `--${p.arg}`;
    for (let i = args.length - 1; i >= 0; i--) {
      const cur = args[i];
      if (!cur) continue;
      if (cur === flag) {
        args.splice(i, 2);
      } else if (cur.startsWith(flag + '=')) {
        args.splice(i, 1);
      }
    }
    args.push(flag, v);
  }
  return args;
}

/** 参数里声明了 env 的，注入同名环境变量。 */
export function launchEnv(g: ServiceGroupConfig, values?: LaunchValues): Record<string, string> {
  const vals = normalizeLaunchValues(g, values);
  const env: Record<string, string> = {};
  for (const p of g.launch?.params ?? []) {
    const v = vals[p.key];
    if (!p.env || !v) continue;
    env[p.env] = v;
  }
  return env;
}

/**
 * 启动端口：约定 key 或 arg 叫 port 的参数代表服务监听端口。
 * 它同时驱动 argv、health 与 stop，三处必须看同一个值。
 */
export function launchPort(g: ServiceGroupConfig, values?: LaunchValues): number | undefined {
  const p = g.launch?.params.find((x: LaunchParam) => x.key === 'port' || x.arg === 'port');
  if (!p) return undefined;
  const raw = normalizeLaunchValues(g, values)[p.key];
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 && n <= 65535 ? n : undefined;
}

/** 探活配置跟随启动端口；没声明 port 参数时保持原配置。 */
export function effectiveHealth(g: ServiceGroupConfig, values?: LaunchValues): HealthConfig | undefined {
  if (!g.health) return undefined;
  const port = launchPort(g, values);
  return port && port !== g.health.port ? { ...g.health, port } : g.health;
}
