// action 规格的解析与路由编译（单一通道：所有 action 都带 fields——zod 契约）。
//
// 一处声明，两端生效：CLI 的 --flag 与 HTTP 的 query/body 都走 zod-bridge 的
// 归一化 + 校验（runtime/zod-bridge.ts），这里只剩三件无状态的活：
//   cliPathsOf   —— action 的 CLI 路径（含别名形态的容错）
//   usageOf      —— 从 fields 反推用法串（help 因此不可能与实际命令脱节）
//   compileRoute —— '/api/repos/:id' → 正则 + 键名
import { APP_NAME } from '../core/paths.js';
import type { FieldDesc } from './zod-bridge.js';

// 取 action 的 CLI 路径列表。支持两种写法：
//   单路径   cli: ['repo', 'list']
//   多路径   cli: [['bundled','list'], ['skill','install','--list']]   ← 别名
export function cliPathsOf(action: { cli?: unknown }): string[][] {
  const cli = action.cli;
  if (!cli || !Array.isArray(cli) || !cli.length) return [];
  const first = cli[0];
  return Array.isArray(first) ? (cli as string[][]) : [cli as string[]];
}

// ---- 用法串生成：从 fields 反推，help 因此不可能与实际命令脱节 ----

export function usageOf(action: { cli?: unknown; fields?: FieldDesc[] }): string {
  const fields = action.fields ?? [];
  const [path] = cliPathsOf(action);
  const parts: string[] = [APP_NAME, ...(path || [])];

  // 位置参数按 args 顺序、其余按字段种类给占位符。
  // 枚举字段展开成 <a|b>，布尔字段不带值占位（裸 --flag）。
  for (const f of fields.filter((x) => x.positional)) {
    parts.push(f.required ? `<${f.name}>` : `[${f.name}]`);
  }
  for (const f of fields.filter((x) => !x.positional)) {
    if (f.kind === 'boolean') {
      parts.push(f.required ? `--${f.name}` : `[--${f.name}]`);
      continue;
    }
    const hint = f.enumValues?.length ? f.enumValues.join('|') : f.kind === 'json' ? f.name : f.kind;
    const token = `--${f.name} <${hint}>`;
    parts.push(f.required ? token : `[${token}]`);
  }
  return parts.join(' ');
}

// ---- HTTP 路由模式编译：'/api/repos/:id' → 正则 + 键名 ----

export interface CompiledRoute {
  method: string;
  keys: string[];
  regex: RegExp;
}

const ROUTE_CACHE = new WeakMap<object, CompiledRoute>();

export function compileRoute(action: { http: readonly [string, string] }): CompiledRoute {
  const cached = ROUTE_CACHE.get(action);
  if (cached) return cached;
  const [method, pattern] = action.http;
  const keys: string[] = [];
  const body = pattern
    .split('/')
    .map((seg) => {
      if (!seg.startsWith(':')) return seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      keys.push(seg.slice(1));
      return '([^/]+)';
    })
    .join('/');
  const compiled: CompiledRoute = { method, keys, regex: new RegExp('^' + body + '$') };
  ROUTE_CACHE.set(action, compiled);
  return compiled;
}
