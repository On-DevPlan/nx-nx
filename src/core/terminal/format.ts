// 终端里的小格式化工具：字节数、计数这类「到处都要用一次」的东西。
//
// 单独成文件而不是塞进 width.ts：width.ts 关心的是**对齐**（显示宽度），
// 这里关心的是**内容怎么念给人听**，两码事。

/** 字节数 → 人读的体积（1.2 MB / 340 KB / 12 B）。 */
export function formatSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '-';
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i += 1;
  }
  return `${value.toFixed(value >= 100 ? 0 : 1)} ${units[i]}`;
}

/** 复数形式的计数（1 个文件 / 3 个文件）。 */
export function formatCount(n: number, unit: string): string {
  return `${n} ${unit}`;
}
