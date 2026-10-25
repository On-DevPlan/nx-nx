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
