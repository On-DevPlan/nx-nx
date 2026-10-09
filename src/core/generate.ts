// 项目生成器：把模板树渲染到目标目录。
//
// 关键设计：**从上游模板目录直接读、直接写目标**，不做「先整树读进内存再写」。
// 原因有二：
//   1. 模板可能含二进制资产（图片、字体），读成 'utf8' 字符串再写会损坏
//   2. 生成是流式的，模板再大也不吃内存
// 只有**文本**文件走 {{var}} 替换；判断依据是扩展名白名单 + 内容无 NUL 字节。
import fsp from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { blocked, badInput } from './errors/index.js';
import { renderString } from './templates.js';
import { isTextPath } from './skills/text-util.js';
import type { AbsolutePath } from './brand.js';

// 模板里不该带过去的东西
const SKIP_NAMES = new Set(['.git', 'node_modules', '.DS_Store', 'template.json']);
const SKIP_EXTS = new Set(['.log', '.tmp']);

// 递归遍历模板树，产出相对路径清单（不读内容）。
// dry-run 预览与实际生成共用它，因此「预览看到的」与「实际写出的」必然一致。
export async function walkTemplate(root: AbsolutePath, { rel = '' }: { rel?: string } = {}): Promise<string[]> {
  const out: string[] = [];
  const here = join(root, rel);
  const entries = await fsp.readdir(here, { withFileTypes: true });

  for (const e of entries) {
    if (SKIP_NAMES.has(e.name)) continue;
    const childRel = rel ? rel + '/' + e.name : e.name;
    const dot = e.name.lastIndexOf('.');
    const ext = dot <= 0 ? '' : e.name.slice(dot).toLowerCase();
    if (SKIP_EXTS.has(ext)) continue;

    if (e.isDirectory()) {
      out.push(...(await walkTemplate(root, { rel: childRel })));
    } else if (e.isFile()) {
      out.push(childRel);
    }
  }
  return out;
}

// 目标目录安全检查：**存在且非空**就直接拒绝，绝不静默覆盖。
// 生成器覆盖用户已有目录是不可逆事故，宁可在这一步烦人。
export async function assertTargetUsable(dir: AbsolutePath): Promise<{ exists: boolean }> {
  if (!existsSync(dir)) return { exists: false };
  const entries = await fsp.readdir(dir);
  if (entries.length) {
    throw blocked(
      `目标目录已存在且非空: ${dir}（共 ${entries.length} 项）。` +
        '请换一个目录，或先清空它——生成器不会覆盖已有内容。'
    );
  }
  return { exists: true };
}

export interface GenerateInput {
  templateDir: AbsolutePath; // 模板根（含 files/）
  targetDir: AbsolutePath; // 输出目录（绝对路径）
  vars: Record<string, unknown>; // resolveVars 的产物
  dryRun?: boolean; // true 时只算不写
}

export interface GenerateResult {
  files: string[];
  created: number;
  dryRun: boolean;
}

export async function generate({
  templateDir,
  targetDir,
  vars,
  dryRun = false,
}: GenerateInput): Promise<GenerateResult> {
  const srcRoot = join(templateDir, 'files');
  if (!existsSync(srcRoot)) {
    throw badInput(`模板缺少 files/ 目录: ${templateDir}`);
  }

  if (!dryRun) await assertTargetUsable(targetDir);

  const rels = await walkTemplate(srcRoot as AbsolutePath);
  const written: string[] = [];
  const targetRoot = resolve(targetDir);

  for (const rel of rels) {
    // 路径本身也可能含占位符（如 bin/{{letters}}.mjs）
    const outRel = renderString(rel, vars).split('/').join(sep);

    // 渲染后的每一段都必须是正常路径段：
    //  - 含 '..' 段的一律拒绝，**即使 resolve 后仍在目标目录内**。
    //    （'bin/../x' 规范化后是目标内的 'x'，逃逸检查抓不住它；
    //    但「模板变量把 .. 带进路径」本身就说明输入没洗干净——
    //    让它悄悄变成另一个目录名，不如当场报错。）
    //  - 盘符/绝对路径段同理。
    if (outRel.split(sep).some((s) => s === '..' || s === '.' || /^[A-Za-z]:$/.test(s))) {
      throw badInput(`渲染后的路径含非法段（.. 或 . 或盘符）: ${rel} → ${outRel}`);
    }

    // 防穿越：解析成绝对路径后必须仍落在目标目录内。
    // 比对解析结果，而不是字符串前缀——后者挡不住编码变形。
    const abs = resolve(targetDir, outRel) as AbsolutePath;
    if (abs !== targetRoot && !abs.startsWith(targetRoot + sep)) {
      throw badInput(`渲染后的路径越出目标目录: ${rel} → ${outRel}`);
    }

    written.push(outRel.split(sep).join('/'));
    if (dryRun) continue;

    await fsp.mkdir(dirname(abs), { recursive: true });

    const srcAbs = join(srcRoot, rel);
    if (isTextPath(rel)) {
      const text = await fsp.readFile(srcAbs, 'utf8');
      await fsp.writeFile(abs, renderString(text, vars), 'utf8');
    } else {
      await fsp.copyFile(srcAbs, abs);
    }
  }

  return { files: written, created: written.length, dryRun };
}

// 相对路径工具：面板展示用（绝对路径太长）
export function relTo(base: string, p: string): string {
  return relative(base, p).split(sep).join('/');
}
