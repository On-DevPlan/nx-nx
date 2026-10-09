// 通用 CLI 运行器：解析 argv → 匹配 action → 校验 → 执行 → 渲染。
//
// 改造前这里是一个 400 行的 switch，每条命令要在 BOOL_FLAGS / helpText / case /
// renderXxx 四处重复登记。现在命令表、help 文本、参数校验全部由 action 声明派生，
// 新增命令只需在所属模块的 actions 里加一条。
import { readFileSync } from 'node:fs';
import { APP_NAME, APP_TITLE, DEFAULT_PORT, storePathFromEnv } from '../core/paths.js';
import { toErrorPayload, exitCodeOf, badInput } from '../core/errors/index.js';
import { ACTIONS } from './registry.js';
import {
  cliPathsOf,
  argSpecsOf,
  flagSpecsOf,
  booleanFlagNames,
  applySpec,
} from './spec.js';
import {
  commandEntry,
  helpEntries,
  renderHelp,
  printCommandHelp,
  type CommandEntry,
} from './help.js';
import type { ActionShape, ArgEntry, FlagSpec, TransportMeta } from './types/action.js';

const VERSION = (
  JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as { version: string }
).version;

// 命令的统一结构（BUILTINS 与模块 action 的公共形状；字段按需可选）
interface AnyCommand {
  id: string;
  module?: string;
  cli?: ActionShape['cli'];
  http?: readonly [string, string] | null;
  summary?: string;
  args?: readonly ArgEntry[];
  flags?: Record<string, FlagSpec>;
  openFlags?: boolean;
  run?: (ctx: Record<string, unknown>, meta?: TransportMeta) => unknown;
  render?: (result: unknown, ctx?: Record<string, unknown>) => unknown;
}

// ---- 平台命令：不属于任何功能域，不参与 action 表 ----
// 用与 action 相同的形状声明，好让参数解析与 help 生成保持同一套逻辑。
const BUILTINS: AnyCommand[] = [
  {
    id: 'serve',
    cli: ['serve'],
    summary: '启动 Web 面板',
    flags: {
      port: { type: 'number', default: DEFAULT_PORT },
      'no-open': { type: 'boolean' },
    },
    run: (ctx) => cmdServe(ctx as { port?: number; 'no-open'?: boolean }),
  },
  {
    id: 'help',
    cli: ['help'],
    summary: '显示帮助（可跟模块名或命令组，如 nx-nx help template）',
    args: [{ name: 'topic', required: false }],
    // 走标准 action 形态：--json 时 emit 会序列化返回的条目，
    // 于是 `help --json` 输出的是可解析的命令表而非帮助文本
    run: (ctx) => helpEntries(ctx.topic, ALL_COMMANDS.map(commandEntry)),
    render: (entries, ctx) => renderHelp(entries as CommandEntry[], ctx?.topic),
  },
  // render 让 `nx-nx version` 输出裸版本号（脚本里可 `V=$(nx-nx version)`），
  // 而 `--json` 仍走序列化，保持机器可读
  {
    id: 'version',
    cli: ['version'],
    summary: '显示版本',
    run: () => VERSION,
    render: (v) => v,
  },
];

export const ALL_COMMANDS: AnyCommand[] = [
  ...BUILTINS,
  ...(ACTIONS as unknown as AnyCommand[]),
];

// ---- 参数解析 ----

interface SplitGlobals {
  rest: string[];
  json: boolean;
  store?: string;
}

// 全局 flag 先摘掉：它们可以出现在 argv 任意位置，不属于任何 action 的声明。
function splitGlobals(argv: string[]): SplitGlobals {
  const rest: string[] = [];
  let json = false;
  let store: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === '--json') {
      json = true;
      continue;
    }
    if (a === '--store') {
      store = argv[++i];
      continue;
    }
    if (a.startsWith('--store=')) {
      store = a.slice('--store='.length);
      continue;
    }
    rest.push(a);
  }
  return { rest, json, store };
}

interface CommandHit {
  cmd: AnyCommand;
  path: string[];
  rest: string[];
}

// 匹配命令：把声明路径与 argv 前缀逐 token 比较，选最长匹配。
//
// 逐 token 比较（而非只取「开头连续的非 flag token」）是必需的——有些命令路径
// 本身就含 flag，例如 `skill install --list` 是「列出内置包」而非「安装」。
// 最长优先则让 ['skill','central','add'] 压过 ['skill','central']，子命令与别名因此共存。
export function resolveCommand(argv: string[]): CommandHit | null {
  let best: { cmd: AnyCommand; path: string[] } | null = null;
  let bestLen = -1;
  for (const cmd of ALL_COMMANDS) {
    for (const path of cliPathsOf(cmd as { cli: ActionShape['cli'] })) {
      if (path.length > argv.length || path.length <= bestLen) continue;
      if (path.every((seg, i) => seg === argv[i])) {
        best = { cmd, path };
        bestLen = path.length;
      }
    }
  }
  return best ? { ...best, rest: argv.slice(bestLen) } : null;
}

interface ParsedRest {
  positionals: string[];
  flags: Record<string, unknown>;
}

// 解析剩余 token。布尔 flag 不吞下一个 token —— 否则 `skill install --force demo`
// 会把 force 解析成字符串 'demo'，而 demo 本该是位置参数。
function parseRest(rest: string[], cmd: AnyCommand): ParsedRest {
  const bools = booleanFlagNames(cmd);
  const positionals: string[] = [];
  const flags: Record<string, unknown> = {};
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i]!;
    if (!a.startsWith('--')) {
      positionals.push(a);
      continue;
    }
    const eq = a.indexOf('=');
    if (eq > 2) {
      flags[a.slice(2, eq)] = a.slice(eq + 1);
      continue;
    }
    const key = a.slice(2);
    const next = rest[i + 1];
    if (!bools.has(key) && next !== undefined && !next.startsWith('--')) {
      flags[key] = next;
      i++;
    } else {
      flags[key] = true;
    }
  }
  return { positionals, flags };
}

// 位置参数按声明顺序映射成具名输入；末尾声明 { rest: true } 的收集剩余全部
function mapPositionals(positionals: string[], cmd: AnyCommand): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  let i = 0;
  for (const spec of argSpecsOf(cmd)) {
    if (spec.rest) {
      out[spec.name] = positionals.slice(i);
      i = positionals.length;
      break;
    }
    if (positionals[i] !== undefined) out[spec.name] = positionals[i];
    i++;
  }
  if (i < positionals.length) {
    throw badInput(`多余的参数: ${positionals.slice(i).join(' ')}（用法见 ${APP_NAME} help）`);
  }
  return out;
}

// 未知 flag 直接报错——`--fiile` 这类拼写错误应该立刻被指出来，而不是被静默忽略。
//
// 例外：声明了 openFlags 的 action 表示「可选项由数据驱动」（模板的 option
// schema），声明期无法枚举。这类 action 放行未知 flag，由 action 自己在 run 里
// 按 schema 取白名单——否则用户永远传不进模板选项。
function assertKnownFlags(flags: Record<string, unknown>, cmd: AnyCommand): void {
  if (cmd.openFlags) return;
  const known = new Set(flagSpecsOf(cmd).map((f) => f.name));
  for (const k of Object.keys(flags)) {
    if (!known.has(k)) throw badInput(`未知参数 --${k}（用法见 ${APP_NAME} help）`);
  }
}

// ---- 输出 ----

// render 拿到 (data, ctx)，可以是 async——有些渲染需要补一点上下文才能标注
// （例如候选清单要标出哪一项是「当前」），而 `--json` 必须保持纯数据的旧形状。
async function emit(cmd: AnyCommand, data: unknown, json: boolean, ctx: unknown): Promise<void> {
  // 无返回值的命令（help / serve 这类）不该打印任何东西：落进 JSON.stringify(undefined)
  // 会打出字面量 "undefined"，让 `help --json` 的 stdout 不再是合法 JSON。
  if (data === undefined && !cmd.render) return;

  if (json) {
    if (data === undefined) return;
    console.log(JSON.stringify(data, null, 2));
    return;
  }

  if (cmd.render) {
    const text = await cmd.render(data, ctx as Record<string, unknown> | undefined);
    if (text !== undefined && text !== null && text !== '') console.log(text);
    return;
  }
  console.log(JSON.stringify(data, null, 2));
}

// 失败一律 exit 1；--json 下输出可解析的错误对象。
// 注意 error 保持字符串（历史契约），code 是新增字段——agent 可据此分支，
// 老消费方按字符串匹配「用法:」「未设置」「不存在」仍然可用。
function fail(err: unknown, json: boolean): void {
  const p = toErrorPayload(err);
  if (json) {
    const payload: Record<string, unknown> = { ok: false, error: p.message, code: p.code };
    if (p.details !== undefined) payload.details = p.details;
    console.log(JSON.stringify(payload, null, 2));
  } else {
    console.error('错误: ' + p.message);
  }
  process.exitCode = exitCodeOf(p.code);
}

async function cmdServe(ctx: { port?: number; 'no-open'?: boolean }): Promise<void> {
  const { startServer } = await import('./server.js');
  const { openBrowser } = await import('../core/open.js');
  const port = ctx.port || DEFAULT_PORT;
  const server = await startServer({ port, host: '127.0.0.1' });
  const bound = server.address();
  const actualPort = typeof bound === 'object' && bound ? bound.port : port;
  const addr = `http://127.0.0.1:${actualPort}`;

  console.log(APP_NAME + ' · ' + APP_TITLE + ' v' + VERSION);
  console.log(`面板:   ${addr}`);
  console.log(`存储:   ${storePathFromEnv()}`);
  console.log('CLI:    ' + APP_NAME + ' help（每个按钮都有对应命令，agent 可加 --json）');
  console.log('按 Ctrl+C 停止');

  if (!ctx['no-open']) openBrowser(addr);

  const shutdown = () => {
    console.log('\n正在停止...');
    server.close(() => process.exit(0));
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

// ---- 主入口 ----

export async function runCli(argv: string[]): Promise<void> {
  const { rest, json, store } = splitGlobals(argv);
  if (store) process.env.NX_NX_STORE = store;

  const hit = resolveCommand(rest);

  // 无参数、或只有全局 flag：显示帮助（与历史行为一致，退出码 0）
  if (!hit) {
    if (!rest.length) {
      console.log(renderHelp(helpEntries(undefined, ALL_COMMANDS.map(commandEntry)), ''));
      return;
    }
    console.error(`未知命令: ${rest.join(' ')}`);
    console.error('运行 ' + APP_NAME + ' help 查看用法');
    process.exitCode = 1;
    return;
  }

  const { cmd, rest: tail } = hit;

  try {
    if (tail.includes('--help')) {
      printCommandHelp(cmd);
      return;
    }

    const { positionals, flags } = parseRest(tail, cmd);
    assertKnownFlags(flags, cmd);
    const input = { ...mapPositionals(positionals, cmd), ...flags };
    const ctx = applySpec(cmd as unknown as ActionShape, input);
    const data = await cmd.run?.(ctx as Record<string, unknown>, { transport: 'cli' });
    await emit(cmd, data, json, ctx as Record<string, unknown>);
  } catch (err) {
    fail(err, json);
  }
}

// ---- 直接运行本文件时进入 CLI ----
// dev：`node --import tsx src/runtime/cli.ts ...`（改码即跑，无需构建）；
// prod：bin/nx-nx.mjs import runCli 自行调用，argv[1] 是 bin → 此处不重复执行。
// 被 import（库用法）时 import.meta.url 与 argv[1] 不同，不触发。
import { pathToFileURL } from 'node:url';

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  runCli(process.argv.slice(2)).catch((err) => {
    console.error(err && err.stack ? err.stack : String(err));
    process.exitCode = 1;
  });
}
