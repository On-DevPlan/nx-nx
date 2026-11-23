// CLI 文本渲染：把操作结果画成人读的文本。
//
// 与仓库其他模块的约定一致：渲染与业务分开（一个 action 声明 + 渲染函数已经很占行数）。
import { bold, cyan, dim, green, red, yellow } from '../../core/terminal/color.js';
import { formatSize } from '../../core/terminal/format.js';
import type { OperationResult } from './types.js';

const STATUS_MARK: Record<string, string> = {
  ok: green('✔'),
  skipped: dim('·'),
  blocked: yellow('■'),
  conflict: red('▲'),
};

/** 渲染一条操作结果。 */
export function formatOperationResult(result: OperationResult): string {
  const lines: string[] = [];
  const mark = STATUS_MARK[result.status] ?? '';
  lines.push(`${mark} ${bold(result.message)}`);

  if (result.steps.length) {
    lines.push('');
    for (const step of result.steps) {
      const flag = step.ok ? green('✓') : red('✗');
      lines.push(`  ${flag} ${step.name}${step.detail ? dim(` — ${step.detail}`) : ''}`);
    }
  }

  const guide = result.data?.guide;
  if (typeof guide === 'string' && guide) {
    lines.push('');
    lines.push(guide);
  }

  const conflicts = result.data?.conflicts;
  if (Array.isArray(conflicts) && conflicts.length > 0) {
    lines.push('');
    lines.push(`${yellow('冲突文件:')}`);
    for (const c of conflicts as Array<{ path: string; status: string; description: string }>) {
      lines.push(`  ${red(`[${c.status}]`)} ${c.path} ${dim(c.description)}`);
    }
  }

  const changes = result.data?.changes;
  if (Array.isArray(changes) && changes.length > 0) {
    lines.push('');
    lines.push(`${cyan('未提交改动:')}`);
    for (const c of changes as Array<{ code: string; path: string }>) {
      lines.push(`  ${dim(c.code)} ${c.path}`);
    }
  }

  // 快照扫描结果（purge-files）：文件 + 体积，让「要删哪些」有据可依。
  const matched = result.data?.matchedFiles;
  if (Array.isArray(matched) && matched.length > 0) {
    lines.push('');
    lines.push(`${cyan('匹配到的文件:')}`);
    for (const f of matched as Array<{ path: string; size: number }>) {
      lines.push(`  ${dim(formatSize(f.size).padStart(10))}  ${f.path}`);
    }
  }

  return lines.join('\n');
}

/** 渲染状态快照（比通用结果更细，带分支清单）。 */
export function formatStatus(result: OperationResult): string {
  const lines: string[] = [];
  const data = result.data ?? {};
  lines.push(`${green('✔')} ${bold('仓库状态')}`);
  lines.push('');
  lines.push(`  路径       ${data.root ?? ''}`);
  lines.push(`  当前分支   ${data.branch || '(游离 HEAD)'}`);
  lines.push(`  进行中的操作 ${data.inProgress && data.inProgress !== 'none' ? red(String(data.inProgress)) : green('无')}`);

  const conflicts = (data.conflicts ?? []) as Array<{ path: string; status: string }>;
  lines.push(
    `  冲突       ${conflicts.length === 0 ? green('无') : red(`${conflicts.length} 个`)}`
  );

  const changes = (data.changes ?? []) as Array<{ code: string; path: string }>;
  if (changes.length === 0) {
    lines.push(`  工作区     ${green('干净')}`);
  } else {
    lines.push(`  工作区     ${yellow(`${changes.length} 处未提交改动`)}`);
    for (const c of changes.slice(0, 20)) {
      lines.push(`    ${dim(c.code)} ${c.path}`);
    }
    if (changes.length > 20) lines.push(dim(`    ... 还有 ${changes.length - 20} 处`));
  }

  const branches = (data.branches ?? []) as string[];
  lines.push('');
  lines.push(`${cyan(`本地分支 (${branches.length}):`)} ${dim(branches.join(', '))}`);

  const remotes = (data.remoteBranches ?? []) as Array<string | { full?: string; branch?: string }>;
  // 远程分支既可能是 "origin/x" 字符串，也可能是 { remote, branch, full } 对象——
  // 两种都渲染成可读的短名，别让 [object Object] 漏到终端上。
  const remoteNames = remotes.map((r) =>
    typeof r === 'string' ? r : (r.full ?? `${r.branch ?? ''}`)
  );
  lines.push(`${cyan(`远程分支 (${remoteNames.length}):`)} ${dim(remoteNames.join(', '))}`);

  return lines.join('\n');
}

/** 渲染非交互快照（`git i` 在管道 / --json 下的输出）。 */
export function formatSnapshot(snapshot: {
  hint: string;
  repo: Record<string, unknown>;
  operations: Array<{ id: string; title: string; desc: string; group: string; risk: string; cli: string }>;
}): string {
  const lines: string[] = [];
  lines.push(bold('nx-nx git 交互模式（只读快照）'));
  lines.push('');
  lines.push(dim(snapshot.hint));
  lines.push('');
  lines.push(`  路径       ${snapshot.repo.root ?? ''}`);
  lines.push(`  当前分支   ${snapshot.repo.branch ?? ''}`);
  lines.push(`  进行中的操作 ${snapshot.repo.inProgress ?? 'none'}`);
  const conflicts = (snapshot.repo.conflicts ?? []) as string[];
  lines.push(`  冲突       ${conflicts.length === 0 ? '无' : conflicts.join(', ')}`);
  lines.push('');
  lines.push(cyan('可用操作:'));
  for (const op of snapshot.operations) {
    const risk = op.risk === 'danger' ? red(' [危险]') : '';
    lines.push(`  ${bold(op.id.padEnd(20))} ${op.title}${risk}`);
    lines.push(`  ${' '.repeat(20)} ${dim(op.desc)}`);
    lines.push(`  ${' '.repeat(20)} ${dim(op.cli)}`);
  }
  return lines.join('\n');
}
