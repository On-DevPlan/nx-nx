// 提交：列举与解析。
//
// gitlike 用 "hash|subject|author" 的管道字符串在函数之间传递提交信息，
// 调用方要自己 split，而且 split 之后拿不到结构化字段。这里直接返回对象。
import { git, trimLines } from './exec.js';

export interface CommitRef {
  /** 完整 hash */
  hash: string;
  /** 短 hash（7 位） */
  short: string;
  /** 提交标题 */
  subject: string;
  /** 作者名 */
  author: string;
}

/** 幽灵镜像用的完整元数据（多带日期与邮箱）。 */
export interface CommitMeta {
  hash: string;
  short: string;
  /** ISO-8601 提交时间 */
  date: string;
  author: string;
  email: string;
  /** 该提交树里的文件数 */
  files: number;
}

export function shortHash(hash: string): string {
  return hash.slice(0, 7);
}

/** 某个分支的最新 n 个提交（新的在前）。 */
export async function listCommits(branch: string, limit = 1000, cwd?: string): Promise<CommitRef[]> {
  const out = await git(['log', branch, `-n${limit}`, '--format=%H|%s|%an'], { cwd });
  return parseCommitRefs(out);
}

export function parseCommitRefs(raw: string): CommitRef[] {
  const result: CommitRef[] = [];
  for (const line of trimLines(raw)) {
    const parts = line.split('|');
    if (parts.length < 3) continue;
    result.push({
      hash: parts[0]!,
      short: shortHash(parts[0]!),
      subject: parts[1]!,
      author: parts[2]!,
    });
  }
  return result;
}

/**
 * 起点之后的提交（**旧的在前**，适合顺序 cherry-pick）。
 * from 可以是任意 ref：origin/main、某个 hash。
 */
export async function commitsAfter(
  branch: string,
  from: string,
  limit = 0,
  cwd?: string
): Promise<CommitRef[]> {
  const args = ['log', branch, `^${from}`, '--reverse', '--format=%H|%s|%an'];
  if (limit > 0) args.push(`-n${limit}`);
  const out = await git(args, { cwd });
  return parseCommitRefs(out);
}

/**
 * from..to 之间的提交（旧的在前），带日期与邮箱——幽灵镜像用它写 rewrite.txt。
 */
export async function commitsBetween(
  from: string,
  to: string,
  limit = 0,
  cwd?: string
): Promise<CommitMeta[]> {
  const args = ['log', `${from}..${to}`, '--reverse', '--format=%H|%cI|%an|%ae'];
  if (limit > 0) args.push(`-n${limit}`);
  const out = await git(args, { cwd });
  const rows: CommitMeta[] = [];
  for (const line of trimLines(out)) {
    const parts = line.split('|');
    if (parts.length < 4) continue;
    const hash = parts[0]!;
    rows.push({
      hash,
      short: shortHash(hash),
      date: parts[1]!,
      author: parts[2]!,
      email: parts[3]!,
      files: 0,
    });
  }
  // 文件数逐个 ls-tree 统计（gitlike 同样做法）。
  for (const row of rows) {
    const files = await git(['ls-tree', '-r', '--name-only', row.hash], { cwd });
    row.files = trimLines(files).length;
  }
  return rows;
}
