// 交互式模式：nx-nx git i
//
// 设计取自参照实现 vercel-labs/skills 的渐进式流程（选来源 → 选平台 → 勾选 → 确认 → apply），
// 但把它做成**数据驱动**的：操作注册表里每条操作自己声明要哪些字段，
// 向导只负责「按声明逐项收集 → 确认 → 调 run」，不写死任何一条操作的流程。
//
// 「渐进式」体现在三处：
//   1. **能推导的就不问**：字段声明了 resolve（从仓库现状推导）就直接采用，并告诉用户采用了什么；
//   2. **只有一个选项的不问**：选项数为 1 时自动选中；
//   3. **按需才问**：字段顺序即提问顺序，用户已经给了值的（CLI 传参）直接跳过。
//
// 关键约束：交互式收集完参数后，调的是**与直连 CLI 完全相同的 run**，
// 所以两条路径不会跑偏。
import * as p from '../../core/terminal/prompts.js';
import { searchMultiselect, isCancelled, type SearchItem } from '../../core/terminal/search-multiselect.js';
import { bold, cyan, dim, green, red, yellow } from '../../core/terminal/color.js';
import { badInput } from '../../core/errors/index.js';
import { OPERATIONS, findOperation } from './ops/index.js';
import { repoContext } from './service.js';
import {
  flag,
  list,
  skippedResult,
  str,
  type FieldContext,
  type FieldOption,
  type FieldValue,
  type GitOperation,
  type OperationResult,
} from './types.js';

export interface InteractiveOptions {
  /** 预选操作：nx-nx git i extract-commits 直接从这一步开始 */
  operation?: string;
}

/** 选项太少用 clack 的 select，太多用自研的搜索式多选（可打字过滤）。 */
const SEARCH_THRESHOLD = 8;

export async function runInteractive(options: InteractiveOptions = {}): Promise<OperationResult> {
  const repo = await repoContext();

  p.intro(bold('nx-nx git') + dim(' · 企业级 git 工作流'));

  // 现场先行：用户一进来就该知道仓库现在什么状态（有没有在进行的操作、有没有冲突）。
  const stateNote = [
    `路径: ${repo.root}`,
    `当前分支: ${repo.branch || '(游离 HEAD)'}`,
    `进行中的操作: ${repo.inProgress.operation === 'none' ? '无' : repo.inProgress.operation}`,
    `冲突: ${repo.conflicts.length === 0 ? '无' : `${repo.conflicts.length} 个`}`,
  ].join('\n');
  p.note(stateNote, '仓库现场');

  const op = options.operation ? findOperation(options.operation) : await pickOperation();
  if (!op) {
    p.cancel('已取消');
    return skippedResult('交互式操作已取消');
  }

  p.log.step(`${op.title} — ${op.desc}`);

  const values: Record<string, FieldValue> = {};
  const collected = await collectFields(op, values, repo);
  if (!collected) {
    p.cancel('已取消');
    return skippedResult('交互式操作已取消');
  }

  // 确认页：把「即将做什么」与「等价于敲哪条命令」摆出来。
  const guide = op.guide?.(values, repo);
  if (guide) p.note(guide, op.risk === 'danger' ? '风险提示' : '操作指南');

  const preview = op.cliPreview(values);
  p.note(`${op.title}\n\n等价命令: ${preview}`, '即将执行');

  const confirmed = await confirmOperation(op);
  if (!confirmed) {
    p.cancel('已取消');
    return skippedResult('交互式操作已取消');
  }

  // 执行：确认过就带上 force（abort 用它表示「我读过中止指南了」）。
  values.force = 'true';

  const spin = p.spinner();
  spin.start(`执行 ${op.title}…`);
  let result: OperationResult;
  try {
    result = await op.run(values, repo, (step) => {
      spin.message(`${step.name}${step.detail ? ` — ${step.detail}` : ''}`);
    });
  } catch (err) {
    spin.stop('执行失败');
    p.log.error(err instanceof Error ? err.message : String(err));
    p.outro(red('操作失败'));
    throw err;
  }
  spin.stop(result.status === 'ok' ? green('完成') : yellow(result.status));

  for (const step of result.steps) {
    if (step.ok) p.log.info(`${step.name}${step.detail ? dim(` — ${step.detail}`) : ''}`);
    else p.log.warn(`${step.name}${step.detail ? dim(` — ${step.detail}`) : ''}`);
  }

  if (result.status === 'ok') p.outro(green(result.message));
  else if (result.status === 'skipped') p.outro(yellow(result.message));
  else p.outro(red(result.message));

  return result;
}

/** 选操作：按分组折叠的搜索式多选。 */
async function pickOperation(): Promise<GitOperation | undefined> {
  const items: SearchItem<string>[] = OPERATIONS.map((op) => ({
    value: op.id,
    label: op.title,
    group: op.group,
    hint: op.risk === 'danger' ? '危险' : op.id,
    detail: [
      op.scenario ? `什么时候用：${op.scenario}` : '',
      op.desc,
      `等价命令: nx-nx git ${op.id}`,
    ]
      .filter(Boolean)
      .join('\n'),
  }));

  const selected = await searchMultiselect({
    message: '选择要执行的操作',
    items,
    required: true,
    maxVisible: 10,
    searchable: true,
    showDetail: true,
    detailLines: 3,
    showSelectedSummary: false,
    selectGroups: true,
    multiple: false,
  });

  if (isCancelled(selected)) return undefined;
  const id = (selected as string[])[0];
  return id ? findOperation(id) : undefined;
}

/**
 * 按字段声明逐项收集参数。
 * 返回 false 表示用户中途取消。
 */
async function collectFields(
  op: GitOperation,
  values: Record<string, FieldValue>,
  repo: Awaited<ReturnType<typeof repoContext>>
): Promise<boolean> {
  for (const field of op.fields) {
    const ctx: FieldContext = { values, repo };

    // 0) 已经拿到值的字段直接跳过（CLI 传参 / 上游已收集）。
    if (values[field.name] !== undefined) continue;

    // 1) 能推导的直接采用，不打扰用户。
    if (field.resolve) {
      const auto = await field.resolve(ctx);
      if (auto !== undefined && auto !== '') {
        values[field.name] = auto;
        p.log.info(`${field.label}: ${cyan(String(auto))} ${dim('（自动推导）')}`);
        continue;
      }
    }

    // 2) 先把相关事实摆出来（文件清单、体积……），用户才知道自己在选什么。
    if (field.preview) {
      const preview = await field.preview(ctx);
      if (preview) p.note(preview, field.label);
    }

    // 3) 只有一个选项时自动选中。
    if (field.options) {
      const options = await field.options(ctx);
      if (options.length === 1 && !options[0]!.disabled) {
        values[field.name] = field.kind === 'multi' ? [options[0]!.id] : options[0]!.id;
        p.log.info(`${field.label}: ${cyan(options[0]!.label)} ${dim('（唯一选项）')}`);
        continue;
      }
      const picked = await askField(field, options);
      if (picked === undefined) return false;
      values[field.name] = picked;
      continue;
    }

    // 4) 没有选项来源：文本或开关。
    const picked = await askField(field, []);
    if (picked === undefined) return false;
    values[field.name] = picked;
  }
  return true;
}

/** 问一个字段。返回 undefined 表示用户取消。 */
async function askField(
  field: {
    name: string;
    label: string;
    kind: string;
    required?: boolean;
    hint?: string;
    default?: string;
    validate?: (value: string | undefined) => string | undefined;
  },
  options: FieldOption[]
): Promise<FieldValue | undefined> {
  switch (field.kind) {
    case 'text': {
      const res = await p.text({
        message: field.hint ? `${field.label}（${field.hint}）` : field.label,
        placeholder: field.default ?? '',
        defaultValue: field.default,
        validate: (v) => field.validate?.(v),
      });
      if (p.isCancel(res)) return undefined;
      return String(res);
    }
    case 'confirm': {
      const res = await p.confirm({
        message: field.hint ? `${field.label}（${field.hint}）` : field.label,
        initialValue: field.default === 'true',
      });
      if (p.isCancel(res)) return undefined;
      return res ? 'true' : 'false';
    }
    case 'multi': {
      if (options.length === 0) {
        throw badInput(`当前没有可选的 ${field.label}`);
      }
      if (options.length <= SEARCH_THRESHOLD) {
        const res = await p.multiselect({
          message: field.hint ? `${field.label}（${field.hint}）` : field.label,
          options: options.map((o) => ({ value: o.id, label: o.label, hint: o.hint })),
          required: Boolean(field.required),
        });
        if (p.isCancel(res)) return undefined;
        return res as string[];
      }
      const res = await searchMultiselect({
        message: field.hint ? `${field.label}（${field.hint}）` : field.label,
        items: options.map<SearchItem<string>>((o) => ({
          value: o.id,
          label: o.label,
          hint: o.hint,
          detail: o.detail,
        })),
        required: Boolean(field.required),
        maxVisible: 12,
        showDetail: true,
        detailLines: 2,
      });
      if (isCancelled(res)) return undefined;
      return res as string[];
    }
    case 'select':
    default: {
      if (options.length === 0) {
        throw badInput(`当前没有可选的 ${field.label}`);
      }
      const res = await p.select({
        message: field.hint ? `${field.label}（${field.hint}）` : field.label,
        options: options.map((o) => ({
          value: o.id,
          label: o.label,
          hint: o.hint,
        })),
        initialValue: field.default,
      });
      if (p.isCancel(res)) return undefined;
      return String(res);
    }
  }
}

/**
 * 确认。
 *
 * 危险操作必须原样敲出指定文字（cleanup-history 要敲「我了解风险，确认清理」，
 * force-push 要敲「FORCE-PUSH」）——敲错就不执行。
 */
async function confirmOperation(op: GitOperation): Promise<boolean> {
  if (op.confirmText) {
    const res = await p.text({
      message: `请原样输入「${op.confirmText}」以确认执行`,
      placeholder: op.confirmText,
      validate: (v) => (v && v.trim() === op.confirmText ? undefined : `文字不匹配，请原样输入：${op.confirmText}`),
    });
    if (p.isCancel(res)) return false;
    return String(res).trim() === op.confirmText;
  }
  const res = await p.confirm({
    message: '确认执行以上操作？',
    initialValue: true,
  });
  if (p.isCancel(res)) return false;
  return res === true;
}

/** 把已收集的值拼成 CLI 参数串——用于「等价命令」展示与调试。 */
export function valuesToArgs(values: Record<string, FieldValue>): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(values)) {
    if (k === 'force') continue;
    if (typeof v === 'boolean') continue;
    if (Array.isArray(v)) {
      if (v.length) parts.push(`--${k} ${v.join(',')}`);
      continue;
    }
    if (v === '' || v === 'false') continue;
    parts.push(`--${k} ${v}`);
  }
  return parts.join(' ');
}

export { str, list, flag };
