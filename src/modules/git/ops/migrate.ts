// 迁移类操作：migrate-workspace、migrate-with-memory、extract-commits。
//
// 迁移自 gitlike 的 cmd/migrate.go、cmd/migrate_with_memory.go、cmd/extract_commits.go。
// 三者共享一条主线：**用 merge --squash 把变更吸进暂存区，再用 reset 控制暂存区去留**，
// 区别在于「从哪里吸」「往哪个分支吸」「吸完暂存区怎么过滤」。
import { badInput } from '../../../core/errors/index.js';
import {
  commitAll,
  commitStaged,
  currentBranch,
  hasUncommittedChanges,
  isCleanWorktree,
  mergeSquash,
  resetMixed,
  resetTo,
  stagedFiles,
  cherryPick,
  unstageFile,
  refExists,
} from '../../../core/git/repo.js';
import {
  branchExists,
  checkoutBranch,
  createBranch,
  filesInBranch,
  listLocalBranches,
  mergeBase,
} from '../../../core/git/branches.js';import { commitsAfter } from '../../../core/git/commits.js';
import {
  flag,
  okResult,
  skippedResult,
  str,
  type FieldOption,
  type GitOperation,
  type OperationStep,
} from '../types.js';
import { isSafeBranchSuffix } from './branch.js';

const DEFAULT_WIP_MESSAGE = 'WIP: temporary commit for workspace migration';

export const migrateWorkspaceOperation: GitOperation = {
  id: 'migrate-workspace',
  title: '搬运未提交的改动',
  desc: '源分支的全部内容 → 目标分支；分叉时改动以「未提交」形态落地',
  scenario: '改动**还没提交**，想搬到别的分支继续写',
  group: '迁移',
  risk: 'normal',
  fields: [
    {
      name: 'branch',
      label: '目标分支',
      kind: 'text',
      required: true,
      hint: '如 feat/login；不存在会自动创建',
      validate: (v) => (v && v.trim() ? undefined : '分支名不能为空'),
    },
    {
      name: 'commit',
      label: '临时 commit 消息',
      kind: 'text',
      default: DEFAULT_WIP_MESSAGE,
      hint: '仅在工作区有未提交改动时使用',
    },
  ],
  run: async (values, repo) => {
    const target = str(values, 'branch');
    if (!target) throw badInput('缺少参数 --branch（目标分支名）');
    const steps: OperationStep[] = [];

    if (await hasUncommittedChanges()) {
      const message = str(values, 'commit') || DEFAULT_WIP_MESSAGE;
      await commitAll(message);
      steps.push({ name: '临时 commit', ok: true, detail: message });
    } else {
      steps.push({ name: '临时 commit', ok: true, detail: '工作区干净，无需临时 commit' });
    }

    // 目标分支不存在时要**先建**再切。
    //
    // `git checkout <名字>` 不会自动建分支（只有恰好有一个同名远程分支时才会
    // 猜你要建），直接切会报 "pathspec did not match any file(s) known to git"。
    // gitlike 原版就踩着这个坑：目标分支不存在时整条流程失败。
    if (!(await branchExists(target))) {
      await createBranch(target, repo.branch);
      steps.push({ name: `创建 ${target}`, ok: true, detail: `基于 ${repo.branch} 当前 HEAD` });
    }
    await checkoutBranch(target);
    steps.push({ name: `切换到 ${target}`, ok: true, detail: '' });
    await mergeSquash(repo.branch);
    steps.push({ name: 'merge --squash', ok: true, detail: `把 ${repo.branch} 的变更吸进暂存区` });

    await resetMixed();
    steps.push({ name: 'reset --mixed', ok: true, detail: '清空暂存区，保留工作区内容' });

    return okResult(
      `已把 ${repo.branch} 的内容搬到 ${target}`,
      steps,
      { from: repo.branch, to: target }
    );
  },
  cliPreview: (v) => `nx-nx git migrate-workspace --branch ${str(v, 'branch') || '<分支>'}`,
};

export const migrateWithMemoryOperation: GitOperation = {
  id: 'migrate-with-memory',
  title: '带着目标分支已有内容迁移',
  desc: '基于 merge-base 建新分支，只暂存目标分支里也有的文件',
  scenario: '目标分支**已经有内容**，别让源分支覆盖掉它',
  group: '迁移',
  risk: 'normal',
  fields: [
    {
      name: 'new-branch',
      label: '新分支名',
      kind: 'text',
      required: true,
      default: 'temp-to-feat',
    },
    {
      name: 'base',
      label: '基础分支',
      kind: 'select',
      required: true,
      hint: '变更来源',
      resolve: (ctx) => ctx.repo.branch,
      options: async () =>
        (await listLocalBranches()).map<FieldOption>((b) => ({ id: b, label: b, hint: '本地分支' })),
    },
    {
      name: 'reference',
      label: '参考分支',
      kind: 'select',
      required: true,
      hint: '只有它里面有的文件才留在暂存区',
      options: async () =>
        (await listLocalBranches())
          .filter((b) => b.startsWith('feat'))
          .map<FieldOption>((b) => ({ id: b, label: b, hint: 'feat 分支' })),
    },
  ],
  run: async (values, repo) => {
    const newBranch = str(values, 'new-branch');
    const base = str(values, 'base') || repo.branch;
    const reference = str(values, 'reference');
    if (!newBranch) throw badInput('缺少参数 --new-branch（新分支名）');
    if (!reference) throw badInput('缺少参数 --reference（参考分支）');

    const steps: OperationStep[] = [];
    const base_ = await mergeBase(base, reference);
    steps.push({ name: 'merge-base', ok: true, detail: `${base} 与 ${reference} 的共同祖先 ${base_.slice(0, 8)}` });

    await createBranch(newBranch, base_);
    steps.push({ name: `创建 ${newBranch}`, ok: true, detail: `基于 merge-base ${base_.slice(0, 8)}` });

    await checkoutBranch(newBranch);
    steps.push({ name: `切换到 ${newBranch}`, ok: true, detail: '' });

    await mergeSquash(base);
    steps.push({ name: 'merge --squash', ok: true, detail: `把 ${base} 的变更吸进暂存区` });

    // 按参考分支的文件清单过滤暂存区：不在参考分支里的文件取消暂存，让用户自己处理。
    const refFiles = new Set(await filesInBranch(reference));
    const staged = await stagedFiles();
    const kept: string[] = [];
    const removed: string[] = [];
    for (const file of staged) {
      if (refFiles.has(file)) kept.push(file);
      else {
        await unstageFile(file);
        removed.push(file);
      }
    }
    steps.push({
      name: '过滤暂存区',
      ok: true,
      detail: `保留 ${kept.length} 个、取消暂存 ${removed.length} 个（参考 ${reference}）`,
    });

    return okResult(
      `带记忆的分支迁移完成：${newBranch} 基于 merge-base，暂存区已按 ${reference} 过滤`,
      steps,
      { newBranch, base, reference, mergeBase: base_, kept, removed }
    );
  },
  cliPreview: (v) =>
    `nx-nx git migrate-with-memory --new-branch ${str(v, 'new-branch') || '<新分支>'} --base ${str(v, 'base') || '<基础>'} --reference ${str(v, 'reference') || '<参考>'}`,
};

export const extractCommitsOperation: GitOperation = {
  id: 'extract-commits',
  title: '把已提交的一串改动抽成特性分支',
  desc: '当前分支独有的 commit → 抽到 feat-<名字>，主分支 squash 成 1 个',
  scenario: 'AI 在当前分支提交了一串 commit，想抽到 feat 分支、让主分支历史保持干净',
  group: '迁移',
  risk: 'normal',
  fields: [
    {
      name: 'name',
      label: '特性名字',
      kind: 'text',
      required: true,
      hint: '英文；会生成 feat-<名字>',
      validate: (v) => {
        const t = (v ?? '').trim();
        if (!t) return '特性名字不能为空';
        if (!isSafeBranchSuffix(t)) return '特性名字只能包含字母、数字与 - _ . /';
        return undefined;
      },
    },
    {
      name: 'from',
      label: '提取起点',
      kind: 'text',
      hint: '留空则用 origin/<当前分支>（即「本地比远程多出来的提交」）',
    },
  ],
  run: async (values, _repo) => {
    const name = str(values, 'name');
    if (!name) throw badInput('缺少参数 --name（特性名字）');
    if (!isSafeBranchSuffix(name)) throw badInput('--name 只能包含字母、数字与 - _ . /');

    const steps: OperationStep[] = [];
    const current = await currentBranch();
    const featBranch = `feat-${name}`;

    const from = str(values, 'from');
    const startPoint = from || `origin/${current}`;
    if (!(await refExists(startPoint))) {
      throw badInput(
        `起点 ${startPoint} 不存在，请先 git fetch，或用 --from 指定其它起点`
      );
    }
    steps.push({ name: '确定起点', ok: true, detail: startPoint });

    if (!(await isCleanWorktree())) {
      throw badInput('工作区不干净，请先提交或 stash 你的修改，再重试');
    }
    steps.push({ name: '工作区检查', ok: true, detail: '干净' });

    const commits = await commitsAfter(current, startPoint);
    if (commits.length === 0) {
      return skippedResult(`${startPoint} 之后没有提交，无需提取`, steps);
    }

    if (await branchExists(featBranch)) {
      throw badInput(`分支 ${featBranch} 已存在，请先删除或换个名字`);
    }

    await createBranch(featBranch, startPoint);
    steps.push({ name: `创建 ${featBranch}`, ok: true, detail: `从 ${startPoint} 分叉` });
    await checkoutBranch(featBranch);
    steps.push({ name: `切换到 ${featBranch}`, ok: true, detail: '' });

    for (const c of commits) {
      try {
        await cherryPick(c.hash);
        steps.push({ name: `cherry-pick ${c.short}`, ok: true, detail: c.subject });
      } catch (err) {
        steps.push({
          name: `cherry-pick ${c.short}`,
          ok: false,
          detail: `失败，可能存在冲突：${err instanceof Error ? err.message : String(err)}`,
        });
        throw badInput(
          `cherry-pick ${c.short} 失败，流程已暂停。解决冲突后 git add <file> && git cherry-pick --continue，或 git cherry-pick --abort 中止。`
        );
      }
    }

    await checkoutBranch(current);
    steps.push({ name: `切回 ${current}`, ok: true, detail: '' });
    await resetTo(startPoint);
    steps.push({ name: `reset 到 ${startPoint}`, ok: true, detail: '丢弃与本次提取无关的本地状态' });
    await mergeSquash(featBranch);
    steps.push({ name: 'merge --squash', ok: true, detail: `把 ${featBranch} 的内容吸进暂存区` });
    await commitStaged(
      `merge: integrate ${featBranch} via squash (1 commit absorbing ${commits.length} feature commits)`
    );
    steps.push({ name: '提交 squash', ok: true, detail: '主分支历史 = 起点 + 1 个 squash commit' });

    return okResult(
      `提取完成：${current} 留下 1 个 squash commit，${featBranch} 含 ${commits.length} 个提交`,
      steps,
      { branch: current, featBranch, startPoint, commits: commits.map((c) => c.hash) }
    );
  },
  cliPreview: (v) => {
    const parts = [`nx-nx git extract-commits --name ${str(v, 'name') || '<名字>'}`];
    const from = str(v, 'from');
    if (from) parts.push(`--from ${from}`);
    return parts.join(' ');
  },
};

/** extract-commits 用到的「是否跳过确认」标记（保留给 CLI 层）。 */
export function extractSkipConfirm(values: Record<string, unknown>): boolean {
  return flag(values as Record<string, string | string[]>, 'yes');
}
