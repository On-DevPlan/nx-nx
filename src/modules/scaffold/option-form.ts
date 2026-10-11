// 新建项目面板的「表单模型」：把模板的 option schema 翻译成三件事——
//   1. 必填 / 可选两组的渲染顺序
//   2. 当前填写够不够格生成（决定「预览文件」「生成项目」两个按钮的可点性）
//   3. 输出目录的默认建议名
//
// 为什么单列一个文件：面板此前把可点性硬编码在 letters 上——那是 server-cli-web
// 家族的专属选项。mono-gf 的必填项是 name、std-a-lang 是 lang，两个模板怎么填都
// 够不到那条分支，按钮恒灰、点了没反应、界面上也看不出差什么。改成完全由 schema
// 驱动后，模板换必填项、加选项，面板不必跟着改。
//
// 与服务端的关系：本模块是 core/templates.ts 的 **前端镜像**，规则必须与
// resolveVars 逐条对齐（tests/unit/option-form.test.mjs 拿真实模板库对拍，
// 规则漂移直接红）。服务端不能反向 import 它：视图对 core 只允许 import type，
// 而这里要进浏览器包。
import type { OptionSpec, TemplateMeta } from '../../core/templates.js';

export interface OptionValues {
  [name: string]: unknown;
}

export interface OptionIssue {
  kind: 'missing' | 'invalid';
  name: string;
  label: string;
  message: string;
}

/** 目录名候选。超过这个形态的值（如 std-a-lang 的「ts, go」）不参与推导。 */
const SLUG = /^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$/;

/**
 * 什么算「没填」。与 resolveVars 的 missing 判定保持一致：
 * 空串 / null / undefined 算缺，0 与 false 不算——它们是合法取值。
 */
export function isBlank(value: unknown): boolean {
  return value === undefined || value === null || value === '';
}

/** 有默认值就不算缺：服务端 blank + default 会落回默认值，不报「缺少必填选项」。 */
function hasValue(opt: OptionSpec, values: OptionValues): boolean {
  return !isBlank(values[opt.name]) || (opt.default !== undefined && opt.default !== null);
}

export function optionLabel(opt: OptionSpec): string {
  return opt.label || opt.name;
}

/** 必填在前、可选在后；组内保持 template.json 的声明顺序。 */
export function splitOptions(opts: OptionSpec[]): {
  required: OptionSpec[];
  optional: OptionSpec[];
} {
  return {
    required: opts.filter((o) => o.required),
    optional: opts.filter((o) => !o.required),
  };
}

/**
 * 单项**格式**校验，留空一律放行。
 *
 * 「必填」和「格式」分开判（后者只管非空值），否则刚打开面板时满屏红字——
 * 还没动手就被告知错了。两类问题在 blockingIssues 里汇合。
 */
export function validateOption(opt: OptionSpec, value: unknown): string | null {
  if (isBlank(value)) return null;
  const label = optionLabel(opt);
  const type = opt.type || 'string';

  if (type === 'number') {
    return Number.isFinite(Number(value)) ? null : `${label} 必须是数字`;
  }
  if (type === 'letters') {
    return /^[a-z]{1,5}$/i.test(String(value).trim()) ? null : `${label} 必须是 1~5 位小写字母`;
  }
  if (type === 'enum') {
    const values = opt.values || [];
    return values.includes(String(value)) ? null : `${label} 只能是 ${values.join(' | ')}`;
  }
  if (opt.pattern) {
    // 模板声明的格式约束（std-a-lang 的 lang 就是这么写的）
    return new RegExp(opt.pattern).test(String(value)) ? null : `${label} 格式不符合要求`;
  }
  return null;
}

/**
 * 当前填写挡住生成的全部原因：缺必填 + 格式非法。
 * 面板用它决定按钮可点性，并把原因原样显示出来——
 * 灰着的按钮必须说清自己在等什么，否则用户只能干瞪眼。
 */
export function blockingIssues(opts: OptionSpec[], values: OptionValues): OptionIssue[] {
  const issues: OptionIssue[] = [];
  for (const opt of opts) {
    const label = optionLabel(opt);
    if (opt.required && !hasValue(opt, values)) {
      issues.push({ kind: 'missing', name: opt.name, label, message: `${label} 必填` });
      continue;
    }
    const err = validateOption(opt, values[opt.name]);
    if (err) issues.push({ kind: 'invalid', name: opt.name, label, message: err });
  }
  return issues;
}

/** 一行说明「现在为什么点不了」；没有阻塞项时返回空串。 */
export function describeIssues(issues: OptionIssue[]): string {
  const missing = issues.filter((i) => i.kind === 'missing').map((i) => i.label);
  const invalid = issues.filter((i) => i.kind === 'invalid').map((i) => i.message);
  const parts: string[] = [];
  if (missing.length) parts.push(`还差必填项：${missing.join('、')}`);
  if (invalid.length) parts.push(invalid.join('；'));
  return parts.join('　');
}

function slug(value: unknown): string {
  const s = String(value ?? '').trim();
  return SLUG.test(s) ? s : '';
}

/**
 * 由 schema 推项目名，用于输出目录的默认值与右侧预览标题。
 *
 * 派生顺序与服务端对齐（core/templates.ts 的派生变量 + 模板钩子）：
 *   1. letters / name 选项有值就用 —— server-cli-web（nx-xx）、mono-gf（demo）
 *   2. 否则取第一个必填选项的值，配上 namePrefix —— std-a-lang：lang=ts → a_ts
 *   3. 推不出就返回空串，由用户自己填目录；宁可空着也不猜错。
 */
export function suggestProjectName(meta: TemplateMeta | null, values: OptionValues): string {
  if (!meta) return '';
  const opts = meta.options || [];
  const primary = opts.find((o) => o.required);
  const src = slug(values.letters) || slug(values.name) || (primary ? slug(values[primary.name]) : '');
  return src ? `${meta.namePrefix || ''}${src}` : '';
}