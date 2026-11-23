// 分支类操作：prfeat（建工作分支对）、cherry-pick（从别的分支拿提交）。
//
// 迁移自 gitlike 的 cmd/prfeat.go 与 cmd/cherry_pick.go，
// 修掉了两处：分支名不再用手写 sanitize（会吞掉非法字符），
// commit 选择从「管道字符串 + 反向拼接匹配」改成结构化对象。
import { badInput } from '../../../core/errors/index.js';
import {
  branchExists,
  checkoutBranch,
  createBranch,
  listLocalBranches,
} from '../../../core/git/branches.js';
import { cherryPick, currentBranch } from '../../../core/git/repo.js';
import { listCommits } from '../../../core/git/commits.js';
import {
  flag,
  list,
  okResult,
  str,
  type FieldOption,
  type GitOperation,
  type OperationStep,
} from '../types.js';

/** 分支后缀只允许安全字符：字母数字与 - _ . / */
export function isSafeBranchSuffix(name: string): boolean {
  return /^[A-Za-z0-9._/-]+$/.test(name);
}

export const prfeatOperation: GitOperation = {
  id: 'prfeat',
  title: '创建工作分支对',
  desc: '基于当前分支建 workerea-<名字> 与 feat-<名字>，并切到工作分支',
  scenario: '要开一个特性分支，但想让「开发用的分支」和「拿去开 PR 的分支」分开',
  group: '分支',
  risk: 'normal',
  fields: [
    {
      name: 'name',
      label: '特性名字',
      kind: 'text',
      required: true,
      hint: '如 login；会生成 workerea-login 与 feat-login',
      validate: (v) => {
        if (!v || !v.trim()) return '特性名字不能为空';
        if (!v || !isSafeBranchSuffix(v.trim())) return '只能包含字母、数字与 - _ . /';
        return undefined;
      },
    },
  ],
  run: async (values, repo) => {
    const name = str(values, 'name');
    if (!name) throw badInput('缺少参数 --name（特性名字）');
    if (!isSafeBranchSuffix(name)) throw badInput('--name 只能包含字母、数字与 - _ . /');

    const workerea = `workerea-${name}`;
    const feat = `feat-${name}`;
    const steps: OperationStep[] = [];

    for (const branch of [workerea, feat]) {
      if (await branchExists(branch)) {
        throw badInput(`分支 ${branch} 已存在，换个名字或先删掉它`);
      }
    }

    await createBranch(workerea, repo.branch);
    steps.push({ name: `创建 ${workerea}`, ok: true, detail: `基于 ${repo.branch}` });
    await createBranch(feat, repo.branch);
    steps.push({ name: `创建 ${feat}`, ok: true, detail: `基于 ${repo.branch}` });
    await checkoutBranch(workerea);
    steps.push({ name: `切换到 ${workerea}`, ok: true, detail: '可以在这里开发，完成后合并到 feat 分支' });

    return okResult(
      `已创建 ${workerea} 与 ${feat}，当前在 ${workerea}`,
      steps,
      { workerea, feat, base: repo.branch }
    );
  },
  cliPreview: (v) => `nx-nx git prfeat --name ${str(v, 'name')}`,
};

export const cherryPickOperation: GitOperation = {
  id: 'cherry-pick',
  title: '从别的分支取提交',
  desc: '列出源分支的提交，挑一个 cherry-pick 到当前分支',
  scenario: '别的分支里有你要的提交，想单独拿一个过来',
  group: '分支',
  risk: 'normal',
  fields: [
    {
      name: 'source',
      label: '源分支',
      kind: 'select',
      required: true,
      hint: '要从中挑提交的分支',
      options: async (ctx) => {
        const branches = await listLocalBranches();
        const others = branches.filter((b) => b !== ctx.repo.branch);
        return others.map<FieldOption>((b) => ({ id: b, label: b, hint: '本地分支' }));
      },
    },
    {
      name: 'commit',
      label: '提交',
      kind: 'select',
      required: true,
      hint: '要 cherry-pick 的提交',
      options: async (ctx) => {
        const source = str(ctx.values, 'source');
        if (!source) return [];
        const commits = await listCommits(source, 200);
        return commits.map<FieldOption>((c) => ({
          id: c.hash,
          label: `${c.short} ${c.subject}`,
          hint: c.author,
          detail: `${c.hash}\n作者: ${c.author}`,
        }));
      },
    },
  ],
  run: async (values, _repo) => {
    const source = str(values, 'source');
    const hash = str(values, 'commit');
    if (!source) throw badInput('缺少参数 --source（源分支）');
    if (!hash) throw badInput('缺少参数 --commit（提交 hash）');

    const steps: OperationStep[] = [];
    const current = await currentBranch();
    await cherryPick(hash);
    steps.push({ name: 'cherry-pick', ok: true, detail: `${hash.slice(0, 7)} → ${current}` });

    if (flag(values, 'all')) {
      const commits = await listCommits(source, 200);
      steps.push({ name: '源分支', ok: true, detail: `${source} 共 ${commits.length} 个提交（--all 只作提示）` });
    }
    return okResult(`已把 ${hash.slice(0, 7)} cherry-pick 到 ${current}`, steps, { source, hash });
  },
  cliPreview: (v) =>
    `nx-nx git cherry-pick --source ${str(v, 'source') || '<分支>'} --commit ${str(v, 'commit') || '<hash>'}`,
};

/** 供其它操作复用的分支名清理（把空格换成连字符）。 */
export function sanitizeBranchSuffix(name: string): string {
  return name.trim().replace(/\s+/g, '-');
}

/** 多选字段的取值辅助（给交互层用）。 */
export function selectedFiles(values: Record<string, unknown>): string[] {
  return list(values as Record<string, string | string[]>, 'files');
}
