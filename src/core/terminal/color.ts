// 终端颜色：唯一的「要不要输出转义序列」判定处。
//
// 判定规则对齐参照实现 vercel-labs/skills 的 src/color.ts（那一版是 picocolors
// 的包装，但去掉��� win32 一律开色」的捷径——那会把转义序列漏进 Windows 的管道）：
//
//   - NO_COLOR / --no-color  → 关
//   - FORCE_COLOR / --color / CI → 开
//   - 否则：stdout 是 TTY 且 TERM != dumb → 开
//
// 为什么自己写而不引 picocolors：
//   - 颜色只是装饰，出错信息不能因为颜色丢失而不可读；
//   - 少一个运行时依赖，随包分发更稳；
//   - 判定放在**调用时**而不是模块加载时：测试能在同一进程里切 NO_COLOR。
//
// 光标与行控制另算：它只在真终端上有意义，管道里必须关掉。

const env = process.env;
const argv = process.argv;

export function colorEnabled(): boolean {
  if (env.NO_COLOR || argv.includes('--no-color')) return false;
  if (env.FORCE_COLOR || argv.includes('--color') || env.CI) return true;
  return env.TERM !== 'dumb' && process.stdout.isTTY === true;
}

const sgr =
  (code: string) =>
  (text: string): string =>
    colorEnabled() ? `\u001b[${code}m${text}\u001b[0m` : text;

export const bold = sgr('1');
export const dim = sgr('2');
export const underline = sgr('4');
export const inverse = sgr('7');
export const strikethrough = sgr('9');
export const red = sgr('31');
export const green = sgr('32');
export const yellow = sgr('33');
export const magenta = sgr('35');
export const cyan = sgr('36');

/** 光标回到行首并清空该行；非 TTY 时是空串（管道里不该有控制字符）。 */
export const CLEAR_LINE = process.stdout.isTTY ? '\r\u001b[K' : '';
