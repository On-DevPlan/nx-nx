// 冲突：状态码分类与文件列举。
//
// 只放**数据**，不放文档渲染——gitlike 把冲突类型说明文档放在 internal/git 里，
// 那其实是 UI 文本（越层）。本实现把渲染放到 modules/git/text.ts，
// core 只负责「冲突有哪几个、分别是什么类型」。
import { git } from './exec.js';
import { statusEntries } from './repo.js';

export type ConflictCode = 'UU' | 'AA' | 'DD' | 'AU' | 'UA' | 'DU' | 'UD';

export interface ConflictedFile {
  path: string;
  status: ConflictCode;
  /** 中文说明，如「双方修改 (both modified) — 最常见」 */
  description: string;
}

/** 冲突状态码 → 中文说明。与 gitlike 的映射表一致。 */
export const CONFLICT_DESCRIPTIONS: Record<ConflictCode, string> = {
  UU: '双方修改 (both modified) — 最常见',
  AA: '双方添加 (both added) — 文件在两个分支中分别被创建',
  DD: '双方删除 (both deleted) — 文件在两个分支中都被删除',
  AU: '我方添加 / 对方删除 (added by us, deleted by them)',
  UA: '对方添加 / 我方删除 (added by them, deleted by us)',
  DU: '我方删除 / 对方修改 (deleted by us, modified by them)',
  UD: '我方修改 / 对方删除 (modified by us, deleted by them)',
};

const CONFLICT_CODES = Object.keys(CONFLICT_DESCRIPTIONS) as ConflictCode[];

export function isConflictCode(code: string): code is ConflictCode {
  return (CONFLICT_CODES as string[]).includes(code);
}

/** 当前处于冲突状态的文件。 */
export async function conflictedFiles(cwd?: string): Promise<ConflictedFile[]> {
  const entries = await statusEntries(cwd);
  const files: ConflictedFile[] = [];
  for (const entry of entries) {
    const code = entry.code.trim();
    if (!isConflictCode(code)) continue;
    files.push({ path: entry.path, status: code, description: CONFLICT_DESCRIPTIONS[code] });
  }
  return files;
}

export async function hasConflicts(cwd?: string): Promise<boolean> {
  return (await conflictedFiles(cwd)).length > 0;
}

/** 冲突涉及几种状态码——多于一种时拒绝统一策略（见 gitlike 的混合类型保护）。 */
export function distinctConflictCodes(files: ConflictedFile[]): ConflictCode[] {
  return [...new Set(files.map((f) => f.status))];
}

/** 把某个文件标记为已解决（取一侧版本 + 暂存）。 */
export async function resolveFile(
  path: string,
  strategy: 'ours' | 'theirs',
  cwd?: string
): Promise<void> {
  await git(['checkout', `--${strategy}`, '--', path], { cwd });
  await git(['add', '--', path], { cwd });
}
