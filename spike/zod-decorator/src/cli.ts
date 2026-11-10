// spike：CLI 运行器 —— 树驱动，零手写命令表。
//
// 与现有 `runtime/cli.ts` 的对照：
//   现有：解析 argv → 与 ALL_COMMANDS 逐条比对路径 → 命中最长匹配 → 解析 flag
//         → applySpec（spec.ts 的强转）→ run → render
//   本 spike：解析 argv → 在**树**上走最长匹配 → 从 schema 派生 flag 规格
//         → 归一化 → zod 校验 → run
//
// 两者的差别只有「命令表从哪来」：现有模型从 action 声明派生，本 spike 从树派生
// ——树本身就是声明的产物，所以「CLI 完全自动化」这句话在本 spike 里是可验证的：
// CLI 里没有一处硬编码过命令名，删掉任意一条 action，命令树与 help 自动少一枝。
import { describeInput, normalizeCliValue, parseInput, parseOutput } from './schema.js';
import { actionOf, buildTree, matchTree, renderHelp, usageOf } from './tree.js';
import type { ActionDef } from './registry.js';

export interface CliResult {
  ok: boolean;
  /** 给人看的输出 */
  output?: string;
  /** 机器可读输出 */
  data?: unknown;
  error?: string;
}

interface Parsed {
  positionals: string[];
  flags: Record<string, unknown>;
}

/** 解析剩余 token。布尔 flag 不吞下一个 token（否则 `--force demo` 会吃掉 demo）。 */
function parseRest(rest: string[], action: ActionDef): Parsed {
  const bools = new Set(
    describeInput(action)
      .filter((f) => f.kind === 'boolean')
      .map((f) => f.name),
  );
  const positionals: string[] = [];
  const flags: Record<string, unknown> = {};

  const setFlag = (key: string, value: unknown): void => {
    const prev = flags[key];
    if (prev === undefined) flags[key] = value;
    else if (Array.isArray(prev)) prev.push(value);
    else flags[key] = [prev, value];
  };

  for (let i = 0; i < rest.length; i++) {
    const a = rest[i]!;
    if (!a.startsWith('--')) {
      positionals.push(a);
      continue;
    }
    const eq = a.indexOf('=');
    if (eq > 2) {
      setFlag(a.slice(2, eq), a.slice(eq + 1));
      continue;
    }
    const key = a.slice(2);
    const next = rest[i + 1];
    if (!bools.has(key) && next !== undefined && !next.startsWith('--')) {
      setFlag(key, next);
      i++;
    } else {
      setFlag(key, true);
    }
  }
  return { positionals, flags };
}

/** 组装待校验的入参：位置参数按顺序、flag 按名字 */
function collectInput(action: ActionDef, parsed: Parsed): Record<string, unknown> {
  const fields = describeInput(action);
  const values: Record<string, unknown> = { ...parsed.flags };

  let i = 0;
  for (const f of fields) {
    if (!f.positional) continue;
    const v = parsed.positionals[i];
    if (v !== undefined) values[f.name] = v;
    i++;
  }
  if (i < parsed.positionals.length) {
    throw new Error(`多余的参数: ${parsed.positionals.slice(i).join(' ')}（用法: ${usageOf(action)}）`);
  }
  return values;
}

/** 执行一条 CLI 命令 */
export async function runCli(
  actions: ActionDef[],
  argv: string[],
  appName = 'demo',
): Promise<CliResult> {
  const root = buildTree(actions);
  const hit = matchTree(root, argv);
  if (!hit) {
    if (!argv.length) return { ok: true, output: renderHelp(root, appName) };
    return { ok: false, error: `未知命令: ${argv.join(' ')}\n运行 ${appName} help 查看用法` };
  }

  const action = actionOf(hit.node)!;
  try {
    const parsed = parseRest(hit.rest, action);
    const raw = collectInput(action, parsed);

    // 归一化：CLI 文本 → schema 期待的值（这一步是 zod 替不了的）
    const fields = describeInput(action);
    const normalized: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(raw)) {
      const desc = fields.find((f) => f.name === k);
      normalized[k] = desc ? normalizeCliValue(desc, v) : v;
    }

    const input = parseInput(action, normalized);
    const result = parseOutput(action, await action.run(input));
    return { ok: true, data: result, output: JSON.stringify(result, null, 2) };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
