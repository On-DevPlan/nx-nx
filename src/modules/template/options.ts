// template 域的选项收集：从 ctx 里挑出属于该模板选项的键。
//
// 单独成文件的原因：index.ts 现在只做装配（action 清单由脚本生成），
// 而这两个 action 都要用这里的取值逻辑。
import type { OptionSpec } from '../../core/templates.js';

// 为什么需要白名单：ctx 同时含 CLI 全局 flag（--json/--store）、
// 平台命令自带 flag、以及 action 自己声明的 flag。不筛一遍，
// 用户的任意输入都会被当成模板选项传给 resolveVars，默认值全被冲掉。
//
// 极端情况：模板选项名与全局 flag 撞名时（如模板也有个 port 而 CLI 无同名全局），
// 以模板选项为准——调用方传的就是给模板的。
export function pickOptions(
  ctx: Record<string, unknown>,
  options: readonly OptionSpec[]
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const opt of options) {
    if (ctx[opt.name] !== undefined) out[opt.name] = ctx[opt.name];
  }
  return out;
}

// `--set k=v` 形态的兜底：值里带空格或需要强制字符串时用，
// 也解决了「选项名与 flag 名撞车」的歧义。
export function parseSetList(raw: unknown): Record<string, unknown> {
  if (!raw) return {};
  const list = Array.isArray(raw) ? raw.map(String) : String(raw).split(',');
  const out: Record<string, unknown> = {};
  for (const item of list) {
    const i = item.indexOf('=');
    if (i <= 0) continue;
    out[item.slice(0, i)] = item.slice(i + 1);
  }
  return out;
}

export function collectOptions(
  ctx: Record<string, unknown>,
  options: readonly OptionSpec[]
): Record<string, unknown> {
  return { ...pickOptions(ctx, options), ...parseSetList(ctx.set) };
}
