// 交互式「搜索式多选」提示：自研 raw-mode 组件。
//
// 移植自参照实现 vercel-labs/skills 的 src/prompts/search-multiselect.ts
// （那一版是给 `skills add` 选 agent / 选 skill 用的）。之所以自己写而不用
// inquirer / prompts / enquirer：
//   - 需要「边打字边过滤 + 多选 + 分组折叠 + 详情面板」这一组合，现成库要么没有要么太重；
//   - 参照实现的观感已经被用户认可，直接沿用同一套符号语义（❯ 光标 / ● 选中 / ○ 未选）。
//
// 关键实现要点（都是踩过坑的）：
//   1. 按键用 node:readline 的 emitKeypressEvents 解析，不自己解 ANSI 序列；
//   2. 重绘要按**物理行**数回退光标（逻辑行会软换行占多行），否则屏幕上留残影；
//   3. 输入流 EOF（CI / 管道）要当「取消」处理，否则 promise 永远挂着、进程假装成功退出；
//   4. 退出时必须把 raw mode 还原，否则终端后续全是乱码。
import * as readline from 'node:readline';
import { Writable } from 'node:stream';
import {
  bold,
  cyan,
  dim,
  green,
  inverse,
  red,
  strikethrough,
  underline,
  yellow,
} from './color.js';
import { countVisualRowsForLines, formatDetailLines, truncateToWidth } from './width.js';

// 静音输出流：readline 拿到 TTY 会回显输入，这里不要它回显。
const silentOutput = new Writable({
  write(_chunk, _encoding, callback) {
    callback();
  },
});

export interface SearchItem<T> {
  value: T;
  label: string;
  hint?: string;
  /** 组标题：显示在该项之前，且可作为「整组勾选」的锚点 */
  group?: string;
  /** 高亮项的详情（固定面板展示） */
  detail?: string;
}

export interface LockedSection<T> {
  title: string;
  items: SearchItem<T>[];
  hiddenCount?: number;
}

export interface SearchMultiselectOptions<T> {
  message: string;
  items: SearchItem<T>[];
  maxVisible?: number;
  initialSelected?: T[];
  /** 必须至少选一项才能提交 */
  required?: boolean;
  /** 顶部锁定区：恒定选中、不可取消 */
  lockedSection?: LockedSection<T>;
  /** 是否渲染搜索框并接收文本输入，默认 true */
  searchable?: boolean;
  /** 是否为高亮项渲染固定高度的详情面板 */
  showDetail?: boolean;
  /** 详情面板预留行数，默认 2 */
  detailLines?: number;
  /** 是否展示已选项摘要，默认 true */
  showSelectedSummary?: boolean;
  /** 组标题是否可点（点了 toggle 整组） */
  selectGroups?: boolean;
  /** 是否显示独立的「全选」行 */
  selectAll?: boolean;
  /**
   * 是否多选，默认 true。
   *
   * 单选模式（multiple: false）：↑↓ 移动、**回车直接选中光标项**，
   * 空格用来展开/折叠分组。选单个东西时用多选组件是别扭的——
   * 用户按空格勾选再回车，跟「移动到那一项按回车」的肌肉记忆完全对不上。
   */
  multiple?: boolean;
}

export type SearchEntry<T> =
  | { type: 'item'; item: SearchItem<T> }
  | { type: 'group'; group: string; items: SearchItem<T>[]; collapsed: boolean };

const S_STEP_ACTIVE = green('◆');
const S_STEP_CANCEL = red('■');
const S_STEP_SUBMIT = green('◇');
const S_RADIO_ACTIVE = green('●');
const S_RADIO_INACTIVE = dim('○');
const S_BULLET = green('•');
const S_BAR = dim('│');
const S_BAR_H = dim('─');

/** 取消的返回值。用 Symbol 而不是 null：null 是合法选项值。 */
export const cancelSymbol = Symbol('cancel');

export function isCancelled(value: unknown): value is symbol {
  return typeof value === 'symbol';
}

/** 构造可导航的行：含可勾选的组标题。 */
export function buildSearchEntries<T>(
  items: SearchItem<T>[],
  selectGroups: boolean,
  collapsedGroups: ReadonlySet<string> = new Set()
): SearchEntry<T>[] {
  if (!selectGroups) return items.map((item) => ({ type: 'item' as const, item }));

  const entries: SearchEntry<T>[] = [];
  let index = 0;
  while (index < items.length) {
    const item = items[index]!;
    if (!item.group) {
      entries.push({ type: 'item', item });
      index += 1;
      continue;
    }
    const groupItems: SearchItem<T>[] = [];
    while (index < items.length && items[index]!.group === item.group) {
      groupItems.push(items[index]!);
      index += 1;
    }
    const collapsed = collapsedGroups.has(item.group);
    entries.push({ type: 'group', group: item.group, items: groupItems, collapsed });
    if (!collapsed) {
      entries.push(...groupItems.map((g) => ({ type: 'item' as const, item: g })));
    }
  }
  return entries;
}

/** 切换一项，或切换组标题代表的整组。 */
export function toggleSearchEntry<T>(selected: Set<T>, entry: SearchEntry<T> | undefined): void {
  if (entry?.type === 'group') {
    const allSelected = entry.items.every((item) => selected.has(item.value));
    for (const item of entry.items) {
      if (allSelected) selected.delete(item.value);
      else selected.add(item.value);
    }
  } else if (entry?.type === 'item') {
    if (selected.has(entry.item.value)) selected.delete(entry.item.value);
    else selected.add(entry.item.value);
  }
}

export type SelectAllState = 'none' | 'partial' | 'all';

export function getSelectAllState<T>(selected: ReadonlySet<T>, items: SearchItem<T>[]): SelectAllState {
  const selectedCount = items.filter((item) => selected.has(item.value)).length;
  if (selectedCount === 0) return 'none';
  if (selectedCount === items.length) return 'all';
  return 'partial';
}

/** 全选 / 全不选（已经全选时再按一次就全清）。 */
export function toggleAllItems<T>(selected: Set<T>, items: SearchItem<T>[]): void {
  const shouldClear = getSelectAllState(selected, items) === 'all';
  for (const item of items) {
    if (shouldClear) selected.delete(item.value);
    else selected.add(item.value);
  }
}

/**
 * 交互式搜索多选。
 * 返回选中的值；用户取消时返回 cancelSymbol。
 */
export async function searchMultiselect<T>(
  options: SearchMultiselectOptions<T>
): Promise<T[] | symbol> {
  const {
    message,
    items,
    maxVisible = 8,
    initialSelected = [],
    required = false,
    lockedSection,
    searchable = true,
    showDetail = false,
    detailLines = 2,
    showSelectedSummary = true,
    selectGroups = false,
    selectAll = false,
    multiple = true,
  } = options;

  return new Promise((resolve) => {
    // 记下 input 原来的流动状态：收尾时要还回去（见 cleanup 里的说明）。
    const inputWasPaused = process.stdin.isPaused() === true;

    const rl = readline.createInterface({
      input: process.stdin,
      output: silentOutput,
      terminal: false,
    });

    const isTTY = process.stdin.isTTY === true;
    if (isTTY) process.stdin.setRawMode(true);
    readline.emitKeypressEvents(process.stdin, rl);

    let query = '';
    let cursor = 0;
    const selected = new Set<T>(initialSelected);
    const collapsedGroups = new Set<string>();
    let lastRenderHeight = 0;
    const lockedValues = lockedSection ? lockedSection.items.map((i) => i.value) : [];

    const getFiltered = (): SearchItem<T>[] => {
      if (!query) return items;
      const lower = query.toLowerCase();
      return items.filter(
        (item) =>
          item.label.toLowerCase().includes(lower) || String(item.value).toLowerCase().includes(lower)
      );
    };

    const render = (state: 'active' | 'submit' | 'cancel' = 'active'): void => {
      const lines: string[] = [];
      const filtered = getFiltered();
      const entries = buildSearchEntries(filtered, selectGroups, collapsedGroups);
      const hasSelectAll = selectAll && items.length > 0;
      const entryCursor = cursor - (hasSelectAll ? 1 : 0);

      const icon =
        state === 'active' ? S_STEP_ACTIVE : state === 'cancel' ? S_STEP_CANCEL : S_STEP_SUBMIT;
      lines.push(`${icon}  ${bold(message)}`);

      if (state === 'active') {
        if (lockedSection && lockedSection.items.length > 0) {
          lines.push(`${S_BAR}`);
          const lockedTitle = `${bold(lockedSection.title)} ${dim('── 恒定包含')}`;
          lines.push(`${S_BAR}  ${S_BAR_H}${S_BAR_H} ${lockedTitle} ${S_BAR_H.repeat(12)}`);
          for (const item of lockedSection.items) {
            lines.push(`${S_BAR}    ${S_BULLET} ${bold(item.label)}`);
          }
          if (lockedSection.hiddenCount && lockedSection.hiddenCount > 0) {
            lines.push(`${S_BAR}    ${dim(`…另有 ${lockedSection.hiddenCount} 个`)}`);
          }
          lines.push(`${S_BAR}`);
          lines.push(
            `${S_BAR}  ${S_BAR_H}${S_BAR_H} ${bold('可选项')} ${S_BAR_H.repeat(29)}`
          );
        }

        if (searchable) {
          lines.push(`${S_BAR}  ${dim('搜索:')} ${query}${inverse(' ')}`);
          lines.push(
            `${S_BAR}  ${dim(
              multiple
                ? '↑↓ 移动 · 空格勾选 · ctrl+a 全选 · enter 确认'
                : '↑↓ 移动 · enter 选中 · esc 取消'
            )}`
          );
          lines.push(`${S_BAR}`);
        }

        if (hasSelectAll) {
          const selectedCount = items.filter((item) => selected.has(item.value)).length;
          const state2 = getSelectAllState(selected, items);
          const radio =
            state2 === 'all' ? S_RADIO_ACTIVE : state2 === 'partial' ? yellow('◐') : S_RADIO_INACTIVE;
          const isCursor = cursor === 0;
          const prefix = isCursor ? cyan('❯') : ' ';
          const label = isCursor ? underline(bold('全选')) : bold('全选');
          lines.push(`${S_BAR} ${prefix} ${radio} ${label} ${dim(`(${selectedCount}/${items.length})`)}`);
          lines.push(`${S_BAR}   ${S_BAR_H.repeat(36)}`);
        }

        const columns = process.stdout.columns && process.stdout.columns > 0 ? process.stdout.columns : 80;

        const buildFooterLines = (
          includeDetail: boolean,
          includeSelectedSummary: boolean
        ): string[] => {
          const footer: string[] = [];
          if (includeDetail) {
            const entry = entries[entryCursor];
            const detail =
              hasSelectAll && cursor === 0
                ? `勾选或清空全部 ${items.length} 项。`
                : entry?.type === 'group'
                  ? `勾选「${entry.group}」组的全部 ${entry.items.length} 项。`
                  : entry?.item.detail;
            const detailWidth = Math.max(1, columns - 5);
            footer.push(`${S_BAR}`);
            footer.push(`${S_BAR}  ${dim('说明')}`);
            for (const line of formatDetailLines(detail, detailWidth, detailLines)) {
              footer.push(`${S_BAR}  ${dim(line)}`);
            }
          }
          if (includeSelectedSummary) {
            footer.push(`${S_BAR}`);
            const allLabels = [
              ...(lockedSection ? lockedSection.items.map((i) => i.label) : []),
              ...items.filter((item) => selected.has(item.value)).map((item) => item.label),
            ];
            if (allLabels.length === 0) {
              footer.push(`${S_BAR}  ${dim('已选: (无)')}`);
            } else {
              const summary =
                allLabels.length <= 3
                  ? allLabels.join(', ')
                  : `${allLabels.slice(0, 3).join(', ')} +${allLabels.length - 3} 项`;
              footer.push(`${S_BAR}  ${green('已选:')} ${summary}`);
            }
          }
          if (!searchable) {
            footer.push(`${S_BAR}`);
            footer.push(`${S_BAR}  ${dim('↑↓ 移动 · ←→ 折叠/展开 · 空格勾选 · enter 确认')}`);
          }
          footer.push(`${dim('└')}`);
          return footer;
        };

        const buildItemLines = (visibleLimit: number): string[] => {
          if (filtered.length === 0) return [`${S_BAR}  ${dim('没有匹配项')}`];
          const itemLines: string[] = [];
          const visibleStart = Math.max(
            0,
            Math.min(entryCursor - Math.floor(visibleLimit / 2), entries.length - visibleLimit)
          );
          const visibleEnd = Math.min(entries.length, visibleStart + visibleLimit);
          const visibleEntries = entries.slice(visibleStart, visibleEnd);

          for (let i = 0; i < visibleEntries.length; i++) {
            const entry = visibleEntries[i]!;
            const actualIndex = visibleStart + i;
            const isCursor = actualIndex === entryCursor;

            if (entry.type === 'group') {
              if (!multiple) {
                // 单选模式：分组标题只是「展开/收起」的开关，不参与选择。
                const prefix = isCursor ? cyan('❯') : ' ';
                const disclosure = dim(entry.collapsed ? '▸' : '▾');
                itemLines.push(`${S_BAR} ${prefix} ${disclosure} ${bold(entry.group)}`);
                continue;
              }
              const count = entry.items.filter((item) => selected.has(item.value)).length;
              const radio = count === entry.items.length ? S_RADIO_ACTIVE : count > 0 ? yellow('◐') : S_RADIO_INACTIVE;
              const label = isCursor ? underline(bold(entry.group)) : bold(entry.group);
              const prefix = isCursor ? cyan('❯') : ' ';
              const disclosure = dim(entry.collapsed ? '▸' : '▾');
              itemLines.push(`${S_BAR} ${prefix} ${disclosure} ${radio} ${label}`);
              continue;
            }

            const item = entry.item;
            // 单选模式：光标项本身就是「选中」的那一项。
            const radio =
              multiple
                ? selected.has(item.value)
                  ? S_RADIO_ACTIVE
                  : S_RADIO_INACTIVE
                : isCursor
                  ? S_RADIO_ACTIVE
                  : S_RADIO_INACTIVE;
            const label = isCursor ? underline(item.label) : item.label;
            const hint = item.hint ? dim(` (${item.hint})`) : '';
            const prefix = isCursor ? cyan('❯') : ' ';
            const groupItems = selectGroups && item.group ? filtered.filter((i) => i.group === item.group) : [];
            const isLastInGroup = groupItems.at(-1) === item;
            const tree = groupItems.length > 0 ? `${dim(isLastInGroup ? '└─' : '├─')} ` : '';
            itemLines.push(`${S_BAR} ${prefix} ${tree}${radio} ${label}${hint}`);
          }

          const hiddenBefore = visibleStart;
          const hiddenAfter = entries.length - visibleEnd;
          if (hiddenBefore > 0 || hiddenAfter > 0) {
            const parts: string[] = [];
            if (hiddenBefore > 0) parts.push(`↑ 还有 ${hiddenBefore} 项`);
            if (hiddenAfter > 0) parts.push(`↓ 还有 ${hiddenAfter} 项`);
            itemLines.push(`${S_BAR}  ${dim(parts.join('  '))}`);
          }
          return itemLines;
        };

        const terminalRows = process.stdout.rows && process.stdout.rows > 0 ? process.stdout.rows : undefined;
        const maxFrameRows = terminalRows ? Math.max(1, terminalRows - 1) : undefined;

        const fitFrame = (
          includeDetail: boolean,
          includeSelectedSummary: boolean
        ): { itemLines: string[]; footerLines: string[]; frameRows: number } => {
          const footerLines = buildFooterLines(includeDetail, includeSelectedSummary);
          let visibleLimit = Math.max(1, maxVisible);
          let itemLines = buildItemLines(visibleLimit);
          let frameRows = countVisualRowsForLines([...lines, ...itemLines, ...footerLines], columns);
          while (maxFrameRows && frameRows > maxFrameRows && visibleLimit > 1) {
            visibleLimit -= 1;
            itemLines = buildItemLines(visibleLimit);
            frameRows = countVisualRowsForLines([...lines, ...itemLines, ...footerLines], columns);
          }
          return { itemLines, footerLines, frameRows };
        };

        let includeDetail = showDetail;
        let includeSelectedSummary = showSelectedSummary;
        let fitted = fitFrame(includeDetail, includeSelectedSummary);
        // 终端很矮时先舍弃上下文面板，保住控件与可选项；空间回来会自动恢复。
        if (maxFrameRows && fitted.frameRows > maxFrameRows && includeDetail) {
          includeDetail = false;
          fitted = fitFrame(includeDetail, includeSelectedSummary);
        }
        if (maxFrameRows && fitted.frameRows > maxFrameRows && includeSelectedSummary) {
          includeSelectedSummary = false;
          fitted = fitFrame(includeDetail, includeSelectedSummary);
        }
        lines.push(...fitted.itemLines, ...fitted.footerLines);
      } else if (state === 'submit') {
        const allLabels = [
          ...(lockedSection ? lockedSection.items.map((i) => i.label) : []),
          ...items.filter((item) => selected.has(item.value)).map((item) => item.label),
        ];
        lines.push(`${S_BAR}  ${dim(allLabels.join(', '))}`);
      } else if (state === 'cancel') {
        lines.push(`${S_BAR}  ${strikethrough(dim('已取消'))}`);
      }

      // 清除序列与新帧一起写：逐行清会让大提示在部分终端上闪。
      const clearPrevious = lastRenderHeight > 0 ? `\u001b[${lastRenderHeight}A\u001b[J` : '';
      process.stdout.write(clearPrevious + lines.join('\n') + '\n');
      lastRenderHeight = countVisualRowsForLines(lines, process.stdout.columns);
    };

    const cleanup = (): void => {
      rl.removeListener('close', closeHandler);
      process.stdin.removeListener('keypress', keypressHandler);
      if (isTTY) process.stdin.setRawMode(false);
      rl.close();
      // rl.close() 会把 input 暂停掉（readline 的 close 内部调 pause）。
      // 本提示之后往往还有别的提示接手（clack 的 text / confirm）——
      // input 停着，它们就再也收不到按键：用户看到提示框，敲键盘毫无反应。
      // 所以把原来的流动状态还回去。
      if (!inputWasPaused) process.stdin.resume();
    };

    let settled = false;

    const submit = (): void => {
      if (settled) return;
      if (required && selected.size === 0 && lockedValues.length === 0) return;
      settled = true;
      render('submit');
      cleanup();
      resolve([...lockedValues, ...Array.from(selected)]);
    };

    /** 单选模式：把光标那一项作为结果。 */
    const submitCursor = (): void => {
      if (settled) return;
      const entries = buildSearchEntries(getFiltered(), selectGroups, collapsedGroups);
      const offset = selectAll && items.length > 0 ? 1 : 0;
      const entry = entries[cursor - offset];
      if (!entry) return;
      if (entry.type === 'group') {
        // 光标在分组标题上：回车＝展开它（还没展开才展开），不是「选中整组」。
        if (entry.collapsed) {
          collapsedGroups.delete(entry.group);
          render();
          return;
        }
        // 已展开：把光标挪到组里的第一项，让「再按一次回车」就能选中它。
        const idx = entries.findIndex((e) => e.type === 'item');
        if (idx >= 0) {
          cursor = idx;
          render();
        }
        return;
      }
      settled = true;
      render('submit');
      cleanup();
      resolve([...lockedValues, entry.item.value]);
    };

    const cancel = (): void => {
      if (settled) return;
      settled = true;
      render('cancel');
      cleanup();
      resolve(cancelSymbol);
    };

    // 输入流 EOF 视为取消：否则 CI / 管道下 promise 永远挂着，进程以 0 退出假装成功。
    const closeHandler = (): void => {
      cancel();
    };

    /**
     * 单选模式：光标只落在可选项上（分组标题只是展开/收起的开关）。
     *
     * 这条规则必须处处守住——尤其「打字过滤后把光标弹回 0」那处：
     * 0 号位往往正是分组标题，光标停在那儿，回车等于什么都没发生。
     */
    const isPickable = (i: number, list: SearchEntry<T>[]): boolean => {
      const e = list[i];
      return Boolean(e && e.type === 'item');
    };

    /** 把光标落到第一个可选项上（单选模式用）。 */
    const resetCursor = (list: SearchEntry<T>[]): void => {
      if (multiple) {
        cursor = 0;
        return;
      }
      for (let i = 0; i < list.length; i++) {
        if (isPickable(i, list)) {
          cursor = i;
          return;
        }
      }
      cursor = 0;
    };

    const keypressHandler = (_str: string, key: readline.Key): void => {
      if (!key) return;
      const entries = buildSearchEntries(getFiltered(), selectGroups, collapsedGroups);
      const hasSelectAll = selectAll && items.length > 0;
      const cursorOffset = hasSelectAll ? 1 : 0;
      const entry = entries[cursor - cursorOffset];

      const move = (dir: number): void => {
        if (!entries.length) return;
        let i = cursor;
        for (let step = 0; step < entries.length; step++) {
          i += dir;
          if (i < 0) i = entries.length - 1;
          if (i >= entries.length) i = 0;
          if (!multiple || isPickable(i, entries)) {
            cursor = i;
            return;
          }
        }
      };

      if (key.name === 'return') {
        if (multiple) submit();
        else submitCursor();
        return;
      }
      if (key.name === 'escape' || (key.ctrl && key.name === 'c')) {
        cancel();
        return;
      }
      if (key.name === 'up') {
        move(-1);
        render();
        return;
      }
      if (key.name === 'down') {
        move(1);
        render();
        return;
      }
      if (selectGroups && key.name === 'right') {
        if (entry?.type === 'group' && entry.collapsed) {
          collapsedGroups.delete(entry.group);
          render();
        }
        return;
      }
      if (selectGroups && key.name === 'left') {
        const group = entry?.type === 'group' ? entry.group : entry?.item.group;
        if (group) {
          collapsedGroups.add(group);
          const collapsedEntries = buildSearchEntries(getFiltered(), selectGroups, collapsedGroups);
          cursor =
            collapsedEntries.findIndex(
              (e) => e.type === 'group' && e.group === group
            ) + cursorOffset;
          render();
        }
        return;
      }
      if (key.name === 'space') {
        if (!multiple) {
          // 单选模式：空格＝展开/折叠分组（与左右键同义）。
          if (entry?.type === 'group') {
            if (entry.collapsed) collapsedGroups.delete(entry.group);
            else collapsedGroups.add(entry.group);
            render();
          }
          return;
        }
        if (hasSelectAll && cursor === 0) toggleAllItems(selected, items);
        else toggleSearchEntry(selected, entry);
        render();
        return;
      }
      if (key.ctrl && key.name === 'a' && multiple) {
        const filtered = getFiltered();
        const allSelected = filtered.every((item) => selected.has(item.value));
        for (const item of filtered) {
          if (allSelected) selected.delete(item.value);
          else selected.add(item.value);
        }
        render();
        return;
      }
      if (key.name === 'backspace') {
        query = query.slice(0, -1);
        resetCursor(entries);
        render();
        return;
      }
      if (searchable && key.sequence && !key.ctrl && !key.meta && key.sequence.length === 1) {
        query += key.sequence;
        resetCursor(entries);
        render();
      }
    };

    process.stdin.on('keypress', keypressHandler);
    rl.on('close', closeHandler);

    // stdin 可能在本提示挂上之前就已 EOF（前面的 spinner 读过流）。
    if (process.stdin.readableEnded || process.stdin.destroyed) {
      cancel();
      return;
    }

    // 单选模式：初始光标落在第一个可选项上（分组标题不算）。
    if (!multiple) {
      const initial = buildSearchEntries(items, selectGroups, collapsedGroups);
      const first = initial.findIndex((e) => e.type === 'item');
      if (first >= 0) cursor = first;
    }

    render();
  });
}

export { truncateToWidth };
