// 模板域的业务逻辑。CLI 与 Web 面板共用这一层——
// action 只负责把两端不同的输入形态归一成同样的 ctx，业务真相在这里。
import net from 'node:net';
import { existsSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import { listTemplates as coreList, loadTemplate, resolveVars, renderString, decorateMeta } from '../../core/templates.js';
import { resolveOptions, applyBeforeGenerate, applyAfterGenerate, readTemplateReadme } from '../../core/template-hooks.js';
import { generate, walkTemplate } from '../../core/generate.js';
import { badInput } from '../../core/errors/index.js';
import { asAbsolutePath, type AbsolutePath } from '../../core/brand.js';
import type { HookCtx } from '../../core/template-hooks.js';

// 传给模板钩子的工具箱。模板作者不必从 nx-nx 内部 import——
// 那会让模板与生成器的内部路径耦合，生成器一重构所有模板都坏。
function hookCtx(extra: Record<string, unknown> = {}): HookCtx {
  return { probePort, probePorts, ...extra };
}

/**
 * 探测一个端口是否空闲。
 * 绑 127.0.0.1 而不是 0.0.0.0：家族里所有 serve 都只绑本机，
 * 用 0.0.0.0 探测会把「别的机器占着」误判成「本机不可用」。
 */
export function probePort(port: number): Promise<boolean> {
  return new Promise((res) => {
    const srv = net.createServer();
    srv.once('error', () => res(false));
    srv.once('listening', () => srv.close(() => res(true)));
    srv.listen(port, '127.0.0.1');
  });
}

// 从 start 开始找 n 个连续空闲端口
export async function probePorts({ start = 7880, count = 1 }: { start?: number; count?: number } = {}): Promise<
  number[]
> {
  const found: number[] = [];
  let p = Number(start);
  let guard = 0;
  while (found.length < count && guard < 200) {
    if (await probePort(p)) found.push(p);
    p++;
    guard++;
  }
  return found;
}

// 家族已占用的端口，作为探测起点（避免建议出一个撞车端口）
export const FAMILY_PORT_START = 7881;

export async function list() {
  const { templates, errors } = await coreList();
  return { status: 'ok', templates, errors, count: templates.length };
}

export async function describe(id: unknown, opts: { vars?: Record<string, unknown> } = {}) {
  const { meta, dir } = await loadTemplate(id);
  const options = await resolveOptions(meta, dir, hookCtx());
  const readme = await readTemplateReadme(dir);

  // 元数据里的展示文本做宽松渲染：调用方给了 letters 就把 {{name}} 填上
  // （面板预览时用），没给则原样保留 {{name}}——让用户看懂「这里会变成我的项目名」。
  const vars = opts.vars || {};
  const decorated = decorateMeta({ ...meta, options }, vars);

  return {
    status: 'ok',
    template: decorated,
    readme,
    dir,
  };
}

// 预览：不写盘，返回将创建的文件清单 + 解析后的变量。
// 与 create 共用同一套 walkTemplate/generate(dryRun)，
// 所以「预览看到的」与「实际生成的」必然一致——不可能各算各的。
export async function preview({ id, options = {} }: { id: unknown; options?: Record<string, unknown> }) {
  const { meta, dir } = await loadTemplate(id);
  const resolvedOptions = await resolveOptions(meta, dir, hookCtx());
  let vars = resolveVars({ ...meta, options: resolvedOptions }, options);
  vars = await applyBeforeGenerate(dir, vars, hookCtx());

  const files = await walkTemplate(join(dir, 'files') as AbsolutePath);
  const rendered = files.map((f) => renderString(f, vars)).sort();

  return {
    status: 'ok',
    template: meta.id,
    vars,
    files: rendered,
    count: rendered.length,
  };
}

/**
 * 生成项目。
 *
 * 顺序有意为之：选项解析 → 变量解析 → 生成前钩子（补端口等）→ 目标检查 →
 * 写盘 → 生成后钩子（产出 logo 等二进制）。
 * 「生成前钩子」必须在目标检查之前，否则钩子里改的目录名没参与冲突检查。
 */
export async function create({
  id,
  options = {},
  cwd = process.cwd(),
  dryRun = false,
}: {
  id: unknown;
  options?: Record<string, unknown>;
  cwd?: string;
  dryRun?: boolean;
}) {
  const { meta, dir } = await loadTemplate(id);
  const resolvedOptions = await resolveOptions(meta, dir, hookCtx());
  let vars = resolveVars({ ...meta, options: resolvedOptions }, options);
  vars = await applyBeforeGenerate(dir, vars, hookCtx({ cwd }));

  if (!vars.name) {
    throw badInput('模板没有产出项目名——请检查 template.json 是否声明了 namePrefix 与 letters 选项');
  }

  const rawDir = options.dir;
  const targetDir: AbsolutePath = asAbsolutePath(
    rawDir
      ? isAbsolute(String(rawDir))
        ? String(rawDir)
        : resolve(cwd, String(rawDir))
      : resolve(cwd, String(vars.name)),
  );

  const result = await generate({ templateDir: dir, targetDir, vars, dryRun });

  // 生成后钩子：模板专属的二进制产物（如 logo 六件套）。
  // 放这里而不是 generate 内部，是为了让通用生成器永远不认识「图片」这个概念。
  let extra: unknown = null;
  if (!dryRun) {
    extra = await applyAfterGenerate(dir, targetDir, vars, hookCtx({ cwd }));
  }

  const nextSteps = (meta.nextSteps || []).map((s) => renderString(s, vars));

  return {
    status: 'ok',
    template: meta.id,
    outputDir: targetDir,
    vars,
    files: result.files,
    count: result.created,
    dryRun: result.dryRun,
    extra,
    nextSteps,
  };
}

// 目标目录是否已被占用——面板在生成前调它给即时提示，避免用户点下去才发现
export async function checkDir({ dir }: { dir: string }) {
  const abs = asAbsolutePath(isAbsolute(dir) ? dir : resolve(process.cwd(), dir));
  if (!existsSync(abs)) return { status: 'ok', exists: false, usable: true, path: abs };
  const fsp = await import('node:fs/promises');
  const entries = await fsp.readdir(abs);
  return {
    status: 'ok',
    exists: true,
    usable: entries.length === 0,
    entries: entries.length,
    path: abs,
  };
}
