// 冲突类操作：abort（中止进行中的操作）、resolve-conflicts（批量解决冲突）。
//
// 这里承载 gitlike 最核心的两条契约，迁移时**一字不改地保留**：
//
//   1. 有冲突时禁止自动中止——先把中止指南摆出来，让人读完再决定。
//      gitlike 连 --yes 都会拒绝；本实现对应的是 --force（明确表示「我读过了」）。
//   2. 混合冲突类型（UU + DD 同时存在）拒绝统一策略——不同类型的正确处理方式不一样，
//      一刀切会丢内容。此时只给文档，不动任何文件。
import { badInput } from '../../../core/errors/index.js';
import {
  addAll,
  cleanUntracked,
  discardChanges,
  hasUncommittedChanges,
  stashPop,
  stashPush,
  stashPushKeepIndex,
} from '../../../core/git/repo.js';
import { conflictedFiles, distinctConflictCodes, resolveFile } from '../../../core/git/conflicts.js';
import { abortOperation, inProgressState } from '../../../core/git/progress.js';
import { discardMergeState, restoreMergeState, saveMergeState } from '../../../core/git/merge-state.js';
import {
  blockedResult,
  conflictResult,
  flag,
  list,
  okResult,
  skippedResult,
  str,
  type FieldOption,
  type GitOperation,
  type OperationStep,
} from '../types.js';
import { abortGuide, conflictTypeDoc, multipleStatesDoc } from '../docs.js';

export const abortOperationSpec: GitOperation = {
  id: 'abort',
  title: '中止进行中的操作',
  desc: '检测 merge / rebase / cherry-pick / revert / am 并安全中止',
  scenario: 'merge / rebase 冲突了，想回到操作之前的状态',
  group: '冲突',
  risk: 'normal',
  fields: [
    {
      name: 'operation',
      label: '要中止的操作',
      kind: 'select',
      hint: '只有一个进行中的操作时自动选中',
      resolve: async (ctx) => {
        const ops = ctx.repo.inProgress.operations;
        return ops.length === 1 ? ops[0] : undefined;
      },
      options: async (ctx) =>
        ctx.repo.inProgress.operations.map<FieldOption>((op) => ({
          id: op,
          label: op,
          hint: '进行中',
        })),
    },
    {
      name: 'stash',
      label: '中止前先 stash 未提交的改动',
      kind: 'confirm',
      default: 'false',
      hint: '保护现场：中止后再 pop 回来',
    },
    {
      name: 'discard',
      label: '中止后丢弃未提交的改动',
      kind: 'confirm',
      default: 'false',
      hint: '与 stash 互斥',
    },
  ],
  guide: (values, repo) => {
    if (repo.conflicts.length === 0) return undefined;
    const op = str(values, 'operation') || repo.inProgress.operation;
    return abortGuide(op, repo.inProgress.target, repo.conflicts.map((c) => c.path));
  },
  run: async (values, repo) => {
    const steps: OperationStep[] = [];
    const state = await inProgressState();

    // 多个操作并存：罕见状态，不自动挑一个。
    if (state.operations.length > 1) {
      return blockedResult(
        `检测到多个进行中的 git 操作: ${state.operation}，需要手动处理`,
        steps,
        { guide: multipleStatesDoc(state.operation) }
      );
    }

    if (state.operation === 'none') {
      const dirty = await hasUncommittedChanges();
      if (!dirty) {
        return skippedResult('当前没有正在进行的 git 操作，工作区也是干净的', steps);
      }
      if (flag(values, 'discard')) {
        await discardChanges();
        await addAll();
        await cleanUntracked();
        steps.push({ name: '丢弃改动', ok: true, detail: '已丢弃全部未提交改动并清理未追踪文件' });
        return okResult('所有未提交的更改已丢弃', steps);
      }
      if (flag(values, 'stash')) {
        await stashPush('nx-nx git abort: stash before abort');
        steps.push({ name: 'stash', ok: true, detail: '未提交的改动已暂存到 stash' });
        return okResult('更改已暂存（当前没有需要中止的操作）', steps);
      }
      return blockedResult(
        '当前没有正在进行的 git 操作，但存在未提交的更改',
        steps,
        {
          guide: [
            '未提交的更改可以通过以下方式处理:',
            '  git stash          - 暂存更改',
            '  git checkout -- .  - 丢弃所有更改',
            '  git reset --hard   - 重置到最近一次 commit',
          ].join('\n'),
        }
      );
    }

    const operation = state.operations[0]!;

    // 事务安全：��冲突时不自动中止。--force 才是「我读过了」的明确表态。
    if (repo.conflicts.length > 0 && !flag(values, 'force')) {
      return conflictResult(
        '存在冲突，拒绝自动中止以保证事务安全（确认后可加 --force 重试）',
        steps,
        {
          guide: abortGuide(operation, state.target, repo.conflicts.map((c) => c.path)),
          conflicts: repo.conflicts,
        }
      );
    }

    let stashed = false;
    let backupDir = '';
    if (flag(values, 'stash')) {
      // stash 会清掉 index，而进行中操作的状态就在 index 里 —— 先备份再 stash。
      backupDir = await saveMergeState();
      try {
        await stashPushKeepIndex('nx-nx git abort: auto-stash before abort');
        stashed = true;
        await restoreMergeState(backupDir);
        steps.push({ name: 'stash 保护', ok: true, detail: '未提交的改动已 stash，合并状态已保留' });
      } catch (err) {
        steps.push({
          name: 'stash 保护',
          ok: false,
          detail: `stash 失败: ${err instanceof Error ? err.message : String(err)}`,
        });
      } finally {
        if (backupDir) discardMergeState(backupDir);
      }
    }

    await abortOperation(operation);
    steps.push({ name: `中止 ${operation}`, ok: true, detail: `已执行 ${operation} --abort` });

    if (flag(values, 'discard')) {
      await discardChanges();
      await addAll();
      await cleanUntracked();
      steps.push({ name: '丢弃改动', ok: true, detail: '已丢弃全部未提交改动' });
    }

    const after = await inProgressState();
    if (after.operation !== 'none') {
      steps.push({ name: '状态验证', ok: false, detail: `中止后仍检测到进行中的操作: ${after.operation}` });
      return blockedResult(`中止后仍检测到进行中的操作: ${after.operation}`, steps);
    }
    steps.push({ name: '状态验证', ok: true, detail: '无进行中的操作' });

    if (stashed) {
      try {
        await stashPop();
        steps.push({ name: '恢复 stash', ok: true, detail: 'stash 的改动已恢复' });
      } catch {
        steps.push({ name: '恢复 stash', ok: false, detail: '恢复失败，可手动执行 git stash pop' });
      }
    }

    return okResult(`${operation} 操作已成功中止`, steps, { operation });
  },
  cliPreview: (v) => {
    const parts = [`nx-nx git abort`];
    const op = str(v, 'operation');
    if (op) parts.push(`--operation ${op}`);
    if (flag(v, 'stash')) parts.push('--stash');
    if (flag(v, 'discard')) parts.push('--discard');
    return parts.join(' ');
  },
};

export const resolveConflictsOperation: GitOperation = {
  id: 'resolve-conflicts',
  title: '批量解决冲突',
  desc: '按 ours / theirs 策略批量 checkout + add 冲突文件',
  scenario: '冲突文件不多，想批量选一边（ours / theirs）',
  group: '冲突',
  risk: 'normal',
  fields: [
    {
      name: 'files',
      label: '要解决的文件',
      kind: 'multi',
      hint: '空格勾选；不勾选则需要 --all',
      options: async (ctx) =>
        ctx.repo.conflicts.map<FieldOption>((c) => ({
          id: c.path,
          label: `[${c.status}] ${c.path}`,
          detail: c.description,
        })),
    },
    {
      name: 'strategy',
      label: '解决策略',
      kind: 'select',
      required: true,
      hint: 'ours = 保留当前分支版本；theirs = 保留传入分支版本',
      resolve: () => 'ours',
      options: () => [
        { id: 'ours', label: 'ours', detail: '保留当前分支的版本' },
        { id: 'theirs', label: 'theirs', detail: '保留被合并分支的版本' },
      ],
    },
  ],
  run: async (values) => {
    const steps: OperationStep[] = [];
    const conflicts = await conflictedFiles();
    if (conflicts.length === 0) {
      return skippedResult('未检测到冲突文件', steps);
    }

    // 混合冲突类型：不同类型的正确处理方式可能不同，一刀切会丢内容。
    const codes = distinctConflictCodes(conflicts);
    if (codes.length > 1) {
      return conflictResult(
        `检测到 ${codes.length} 种冲突类型混合，拒绝统一策略`,
        steps,
        { guide: conflictTypeDoc(), codes, conflicts }
      );
    }

    const strategy = str(values, 'strategy');
    if (strategy !== 'ours' && strategy !== 'theirs') {
      throw badInput('--strategy 只能是 ours 或 theirs');
    }

    const wanted = list(values, 'files');
    const all = flag(values, 'all');
    if (!all && wanted.length === 0) {
      throw badInput('请用 --files 指定冲突文件，或用 --all 一次解决全部');
    }

    const known = new Map(conflicts.map((c) => [c.path, c]));
    const targets = all ? conflicts.map((c) => c.path) : wanted;
    for (const path of targets) {
      if (!known.has(path)) {
        throw badInput(`文件 ${path} 不在当前冲突列表中，未进行任何修改`);
      }
    }

    for (const path of targets) {
      await resolveFile(path, strategy);
      steps.push({ name: path, ok: true, detail: `已应用 ${strategy} 并暂存` });
    }

    const after = await conflictedFiles();
    const still = after.filter((c) => targets.includes(c.path));
    if (still.length > 0) {
      steps.push({ name: '验证', ok: false, detail: `仍有 ${still.length} 个文件处于冲突状态` });
      return conflictResult(`已解决 ${targets.length} 个文件，仍有 ${still.length} 个处于冲突状态`, steps, {
        stillConflicted: still,
      });
    }
    steps.push({ name: '验证', ok: true, detail: '所有选定文件已成功解决' });
    const untouched = after.length;
    return okResult(
      `冲突解决完成：已解决 ${targets.length} 个文件${untouched > 0 ? `，另有 ${untouched} 个未选中的冲突文件保持原状` : ''}`,
      steps,
      { strategy, resolved: targets }
    );
  },
  cliPreview: (v) => {
    const parts = ['nx-nx git resolve-conflicts'];
    const files = list(v, 'files');
    if (files.length) parts.push(`--files ${files.join(',')}`);
    if (flag(v, 'all')) parts.push('--all');
    parts.push(`--strategy ${str(v, 'strategy') || 'ours'}`);
    return parts.join(' ');
  },
};
