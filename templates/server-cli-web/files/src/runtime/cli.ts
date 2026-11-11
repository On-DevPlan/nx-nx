// CLI 运行器（OOP：CliApp 类）：解析 argv → 匹配 action → zod 校验 → 执行 → 渲染。
//
// 单一通道：所有命令（平台命令 + 业务 action）都是 @action 装饰的 ZodBoundAction——
// 命令表、help 文本、参数归一化与校验全部由声明派生，新增命令只需在所属模块
// （ModuleBase 子类）写一个装饰方法。
//
// serve 端的 OOP 约定：命令解析与派发是 CliApp 的实例成员——registry 经构造注入，
// `run(argv)` 是唯一对外入口；bin/nx-nx.mjs 调的是兼容函数 runCli（内部转 cliApp.run）。
import { APP_NAME, STORE_ENV } from '../core/paths.js';
import { toErrorPayload, exitCodeOf, badInput } from '../core/errors/index.js';
import { registry } from './registry.js';
import type { Registry } from './registry.js';
import { cliPathsOf, usageOf } from './spec.js';
import { normalizeCliValue, parseInput, type FieldDesc } from './zod-bridge.js';
import type { ZodBoundAction } from './action-decorator.js';
import {
  commandEntry,
  helpEntries,
  renderHelp,
  printCommandHelp,
} from './help.js';

export class CliApp {
  constructor(private reg: Registry) {}

  /** 全量命令表（help / bootstrap / 面板「CLI 等价」提示共用）。 */
  get commands(): ZodBoundAction[] {
    return this.reg.actions as ZodBoundAction[];
  }

  /** 唯一对外入口：bin 与 dev（tsx 直跑）都从 run(argv) 进。 */
  async run(argv: string[]): Promise<void> {
    const { rest, json, store } = this.splitGlobals(argv);
    if (store) process.env[STORE_ENV] = store;

    const hit = this.resolveCommand(rest);

    // 无参数、或只有全局 flag：显示帮助（与历史行为一致，退出码 0）
    if (!hit) {
      if (!rest.length) {
        console.log(renderHelp(helpEntries(undefined, this.commands.map(commandEntry)), ''));
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

      const input = this.parseInput(cmd, tail);
      const data = await cmd.run(input);
      await this.emit(cmd, data, json, input as Record<string, unknown>);
    } catch (err) {
      this.fail(err, json);
    }
  }

  // ---- 参数解析（私有：只服务于 run 的流水线） ----

  // 全局 flag 先摘掉：它们可以出现在 argv 任意位置，不属于任何 action 的声明。
  private splitGlobals(argv: string[]): { rest: string[]; json: boolean; store?: string } {
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

  // 匹配命令：把声明路径与 argv 前缀逐 token 比较，选最长匹配。
  //
  // 逐 token 比较（而非只取「开头连续的非 flag token」）是必需的——有些命令路径
  // 本身就含 flag，例如 `skill install --force demo` 里 demo 本该是位置参数。
  // 最长优先则让 ['skill','central','add'] 压过 ['skill','central']，子命令与别名因此共存。
  private resolveCommand(argv: string[]): { cmd: ZodBoundAction; rest: string[] } | null {
    let best: { cmd: ZodBoundAction; len: number } | null = null;
    for (const cmd of this.commands) {
      for (const path of cliPathsOf(cmd)) {
        if (path.length > argv.length || path.length <= (best?.len ?? -1)) continue;
        if (path.every((seg, i) => seg === argv[i])) {
          best = { cmd, len: path.length };
        }
      }
    }
    return best ? { cmd: best.cmd, rest: argv.slice(best.len) } : null;
  }

  // 解析剩余 token。布尔 flag 不吞下一个 token —— 否则 `skill install --force demo`
  // 会把 force 解析成字符串 'demo'，而 demo 本该是位置参数。
  // 布尔集合从 schema 字段推出（kind === 'boolean' 的非位置字段）。
  private parseRest(rest: string[], fields: FieldDesc[], bools: Set<string>): { positionals: string[]; flags: Record<string, unknown> } {
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
        this.setFlag(flags, a.slice(2, eq), a.slice(eq + 1));
        continue;
      }
      const key = a.slice(2);
      const next = rest[i + 1];
      if (!bools.has(key) && next !== undefined && !next.startsWith('--')) {
        this.setFlag(flags, key, next);
        i++;
      } else {
        flags[key] = true;
      }
    }
    return { positionals, flags };
  }

  // 同名 flag 出现多次 → 收成数组（`--set a=1 --set b=2`）。
  // 不这么做的话后者会静默覆盖前者——`--set` / `--hidden` 这类可重复 flag 全靠它。
  private setFlag(flags: Record<string, unknown>, key: string, value: unknown): void {
    const prev = flags[key];
    if (prev === undefined) flags[key] = value;
    else if (Array.isArray(prev)) prev.push(value);
    else flags[key] = [prev, value];
  }

  // zod 通道输入解析：位置参数按 fields 声明顺序消费 argv，其余是 --flag；
  // 文本值经 normalizeCliValue 归一化成 schema 期待的形状，最后 zod 校验
  // （错误带「用法:」前缀——对 agent 的分类契约）。未知 flag 当场报错。
  private parseInput(cmd: ZodBoundAction, tail: string[]): unknown {
    const bools = new Set(cmd.fields.filter((f) => !f.positional && f.kind === 'boolean').map((f) => f.name));
    const { positionals, flags } = this.parseRest(tail, cmd.fields, bools);
    const usage = usageOf(cmd);

    const positionalFields = cmd.fields.filter((f) => f.positional);
    if (positionals.length > positionalFields.length) {
      throw badInput(`多余的参数: ${positionals.slice(positionalFields.length).join(' ')}（用法见 ${APP_NAME} help）`);
    }

    const raw: Record<string, unknown> = {};
    positionalFields.forEach((f, i) => {
      const v = positionals[i];
      if (v !== undefined) raw[f.name] = normalizeCliValue(f, v);
    });
    for (const [k, v] of Object.entries(flags)) {
      const f = cmd.fields.find((x) => x.name === k);
      if (!f) throw badInput(`未知参数 --${k}（用法: ${usage}）`);
      raw[k] = normalizeCliValue(f, v);
    }
    return parseInput(cmd.input, raw, usage);
  }

  // ---- 输出 ----

  // render 拿到 (data, ctx)，可以是 async——有些渲染需要补一点上下文才能标注
  // （例如 help 要拿 topic），而 `--json` 必须保持纯数据的旧形状。
  private async emit(cmd: ZodBoundAction, data: unknown, json: boolean, ctx: unknown): Promise<void> {
    // 无返回值的命令（serve 这类）不该打印任何东西：落进 JSON.stringify(undefined)
    // 会打出字面量 "undefined"，让 `help --json` 的 stdout 不再是合法 JSON。
    if (data === undefined && !cmd.render) return;

    if (json) {
      if (data === undefined) return;
      console.log(JSON.stringify(data, null, 2));
      return;
    }

    if (cmd.render) {
      const text = await cmd.render(data, ctx);
      if (text !== undefined && text !== null && text !== '') console.log(text);
      return;
    }
    console.log(JSON.stringify(data, null, 2));
  }

  // 失败一律 exit 1；--json 下输出可解析的错误对象。
  // 注意 error 保持字符串（历史契约），code 是新增字段——agent 可据此分支，
  // 老消费方按字符串匹配「用法:」「未设置」「不存在」仍然可用。
  private fail(err: unknown, json: boolean): void {
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
}

/** 全项目唯一 CLI 实例（与 registry 单例配套）。 */
export const cliApp = new CliApp(registry);

// 兼容入口：bin/nx-nx.mjs 与既有调用方都用它。
export async function runCli(argv: string[]): Promise<void> {
  return cliApp.run(argv);
}

// ---- 直接运行本文件时进入 CLI ----
// dev：`node --import tsx src/runtime/cli.ts ...`（改码即跑，无需构建）；
// prod：bin 调用 runCli，argv[1] 是 bin → 此处不重复执行；被 import 时不触发。
import { pathToFileURL } from 'node:url';

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  runCli(process.argv.slice(2)).catch((err) => {
    console.error(err && err.stack ? err.stack : String(err));
    process.exitCode = 1;
  });
}
