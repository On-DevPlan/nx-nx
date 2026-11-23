// 历史类操作：cleanup-history（幽灵镜像）、force-push（强推并建立分支映射）。
//
// 两个都是**危险且不可逆**的操作，所以：
//   - 都有 confirmText：确认时必须原样敲出指定文字，敲错就不执行；
//   - cleanup-history 执行前强制备份 .git，并在每一步失败时把备份路径带出来；
//   - force-push 先把本地目的分支备份成 <branch>-bak-HHMMSS。
import { badInput } from '../../../core/errors/index.js';
import {
  addAll,
  cleanUntracked,
  currentBranch,
  discardChanges,
  resetMixed,
} from '../../../core/git/repo.js';
import {
  branchExists,
  createBranch,
  discoverMainBranch,
  forcePush,
  forcePushUnchecked,
  listLocalBranches,
  listRemoteBranches,
  renameBranch,
  deleteBranch,
} from '../../../core/git/branches.js';
import {
  GHOST_FINAL_SNAPSHOT_MESSAGE,
  backupGitDir,
  cleanupFilterBranchRefs,
  finalizeSnapshot,
  restoreGitDirHint,
  rewriteAsGhost,
} from '../../../core/git/ghost.js';
import { hasConflicts } from '../../../core/git/conflicts.js';
import {
  flag,
  okResult,
  str,
  type FieldOption,
  type GitOperation,
  type OperationStep,
} from '../types.js';
import { cleanupWarning } from '../docs.js';

export const cleanupHistoryOperation: GitOperation = {
  id: 'cleanup-history',
  title: '幽灵镜像清理历史',
  desc: '保留标题/作者/时间/拓扑，把每个 commit 的内容换成 rewrite.txt',
  scenario: '要把历史内容抹掉但保留提交形状（危险）',
  group: '历史',
  risk: 'danger',
  confirmText: '我了解风险，确认清理',
  fields: [
    {
      name: 'main-branch',
      label: '主分支',
      kind: 'select',
      hint: '只幽灵化 主分支..HEAD 之间的提交',
      resolve: async () => (await discoverMainBranch('origin')) ?? undefined,
      options: async () =>
        (await listLocalBranches()).map<FieldOption>((b) => ({ id: b, label: b, hint: '本地分支' })),
    },
    {
      name: 'limit',
      label: '幽灵化数量上限',
      kind: 'text',
      default: '50',
      hint: '0 = 全部',
    },
    {
      name: 'message',
      label: '快照 commit 消息',
      kind: 'text',
      default: GHOST_FINAL_SNAPSHOT_MESSAGE,
    },
    {
      name: 'keep-untracked',
      label: '快照一并提交未追踪文件',
      kind: 'confirm',
      default: 'false',
    },
    {
      name: 'push',
      label: '最后强制推送到远程',
      kind: 'confirm',
      default: 'false',
      hint: '独立开关；默认只改本地',
    },
  ],
  guide: () => cleanupWarning(),
  run: async (values, repo) => {
    const steps: OperationStep[] = [];
    const mainBranch = str(values, 'main-branch') || (await discoverMainBranch('origin')) || '';
    if (!mainBranch) {
      throw badInput('无法自动发现主分支，请用 --main-branch 显式指定');
    }
    const limit = Number.parseInt(str(values, 'limit') || '50', 10);
    if (!Number.isFinite(limit) || limit < 0) throw badInput('--limit 必须是非负整数');
    const message = str(values, 'message') || GHOST_FINAL_SNAPSHOT_MESSAGE;

    if (await hasConflicts()) {
      throw badInput('检测到冲突文件，请先解决冲突再清理历史（git abort / resolve-conflicts）');
    }
    steps.push({ name: '前置检查', ok: true, detail: `主分支 ${mainBranch}，无冲突` });

    const backupDir = await backupGitDir();
    steps.push({ name: '备份 .git', ok: true, detail: backupDir });

    try {
      const rewritten = await rewriteAsGhost(mainBranch);
      steps.push({ name: '幽灵化重写', ok: true, detail: `已重写 ${rewritten} 个提交` });

      await finalizeSnapshot(flag(values, 'keep-untracked'), message);
      steps.push({ name: '最终快照', ok: true, detail: message });

      if (!flag(values, 'push')) {
        steps.push({ name: '推送', ok: true, detail: '未推送（--push 才推）' });
        return okResult(
          `本地幽灵镜像完成（未推送）：重写了 ${rewritten} 个提交`,
          steps,
          { backupDir, mainBranch, rewritten, pushed: false }
        );
      }

      const remotes = await listRemoteBranches();
      if (remotes.length === 0) {
        steps.push({ name: '推送', ok: false, detail: '无远程仓库，跳过推送' });
        return okResult(`本地幽灵镜像完成（无远程，未推送）`, steps, {
          backupDir,
          mainBranch,
          rewritten,
          pushed: false,
        });
      }

      const branch = await currentBranch();
      const cleaned = await cleanupFilterBranchRefs();
      if (cleaned.length > 0) {
        steps.push({ name: '清理 refs/original', ok: true, detail: `删除 ${cleaned.length} 个备份引用` });
      }
      await forcePushUnchecked('origin', branch, branch);
      steps.push({ name: '强制推送', ok: true, detail: `已推送到 origin/${branch}` });

      return okResult(`幽灵镜像完成并已推送到 origin/${branch}`, steps, {
        backupDir,
        mainBranch,
        rewritten,
        pushed: true,
        branch,
      });
    } catch (err) {
      // 每阶段失败都必须把备份路径带出来——这是唯一的回滚依据。
      throw badInput(
        `${err instanceof Error ? err.message : String(err)}\n备份目录（可用于恢复）: ${backupDir}\n${restoreGitDirHint(backupDir, repo.root)}`
      );
    }
  },
  cliPreview: (v) => {
    const parts = ['nx-nx git cleanup-history'];
    const main = str(v, 'main-branch');
    if (main) parts.push(`--main-branch ${main}`);
    const limit = str(v, 'limit');
    if (limit) parts.push(`--limit ${limit}`);
    if (flag(v, 'keep-untracked')) parts.push('--keep-untracked');
    if (flag(v, 'push')) parts.push('--push');
    return parts.join(' ');
  },
};

export const forcePushOperation: GitOperation = {
  id: 'force-push',
  title: '强推分支并改名',
  desc: '把本地分支强推到远程分支，再把本地分支改名成远程分支名',
  scenario: '要把本地分支改名并覆盖远端同名分支（危险）',
  group: '历史',
  risk: 'danger',
  confirmText: 'FORCE-PUSH',
  fields: [
    {
      name: 'local',
      label: '本地分支',
      kind: 'select',
      required: true,
      hint: '要推上去的分支',
      resolve: (ctx) => ctx.repo.branch,
      options: async () =>
        (await listLocalBranches()).map<FieldOption>((b) => ({ id: b, label: b, hint: '本地分支' })),
    },
    {
      name: 'remote',
      label: '远程分支',
      kind: 'select',
      required: true,
      hint: '会被覆盖的远程分支',
      options: async () =>
        (await listRemoteBranches()).map<FieldOption>((b) => ({
          id: b.branch,
          label: b.full,
          detail: `远程 ${b.remote} 上的 ${b.branch}`,
        })),
    },
  ],
  run: async (values, repo) => {
    const local = str(values, 'local') || repo.branch;
    const remote = str(values, 'remote');
    if (!local) throw badInput('缺少参数 --local（本地分支）');
    if (!remote) throw badInput('缺少参数 --remote（远程分支名）');

    const steps: OperationStep[] = [];
    const stamp = new Date().toISOString().slice(11, 19).replace(/:/g, '');
    const backupBranch = `${remote}-bak-${stamp}`;

    // 步骤 1：备份本地目的分支
    if (await branchExists(remote)) {
      await createBranch(backupBranch, remote);
      steps.push({ name: `备份 ${remote}`, ok: true, detail: `已创建备份分支 ${backupBranch}` });
    } else {
      steps.push({ name: `备份 ${remote}`, ok: true, detail: '本地没有同名分支，无需备份' });
    }

    // 步骤 2：强推
    await forcePush('origin', local, remote);
    steps.push({ name: '强制推送', ok: true, detail: `${local} → origin/${remote}` });

    // 步骤 3：清理工作区并改名
    await discardChanges();
    await resetMixed();
    await cleanUntracked();
    await addAll();
    steps.push({ name: '清理工作区', ok: true, detail: '已丢弃改动并清理未追踪文件' });

    if (await branchExists(remote)) {
      await deleteBranch(remote);
      steps.push({ name: `删除本地 ${remote}`, ok: true, detail: '将被改名取代' });
    }
    await renameBranch(local, remote);
    steps.push({ name: '重命名分支', ok: true, detail: `${local} → ${remote}` });

    return okResult(
      `强制推送完成：origin/${remote} 已被覆盖，本地分支已映射为 ${remote}`,
      steps,
      { local, remote, backupBranch }
    );
  },
  cliPreview: (v) =>
    `nx-nx git force-push --local ${str(v, 'local') || '<本地分支>'} --remote ${str(v, 'remote') || '<远程分支>'}`,
};
