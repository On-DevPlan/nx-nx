// 终端文档：需要人先读懂、再决定的中止指南与风险提示。
//
// 迁移自 gitlike 的 cmd/abort.go（printConflictDocument）与 cmd/cleanup.go（printCleanupWarning）。
// 两处改进：
//   1. gitlike 的 leftText/centerText 按 **字节长度** 补空格，中文一律对不齐；
//      这里按**显示宽度**补（复用 core/terminal/width.ts 的 CJK 宽度算法）。
//   2. gitlike 把冲突类型说明文档放在 internal/git（越层），这里统一放在展示层。
import { approxStringWidth } from '../../core/terminal/width.js';

const BOX_WIDTH = 70;

/** 按显示宽度左对齐补空格。 */
function padRight(text: string, width: number): string {
  const w = approxStringWidth(text);
  return w >= width ? text : text + ' '.repeat(width - w);
}

/** 按显示宽度居中。 */
function padCenter(text: string, width: number): string {
  const w = approxStringWidth(text);
  if (w >= width) return text;
  const left = Math.floor((width - w) / 2);
  return ' '.repeat(left) + text + ' '.repeat(width - w - left);
}

/** 画一个方框，行内容按显示宽度补齐。 */
function box(lines: string[], width = BOX_WIDTH): string {
  const border = '━'.repeat(width);
  const out: string[] = [];
  out.push(`┏${border}┓`);
  for (const line of lines) out.push(`┃${padRight(line, width)}┃`);
  out.push(`┗${border}┛`);
  return out.join('\n');
}

/**
 * 中止指南：列出操作摘要、冲突文件、中止命令、风险、检查清单、验证步骤与替代方案。
 *
 * 这是 gitlike 最有价值的资产——「有冲突时不自动中止，先把风险摆出来让人看」。
 */
export function abortGuide(operation: string, target: string, conflictFiles: string[]): string {
  const lines: string[] = [];
  lines.push(padCenter('⚠  GIT 操作中止指南  ⚠', BOX_WIDTH));
  lines.push('');
  lines.push('【当前操作摘要】');
  lines.push(`  操作类型: ${operation}`);
  if (target) lines.push(`  目标: ${target.length > 40 ? `${target.slice(0, 40)}...` : target}`);
  lines.push(`  冲突文件数: ${conflictFiles.length}`);
  lines.push('');
  lines.push('【冲突文件列表】');
  const shown = conflictFiles.slice(0, 10);
  for (const f of shown) lines.push(`  ${f}`);
  if (conflictFiles.length > 10) lines.push(`  ... 还有 ${conflictFiles.length - 10} 个冲突文件`);
  lines.push('');
  lines.push('【中止命令】');
  lines.push('  执行以下命令中止当前操作:');
  lines.push(`  ${abortCommandFor(operation)}`);
  lines.push('');
  lines.push('【⚠ 重要警告】');
  lines.push('  中止操作将丢失所有已解决但未提交的更改');
  lines.push('  包括:');
  lines.push('    - 已手动解决的冲突');
  lines.push('    - 冲突文件中的任何修改');
  lines.push('    - 操作过程中暂存的其他更改');
  lines.push('');
  lines.push('【中止前检查清单】');
  lines.push('  □ 已 stash 重要更改: git stash push -m "abort-backup"');
  lines.push('  □ 已记录已解决的文件列表');
  lines.push('  □ 已创建备份分支 (可选): git branch backup-before-abort');
  lines.push('  □ 理解中止后所有冲突解决进度将丢失');
  lines.push('');
  lines.push('【中止后验证】');
  lines.push('  1. 检查 git 状态: git status');
  lines.push('  2. 确认无进行中的操作: nx-nx git status');
  lines.push('  3. 如需恢复 stash 的更改: git stash pop');
  lines.push('');
  lines.push('【替代方案】');
  lines.push('  如果不想丢失冲突解决进度，可以考虑:');
  lines.push('    - 继续解决冲突并提交');
  lines.push('    - 使用 git add + git commit 完成当前操作');
  lines.push('    - 或创建备份分支后重新尝试');
  return box(lines);
}

/** 各操作对应的中止命令。 */
export function abortCommandFor(operation: string): string {
  switch (operation) {
    case 'merge':
      return 'git merge --abort';
    case 'rebase':
      return 'git rebase --abort';
    case 'cherry-pick':
      return 'git cherry-pick --abort';
    case 'revert':
      return 'git revert --abort';
    case 'am':
      return 'git am --abort';
    default:
      return 'git <operation> --abort';
  }
}

/** 冲突类型说明：混合冲突类型时必须先给这份文档。 */
export function conflictTypeDoc(): string {
  const lines: string[] = [];
  lines.push(padCenter('Git 冲突类型说明', BOX_WIDTH));
  lines.push('');
  lines.push('  UU — 双方修改 (both modified)');
  lines.push('      文件在两个分支都被修改，需要手动合并或选择其中一方版本。');
  lines.push('');
  lines.push('  AA — 双方添加 (both added)');
  lines.push('      文件在两个分支中分别被创建，内容不同，需要选择其中一个。');
  lines.push('');
  lines.push('  DD — 双方删除 (both deleted)');
  lines.push('      文件在两个分支中都被删除，通常可以直接删除标记。');
  lines.push('');
  lines.push('  AU — 我方添加 / 对方删除');
  lines.push('      当前分支添加了文件，但合并分支删除了它。');
  lines.push('');
  lines.push('  UA — 对方添加 / 我方删除');
  lines.push('      合并分支添加了文件，但当前分支删除了它。');
  lines.push('');
  lines.push('  DU — 我方删除 / 对方修改');
  lines.push('      当前分支删除了文件，但合并分支修改了它。');
  lines.push('');
  lines.push('  UD — 我方修改 / 对方删除');
  lines.push('      当前分支修改了文件，但合并分支删除了它。');
  lines.push('');
  lines.push('  提示: 检测到多种冲突类型混合，不同类型可能需要不同处理方式。');
  lines.push('        请手动处理，或对每个文件单独使用 git checkout --ours/--theirs。');
  return box(lines);
}

/** 幽灵镜像清理的风险提示。 */
export function cleanupWarning(): string {
  const lines: string[] = [];
  lines.push(padCenter('⚠  危险操作：即将重写所有 Git 历史  ⚠', BOX_WIDTH));
  lines.push('');
  lines.push('【幽灵镜像：实际效果】');
  lines.push('');
  lines.push('  1. 旧 commit 标题 / 作者 / 时间 / 拓扑完全保留');
  lines.push('  2. 每个 commit 的文件树被替换为单个 rewrite.txt');
  lines.push('  3. rewrite.txt 记录原始 hash/date/author/files');
  lines.push('  4. 末尾追加 2 个 commit：删除 rewrite.txt + 当前快照');
  lines.push('  5. .git 已备份可回滚到原始状态');
  lines.push('');
  lines.push('【建议】');
  lines.push('');
  lines.push('  - 执行前确保所有更改已提交');
  lines.push('  - 协作者需要重新 git fetch --force 同步');
  return box(lines);
}

/** 多个进行中操作并存时的处理指引（罕见状态，不自动处理）。 */
export function multipleStatesDoc(operations: string): string {
  const lines: string[] = [];
  lines.push(padCenter('检测到多个进行中的 git 操作', BOX_WIDTH));
  lines.push('');
  lines.push(`  操作: ${operations}`);
  lines.push('');
  lines.push('  这是一个罕见的嵌套状态，可能由以下原因导致:');
  lines.push('    - 之前的操作异常中断，残留了状态文件');
  lines.push('    - 手动操作导致了状态重叠');
  lines.push('');
  lines.push('  建议手动处理步骤:');
  lines.push('');
  lines.push('  1. 检查 git 状态: git status');
  lines.push('  2. 尝试逐个中止操作（按风险从低到高）:');
  lines.push('     git cherry-pick --abort');
  lines.push('     git revert --abort');
  lines.push('     git merge --abort');
  lines.push('     git rebase --abort');
  lines.push('     git am --abort');
  lines.push('');
  lines.push('  3. 如果上述命令都失败，检查 .git 目录:');
  lines.push('     ls .git/MERGE_HEAD');
  lines.push('     ls .git/rebase-merge/');
  lines.push('     ls .git/CHERRY_PICK_HEAD');
  lines.push('');
  lines.push('  注意: 手动删除状态文件可能导致数据丢失，请确保已备份重要更改');
  return box(lines);
}

/**
 * 历史清除（purge-files）的风险提示。
 *
 * 与 cleanup-warning 的区别：那个是「把内容全换成 rewrite.txt」，
 * 这个是「只删选中的那几个文件」——但同样会改 hash，同样要提醒协作方。
 */
export function purgeWarning(files: string[]): string {
  const lines: string[] = [];
  lines.push(padCenter('⚠  危险操作：即将重写 Git 历史  ⚠', BOX_WIDTH));
  lines.push('');
  lines.push('【本次要清除的文件】');
  lines.push('');
  if (files.length === 0) {
    lines.push('  （未选择文件：只列清单，不会改动历史）');
  } else {
    for (const f of files.slice(0, 10)) lines.push(`  ${f}`);
    if (files.length > 10) lines.push(`  ... 还有 ${files.length - 10} 个`);
  }
  lines.push('');
  lines.push('【实际效果】');
  lines.push('');
  lines.push('  1. 从「文件最早的创建提交」往后的每个 commit 都会被重写');
  lines.push('  2. 这些 commit 的 hash 全部会变（标题/作者/时间保持不变）');
  lines.push('  3. 选中的文件从整段历史里消失，工作区那份也会一起删掉');
  lines.push('  4. 因清除文件而变空的提交会被剪掉（--keep-empty 可保留）');
  lines.push('  5. .git 已备份，可回滚到原始状态');
  lines.push('');
  lines.push('【注意】');
  lines.push('');
  lines.push('  - 协作者必须重新 clone 或 git fetch --force，否则会被打断');
  lines.push('  - 已推送过的旧 hash 仍在远端，要彻底消失需远端一并清理');
  lines.push('  - 要真正释放磁盘空间，需要执行 gc（默认开启）');
  return box(lines);
}
