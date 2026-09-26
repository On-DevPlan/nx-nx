// 模板注册表：发现、加载、校验 templates/ 下的模板。
//
// 设计前提：**nx-nx 是通用的项目模板生成管理器**，server-cli-web 只是其中一个模板。
// 后续任何模板（别的骨架、别的语言栈）只要满足本文件的契约就能被 list / describe /
// create 三条路径一致地处理，不需要改 runtime。
//
// 模板契约（templates/<id>/）：
//   template.json   元数据 + 可选项 schema + 生成后置动作
//   files/          模板文件树，路径与内容里可用 {{var}} 占位
//
// 约定：目录名即模板 id（template.json 里重复声明是为了自描述与校验一致）。
import fsp from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { badInput, notFound, specError } from './errors/index.js';

// 可选值类型表。新增类型要同时更新：这里、spec 层的强转、面板的控件映射。
export const OPTION_TYPES = new Set(['string', 'number', 'boolean', 'enum', 'letters']);

const HERE = dirname(fileURLToPath(import.meta.url));

// 模板目录定位：编译前后位置不同，且要能在任意 cwd 下被调用。
// 与 nx-pn 的 locateTemplateDir 同一思路——多候选，第一个存在的胜出。
function candidateDirs() {
  return [
    resolve(HERE, '..', '..', 'templates'), // src/core/ → 项目根/templates
    resolve(process.cwd(), 'templates'),
  ];
}

export function templatesDir() {
  for (const dir of candidateDirs()) {
    if (existsSync(dir)) return dir;
  }
  throw specError(
    '找不到 templates/ 目录（尝试过: ' + candidateDirs().join(', ') + '）'
  );
}

// 读一个模板的元数据并校验。任何一处不合契约都抛 specError——
// 模板坏了是作者的问题，不是用户输入的问题，错误码必须区分开。
async function readTemplateMeta(dir, dirName) {
  const metaPath = join(dir, 'template.json');
  let raw;
  try {
    raw = await fsp.readFile(metaPath, 'utf8');
  } catch {
    throw specError(`模板 ${dirName} 缺少 template.json`);
  }

  let meta;
  try {
    meta = JSON.parse(raw);
  } catch (err) {
    throw specError(`模板 ${dirName} 的 template.json 不是合法 JSON: ${err.message}`);
  }

  if (!meta.id) throw specError(`模板 ${dirName} 的 template.json 缺少 id`);
  if (meta.id !== dirName) {
    throw specError(`模板目录名与 id 不一致: 目录 ${dirName} vs id ${meta.id}`);
  }
  if (!meta.name) throw specError(`模板 ${dirName} 缺少 name`);

  for (const opt of meta.options || []) {
    if (!opt.name) throw specError(`模板 ${dirName} 有选项缺少 name`);
    if (!OPTION_TYPES.has(opt.type || 'string')) {
      throw specError(
        `模板 ${dirName} 的选项 ${opt.name} 类型非法: ${opt.type}（可选 ${[...OPTION_TYPES].join(' / ')}）`
      );
    }
    if ((opt.type === 'enum') && !Array.isArray(opt.values)) {
      throw specError(`模板 ${dirName} 的枚举选项 ${opt.name} 缺少 values 数组`);
    }
  }

  return { meta, dir };
}

// 列出全部模板。坏模板不吞掉也不中断——收集成 errors 一并返回，
// 这样面板能显示「哪个模板坏了、为什么」，而不是整个列表打不开。
export async function listTemplates() {
  const root = templatesDir();
  let entries;
  try {
    entries = await fsp.readdir(root, { withFileTypes: true });
  } catch {
    return { templates: [], errors: [] };
  }

  const templates = [];
  const errors = [];
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    try {
      const { meta } = await readTemplateMeta(join(root, e.name), e.name);
      templates.push(meta);
    } catch (err) {
      errors.push({ id: e.name, message: String((err && err.message) || err) });
    }
  }
  templates.sort((a, b) => a.id.localeCompare(b.id));
  return { templates, errors };
}

export async function loadTemplate(id) {
  const safe = String(id || '').trim();
  if (!safe) throw badInput('模板 id 不能为空');
  // 防目录穿越：id 必须是单段名字
  if (/[\\/]/.test(safe) || safe.includes('..')) {
    throw badInput('非法模板 id: ' + safe);
  }

  const root = templatesDir();
  const dir = join(root, safe);
  if (!existsSync(join(dir, 'template.json'))) {
    const { templates } = await listTemplates();
    const avail = templates.map((t) => t.id).join(', ') || '(无)';
    throw notFound(`模板不存在: ${safe}（可用: ${avail}）`);
  }
  return readTemplateMeta(dir, safe);
}

// 把模板声明 + 用户输入解析成最终变量表。
//
// 这里负责三件事，都不该散到调用方：
//   1. 类型强转与默认值填充
//   2. 必填校验
//   3. 派生变量（name / title / envPrefix）——由名为 letters 的选项推出，
//      模板不必自己拼字符串，也就不会各拼各的
export function resolveVars(meta, input = {}) {
  const vars = {};

  for (const opt of meta.options || []) {
    const type = opt.type || 'string';
    const raw = input[opt.name];
    const missing = raw === undefined || raw === null || raw === '';

    if (missing) {
      if (opt.default !== undefined && opt.default !== null) {
        vars[opt.name] = opt.default;
        continue;
      }
      if (opt.required) throw badInput(`缺少必填选项: ${opt.label || opt.name}`);
      // 未声明默认值的可选数值项（如端口）留空，由钩子在生成前补齐
      vars[opt.name] = type === 'boolean' ? false : '';
      continue;
    }

    vars[opt.name] = coerceOption(opt, raw);
  }

  // ---- 派生变量 ----
  // 约定：名为 letters 的选项是项目字母。有 namePrefix 的模板据此派生 name。
  if (vars.letters && meta.namePrefix) {
    vars.name = meta.namePrefix + vars.letters;
    if (vars.name === meta.id) {
      throw badInput(`字母 ${vars.letters} 会生成与模板同名的项目 ${vars.name}，请换一组`);
    }
  }
  if (vars.name) {
    vars.title = vars.name;
    vars.envPrefix = vars.name.toUpperCase().replace(/-/g, '_');
  }

  return vars;
}

function coerceOption(opt, raw) {
  const type = opt.type || 'string';
  if (type === 'boolean') {
    if (typeof raw === 'boolean') return raw;
    const s = String(raw).toLowerCase();
    return !(s === 'false' || s === '0' || s === 'no' || s === '');
  }
  if (type === 'number') {
    const n = Number(raw);
    if (!Number.isFinite(n)) throw badInput(`选项 ${opt.label || opt.name} 必须是数字，收到: ${raw}`);
    return n;
  }
  if (type === 'enum') {
    const s = String(raw);
    if (!opt.values.includes(s)) {
      throw badInput(
        `选项 ${opt.label || opt.name} 只能是 ${opt.values.join(' | ')}，收到: ${s}`
      );
    }
    return s;
  }
  if (type === 'letters') {
    const s = String(raw).trim().toLowerCase();
    if (!/^[a-z]{1,5}$/.test(s)) {
      throw badInput(`选项 ${opt.label || opt.name} 必须是 1~5 位小写字母，收到: ${raw}`);
    }
    return s;
  }
  return String(raw);
}

// 把目标目录里的 {{var}} 渲染出来（用于 gitignore 里排除自身等场景）
export function renderString(src, vars) {
  return String(src).replace(/\{\{([\w-]+)\}\}/g, (_, key) => {
    if (!(key in vars)) {
      throw specError(`模板使用了未声明的变量 {{${key}}}（已提供: ${Object.keys(vars).join(', ')}）`);
    }
    return String(vars[key]);
  });
}

// 宽松渲染：模板**元数据**里的展示文本用（hint / nextSteps / description）。
//
// 与严格版的区别：未声明的变量原样保留，不抛错。
// 为什么需要两套：元数据在 `list` 阶段就要展示，那时还没有 vars
// （用户还没填字母）。此时把 {{name}} 原样显示出来，用户能看懂
// 「这里将来会变成我的项目名」；抛错则整个列表都打不开。
export function renderMetaText(src, vars) {
  return String(src == null ? '' : src).replace(/\{\{([\w-]+)\}\}/g, (m, key) =>
    key in vars ? String(vars[key]) : m
  );
}

// 给模板元数据里所有面向用户的文本字段做一次宽松渲染
export function decorateMeta(meta, vars) {
  const out = { ...meta };
  out.description = renderMetaText(meta.description, vars);
  out.nextSteps = (meta.nextSteps || []).map((s) => renderMetaText(s, vars));
  out.options = (meta.options || []).map((o) => ({
    ...o,
    label: renderMetaText(o.label, vars),
    hint: renderMetaText(o.hint, vars),
  }));
  return out;
}
