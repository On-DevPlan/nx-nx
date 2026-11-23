// 合并状态快照：stash 之前把「进行中操作」的状态文件备份出来。
//
// 为什么需要：git stash 会把 index 一起清掉，而 merge / rebase / cherry-pick 的
// 状态就存在 index 与那几个哨兵文件里——stash 完 --abort 就失效了。
// gitlike 是靠「先 SaveMergeState → stash --keep-index → RestoreMergeState」的顺序绕过去的，
// 这里保持同样的语义，但实现上更直接：备份到临时目录，用完即删。
import { cpSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { git } from './exec.js';

/** 需要备份的状态文件。 */
const STATE_FILES = ['MERGE_HEAD', 'MERGE_MSG', 'MERGE_MODE', 'CHERRY_PICK_HEAD', 'REVERT_HEAD'];

/** 需要整体备份的状态目录。 */
const STATE_DIRS = ['rebase-merge', 'rebase-apply'];

async function gitDirPath(cwd?: string): Promise<string> {
  const out = await git(['rev-parse', '--git-path', '.'], { cwd });
  return out.trim();
}

/** 备份当前合并状态，返回备份目录（调用方负责用 restoreMergeState 还原并删除）。 */
export async function saveMergeState(cwd?: string): Promise<string> {
  const tmp = mkdtempSync(join(tmpdir(), 'nx-nx-git-abort-'));
  const gitDir = await gitDirPath(cwd);
  for (const file of STATE_FILES) {
    const src = join(gitDir, file);
    if (existsSync(src)) cpSync(src, join(tmp, file));
  }
  for (const dir of STATE_DIRS) {
    const src = join(gitDir, dir);
    if (existsSync(src)) cpSync(src, join(tmp, dir), { recursive: true });
  }
  return tmp;
}

/** 还原备份的合并状态。 */
export async function restoreMergeState(backupDir: string, cwd?: string): Promise<void> {
  const gitDir = await gitDirPath(cwd);
  for (const file of STATE_FILES) {
    const src = join(backupDir, file);
    if (existsSync(src)) cpSync(src, join(gitDir, file));
  }
  for (const dir of STATE_DIRS) {
    const src = join(backupDir, dir);
    if (existsSync(src)) {
      const dst = join(gitDir, dir);
      rmSync(dst, { recursive: true, force: true });
      cpSync(src, dst, { recursive: true });
    }
  }
}

/** 删掉备份目录。 */
export function discardMergeState(backupDir: string): void {
  rmSync(backupDir, { recursive: true, force: true });
}
