// 脚本工作台的共享类型与小工具（无 React、无副作用）。
import type { MODULES } from '../../runtime/registry.js';
import type { TypedClient } from '../../runtime/types/client.js';

export type C = TypedClient<typeof MODULES>;
export type ScriptInfo = Awaited<ReturnType<C['script.list']>>['scripts'][number];
export type AliasInfo = Awaited<ReturnType<C['script.aliases']>>['aliases'][number];
export type RunResult = Awaited<ReturnType<C['script.run']>>;

export const LS_KEY = 'nx-nx-script-ui';

export interface SavedUi {
  name?: string;
  tab?: 'output' | 'aliases';
}

export function loadUi(): SavedUi {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? (JSON.parse(raw) as SavedUi) : {};
  } catch {
    return {};
  }
}

// 参数输入框的解析：按空白拆分，支持单/双引号；反斜杠不做转义（Windows 路径要能用）。
export function tokenize(input: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quote: '"' | "'" | null = null;
  for (const ch of input) {
    if (quote) {
      if (ch === quote) quote = null;
      else cur += ch;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (/\s/.test(ch)) {
      if (cur) {
        out.push(cur);
        cur = '';
      }
    } else {
      cur += ch;
    }
  }
  if (cur) out.push(cur);
  return out;
}

export function defaultTemplate(name: string): string {
  return [
    `// ${name} —— 随包脚本；内置全局函数可直接用，不需要 import。`,
    '// 可用函数清单: nx-nx script aliases',
    '',
    `log(${JSON.stringify(`hello from ${name}`)});`,
    '',
  ].join('\n');
}

// ---- 参数表单的工具（前端专用副本）----
//
// 为什么不在前端 import core/script/params.ts：
// 分层测试「视图 tsx 不做 node 侧的值导入」——Vite 会把 node 侧代码打进浏览器包，
// 只允许 import type。这两个函数是纯逻辑，语义必须与 core/script/params.ts 保持一致：
//   defaultValues: 声明默认值 → 表单初值
//   paramTokens:   表单值 → --k=v（boolean true → --k；空值跳过）
export function defaultValues(params: { name: string; default: string }[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const p of params) out[p.name] = p.default;
  return out;
}

export function paramTokens(
  params: { name: string; type: string }[],
  values: Record<string, string>,
): string[] {
  const out: string[] = [];
  for (const p of params) {
    const v = values[p.name];
    if (v === undefined) continue;
    if (p.type === 'boolean') {
      if (v === 'true') out.push(`--${p.name}`);
      continue;
    }
    if (v === '') continue;
    out.push(`--${p.name}=${v}`);
  }
  return out;
}
