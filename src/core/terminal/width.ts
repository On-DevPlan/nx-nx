// 终端宽度计算：中文/全角字符按 2 列算，emoji 按 2 列算。
//
// 算法照搬参照实现 vercel-labs/skills 的 src/prompts/search-multiselect.ts
// （approxStringWidth / visualRowsForLine / countVisualRowsForLines），
// 因为那套已经踩过「按字符数截断导致中文表格歪」的坑。
//
// 为什么宽度计算要和渲染放在一起：重绘时要知道上一次画了几**物理行**才能擦干净，
// 而逻辑行会因为软换行占多行——用 lines.length 会清不干净，屏幕上会留残影。
import { stripVTControlCharacters } from 'node:util';

/** 近似终端显示宽度（单元格数）。不含 ANSI 序列。 */
export function approxStringWidth(plain: string): number {
  let width = 0;
  for (const ch of plain) {
    const code = ch.codePointAt(0)!;
    if (code === 0) continue;
    const wide =
      (code >= 0x1100 && code <= 0x115f) ||
      (code >= 0x231a && code <= 0x231b) ||
      (code >= 0x2329 && code <= 0x232a) ||
      (code >= 0x23e9 && code <= 0x23ec) ||
      code === 0x23f0 ||
      code === 0x23f3 ||
      (code >= 0x25fd && code <= 0x25fe) ||
      (code >= 0x2614 && code <= 0x2615) ||
      (code >= 0x2648 && code <= 0x2653) ||
      code === 0x267f ||
      code === 0x2693 ||
      code === 0x26a1 ||
      code === 0x26aa ||
      code === 0x26bd ||
      code === 0x26c4 ||
      code === 0x26c5 ||
      code === 0x26ce ||
      code === 0x26d4 ||
      code === 0x26ea ||
      code === 0x26f2 ||
      code === 0x26f3 ||
      code === 0x26f5 ||
      code === 0x26fa ||
      code === 0x26fd ||
      code === 0x2705 ||
      (code >= 0x270a && code <= 0x270b) ||
      code === 0x2728 ||
      code === 0x274c ||
      code === 0x274e ||
      (code >= 0x2753 && code <= 0x2755) ||
      code === 0x2757 ||
      (code >= 0x2795 && code <= 0x2797) ||
      code === 0x27b0 ||
      code === 0x27bf ||
      (code >= 0x2b1b && code <= 0x2b1c) ||
      code === 0x2b50 ||
      code === 0x2b55 ||
      (code >= 0x2e80 && code <= 0xa4cf && code !== 0x303f) ||
      (code >= 0xa960 && code <= 0xa97c) ||
      (code >= 0xac00 && code <= 0xd7a3) ||
      (code >= 0xf900 && code <= 0xfaff) ||
      (code >= 0xfe10 && code <= 0xfe19) ||
      (code >= 0xfe30 && code <= 0xfe6f) ||
      (code >= 0xff00 && code <= 0xff60) ||
      (code >= 0xffe0 && code <= 0xffe6) ||
      (code >= 0x1f000 && code <= 0x1f9ff);
    width += wide ? 2 : 1;
  }
  return width;
}

/** 一条逻辑行在给定列宽下占几个物理行（软换行后的行数）。 */
export function visualRowsForLine(line: string, columns: number): number {
  const plain = stripVTControlCharacters(line);
  const cols = Math.max(1, columns);
  return Math.max(1, Math.ceil(approxStringWidth(plain) / cols));
}

/** 一批逻辑行总共占几个物理行——重绘擦屏时要用。 */
export function countVisualRowsForLines(lines: string[], columns: number | undefined): number {
  const cols =
    columns !== undefined && columns > 0
      ? columns
      : process.stdout.columns && process.stdout.columns > 0
        ? process.stdout.columns
        : 80;
  return lines.reduce((sum, line) => sum + visualRowsForLine(line, cols), 0);
}

/** 按显示宽度截断（不是按字符数）——中文表格歪掉的根因就是按字符数截。 */
export function truncateToWidth(text: string, width: number): string {
  let truncated = '';
  for (const char of text) {
    if (approxStringWidth(truncated + char) > width) break;
    truncated += char;
  }
  return truncated;
}

/**
 * 把说明文字折成固定行数。
 * 不足时补空行——高亮项一变，提示框的高度不能跟着变，否则重绘会抖。
 */
export function formatDetailLines(
  detail: string | undefined,
  width: number,
  maxLines: number
): string[] {
  const safeWidth = Math.max(1, width);
  const normalized = detail?.replace(/\s+/g, ' ').trim() ?? '';
  const lines: string[] = [];
  let remaining = normalized;

  while (remaining && lines.length < maxLines) {
    if (approxStringWidth(remaining) <= safeWidth) {
      lines.push(remaining);
      remaining = '';
      break;
    }
    const candidate = truncateToWidth(remaining, safeWidth);
    const breakAt = candidate.lastIndexOf(' ');
    if (breakAt > 0) {
      lines.push(candidate.slice(0, breakAt).trimEnd());
      remaining = remaining.slice(breakAt).trimStart();
    } else {
      lines.push(candidate);
      remaining = remaining.slice(candidate.length).trimStart();
    }
  }

  if (remaining && lines.length > 0) {
    const last = lines.length - 1;
    lines[last] = `${truncateToWidth(lines[last]!, Math.max(0, safeWidth - 1)).trimEnd()}…`;
  }
  while (lines.length < maxLines) lines.push('');
  return lines;
}
