// 模板动作：把模板的「静态声明」与「动态解析」两条路径收敛成一个接口。
//
// 为什么需要两条：
//   - 纯静态（template.json 里的 options）够用的模板占多数，不该被复杂化
//   - 但「探测空闲端口」「列出本机可用的撞色方案」这类选项，值域依赖运行环境，
//     写死在 json 里只能是过期数据。模板可以放一个 hooks.mjs 在解析期补值。
//
// 契约：hooks 文件默认导出 { options?(ctx), beforeGenerate?(vars, ctx),
// afterGenerate?(target, vars, ctx) }。钩子均可 async；没有 hooks 文件一切照旧。
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { OptionSpec } from './templates.js';
import type { AbsolutePath } from './brand.js';

const HOOKS_FILE = 'hooks.mjs';

export type MaybePromise<T> = T | Promise<T>;

// 传给模板钩子的工具箱（由 modules/template/service 组装并满足此结构）。
// 模板作者不必从 nx-nx 内部 import——那会让模板与生成器内部路径耦合。
export interface HookCtx {
  probePort: (port: number) => Promise<boolean>;
  probePorts: (o: { start?: number; count?: number }) => Promise<number[]>;
  cwd?: string;
  [k: string]: unknown;
}

// 钩子文件的完整契约。模板作者按此实现，签名写错即类型不兼容。
export interface TemplateHooks<Vars = Record<string, unknown>> {
  options?(ctx: HookCtx): MaybePromise<OptionSpec[]>;
  beforeGenerate?(vars: Vars, ctx: HookCtx): MaybePromise<Partial<Vars> | Record<string, unknown>>;
  afterGenerate?(
    targetDir: AbsolutePath,
    vars: Vars,
    ctx: HookCtx,
  ): MaybePromise<unknown>;
}

export async function loadHooks(templateDir: AbsolutePath): Promise<TemplateHooks | null> {
  const p = join(templateDir, HOOKS_FILE);
  if (!existsSync(p)) return null;
  const mod = await import(pathToFileURL(p).href);
  const hooks = (mod.default || mod) as unknown;
  if (!hooks || typeof hooks !== 'object') {
    throw new Error(`${HOOKS_FILE} 必须默认导出一个对象`);
  }
  return hooks as TemplateHooks;
}

/**
 * 解析选项：静态声明打底，动态钩子补充。
 * 钩子返回的选项**按 name 合并**进静态声明——同名则以动态为准（它更了解当前环境）。
 */
export async function resolveOptions(
  meta: { options?: OptionSpec[] },
  templateDir: AbsolutePath,
  ctx: HookCtx,
): Promise<OptionSpec[]> {
  const staticOpts = Array.isArray(meta.options) ? meta.options : [];
  const hooks = await loadHooks(templateDir);
  if (!hooks || typeof hooks.options !== 'function') return staticOpts;

  const dynamic = (await hooks.options(ctx)) || [];
  const byName = new Map(staticOpts.map((o) => [o.name, o]));
  for (const d of dynamic) {
    if (!d || !d.name) continue;
    byName.set(d.name, { ...(byName.get(d.name) || {}), ...d });
  }
  return [...byName.values()];
}

// 生成前钩子：给模板一次机会补齐/校验变量（例如把空端口填成探测到的空闲端口）。
// 返回的补丁合并进 vars；抛错则整个生成中止。
export async function applyBeforeGenerate<Vars extends Record<string, unknown>>(
  templateDir: AbsolutePath,
  vars: Vars,
  ctx: HookCtx,
): Promise<Vars> {
  const hooks = await loadHooks(templateDir);
  if (!hooks || typeof hooks.beforeGenerate !== 'function') return vars;
  const patch = (await hooks.beforeGenerate(vars, ctx)) || {};
  return { ...vars, ...patch };
}

// 生成后钩子：模板可以产出二进制产物（如 logo 的 6 件套）。
// 放在这里而不是 generate 内部，是为了让「生成图片」这种模板专属能力不污染通用生成器。
export async function applyAfterGenerate<Vars extends Record<string, unknown>>(
  templateDir: AbsolutePath,
  targetDir: AbsolutePath,
  vars: Vars,
  ctx: HookCtx,
): Promise<unknown> {
  const hooks = await loadHooks(templateDir);
  if (!hooks || typeof hooks.afterGenerate !== 'function') return null;
  return (await hooks.afterGenerate(targetDir, vars, ctx)) || null;
}

// 读取模板的说明文档（README.md），供 `describe` 展示
export async function readTemplateReadme(templateDir: AbsolutePath): Promise<string> {
  const fsp = await import('node:fs/promises');
  for (const name of ['README.md', 'readme.md']) {
    const p = join(templateDir, name);
    if (existsSync(p)) return fsp.readFile(p, 'utf8');
  }
  return '';
}

// 工具：把文件 URL 转成本机路径（供 service 复用，保持 windows 盘符正确）
export function fileToPath(url: string): string {
  return fileURLToPath(url);
}
