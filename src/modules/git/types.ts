// git 模块的领域类型。
//
// 与 gitlike 最大的差别在这里：gitlike 只有两个 struct（GhostRow / ConflictedFile），
// 其余全靠 "hash|subject|author" 这种管道字符串在函数之间传递，调用方自己 split。
// 本模块把「分支 / 提交 / 冲突 / 进行中操作 / 操作结果」都建成显式类型——
// 管道编码的那部分债不照抄。
import type { ConflictedFile } from '../../core/git/conflicts.js';
import type { InProgressState } from '../../core/git/progress.js';
import type { RemoteBranch } from '../../core/git/branches.js';

export type { ConflictedFile, InProgressState, RemoteBranch };

/** 业务结果状态。失败一律 throw（走 errors 契约），这里只表达「不是错误但也没干活」。 */
export type OperationStatus = 'ok' | 'skipped' | 'blocked' | 'conflict';

export interface OperationStep {
  name: string;
  ok: boolean;
  detail: string;
}

export interface OperationResult {
  status: OperationStatus;
  /** 一句话结论 */
  message: string;
  /** 分步记录：CLI 与 Web 都按这个渲染 */
  steps: OperationStep[];
  /** 结构化附加信息（--json 时原样给出） */
  data?: Record<string, unknown>;
}

export function okResult(message: string, steps: OperationStep[] = [], data?: Record<string, unknown>): OperationResult {
  return { status: 'ok', message, steps, ...(data ? { data } : {}) };
}

export function skippedResult(message: string, steps: OperationStep[] = [], data?: Record<string, unknown>): OperationResult {
  return { status: 'skipped', message, steps, ...(data ? { data } : {}) };
}

export function blockedResult(message: string, steps: OperationStep[] = [], data?: Record<string, unknown>): OperationResult {
  return { status: 'blocked', message, steps, ...(data ? { data } : {}) };
}

export function conflictResult(message: string, steps: OperationStep[] = [], data?: Record<string, unknown>): OperationResult {
  return { status: 'conflict', message, steps, ...(data ? { data } : {}) };
}

/** 字段取值：一个字段要么是单值（文本 / 单选 / 开关），要么是多值（多选）。 */
export type FieldValue = string | string[];

export type FieldKind = 'text' | 'select' | 'multi' | 'confirm';

export interface FieldOption {
  id: string;
  label: string;
  detail?: string;
  hint?: string;
  disabled?: boolean;
}

/** 交互时能拿到的仓库现场。 */
export interface RepoContext {
  root: string;
  branch: string;
  branches: string[];
  remoteBranches: RemoteBranch[];
  inProgress: InProgressState;
  conflicts: ConflictedFile[];
  clean: boolean;
}

/** 字段求值时的上下文。 */
export interface FieldContext {
  /** 已经收集到的值（前面的字段） */
  values: Record<string, FieldValue>;
  repo: RepoContext;
}

export interface OperationField {
  /** 与 CLI flag 同名——交互式收集的值可以直接喂给同一条命令 */
  name: string;
  label: string;
  kind: FieldKind;
  required?: boolean;
  /** 文本默认值 */
  default?: string;
  /** 提示（放在选项右侧 / 输入框下方） */
  hint?: string;
  /** 选项来源；动态函数可以异步读仓库状态 */
  options?: (ctx: FieldContext) => Promise<FieldOption[]> | FieldOption[];
  /**
   * 提问前的预览：在把这个字段的问题抛给用户之前，先把相关事实摆出来。
   *
   * 比如「要清除哪些文件」——先把快照里匹配到的文件与大小列出来，
   * 用户才知道自己在选什么。返回 undefined 表示没有可预览的内容。
   */
  preview?: (ctx: FieldContext) => Promise<string | undefined> | string | undefined;
  /**
   * 自动推导：返回非空就**不问**，直接采用。
   *
   * 这是「渐进式」的核心——能从仓库现状推出来的参数一律不问，
   * 只把真正需要人拍板的（选哪个分支、选哪些文件）拿出来问。
   */
  resolve?: (ctx: FieldContext) => Promise<string | undefined> | string | undefined;
  /** 文本校验：返回错误信息表示不合法 */
  validate?: (value: string | undefined) => string | undefined;
  /** 危险字段：确认页要求额外敲固定文字 */
  danger?: boolean;
}

export type OperationRisk = 'normal' | 'danger';

export interface GitOperation {
  id: string;
  title: string;
  desc: string;
  /**
   * 什么时候用这个（一句人话场景）。
   *
   * 光有「做什么」不够——三个迁移操作都是「把改动搬到别的分支」，
   * 用户在菜单里分不清。场景句直接回答「我什么时候该点它」。
   */
  scenario?: string;
  /** 分组（交互式列表按组折叠） */
  group: string;
  risk: OperationRisk;
  /** 字段声明，顺序即提问顺序 */
  fields: OperationField[];
  /**
   * 执行：CLI 与交互式共用同一份实现。
   *
   * onStep 是可选的进度回调——交互模式用它实时打点（长任务不该让人干等），
   * 直连 CLI 不传，于是同一份实现两种观感。
   */
  run: (
    values: Record<string, FieldValue>,
    repo: RepoContext,
    onStep?: (step: OperationStep) => void
  ) => Promise<OperationResult>;
  /** 展示「等价的 CLI 命令」——交互式确认页用它告诉用户这等价于敲什么 */
  cliPreview: (values: Record<string, FieldValue>) => string;
  /**
   * 确认页要展示的文档（危险操作或需要人判断时）。
   * 返回 undefined 表示这一步没有文档要展示。
   */
  guide?: (values: Record<string, FieldValue>, repo: RepoContext) => string | undefined;
  /** 危险操作：确认时必须原样敲出的文字 */
  confirmText?: string;
}

/** 取字符串字段；缺失即输入错误（错误文本带「用法:」由 action 层保证）。 */
export function str(values: Record<string, FieldValue>, name: string): string {
  const v = values[name];
  if (typeof v === 'string') return v.trim();
  if (typeof v === 'number') return String(v);
  return '';
}

/** 取多选字段。 */
export function list(values: Record<string, FieldValue>, name: string): string[] {
  const v = values[name];
  if (Array.isArray(v)) return v;
  if (typeof v === 'string' && v) return v.split(',').map((s) => s.trim()).filter(Boolean);
  return [];
}

/** 取开关字段（confirm）。 */
export function flag(values: Record<string, FieldValue>, name: string): boolean {
  const v = values[name];
  return v === 'true' || v === 'yes' || v === '1';
}

// ---- 交互模式的返回形状 ----

export interface InteractiveOperationMeta {
  id: string;
  title: string;
  desc: string;
  group: string;
  risk: string;
  cli: string;
  fields: Array<{
    name: string;
    label: string;
    kind: string;
    required: boolean;
    default?: string;
    hint?: string;
  }>;
  confirmText?: string;
}

/** 非交互环境（管道 / CI / --json）下的只读快照。 */
export interface InteractiveSnapshot {
  mode: 'snapshot';
  hint: string;
  repo: {
    root: string;
    branch: string;
    inProgress: string;
    conflicts: string[];
    branches: string[];
    remoteBranches: string[];
  };
  operations: InteractiveOperationMeta[];
}

/**
 * `git i` 的返回值。
 *
 * 两种来源：真 TTY 下由交互流程产生（结果已打印，printed=true）；
 * 非 TTY 下由 action 的 run 产生（只读快照）。
 */
export type GitInteractiveOutcome =
  | { kind: 'snapshot'; snapshot: InteractiveSnapshot }
  | { kind: 'operation'; result: OperationResult; printed: boolean };
