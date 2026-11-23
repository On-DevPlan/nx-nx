// 交互式提示的薄封装。
//
// 分工与参照实现 vercel-labs/skills 一致：
//   - 标准问答（intro / note / confirm / text / select / spinner / outro）交给 @clack/prompts；
//   - 「搜索式多选」这种非平凡组件自研（见 search-multiselect.ts）。
//
// 本文件只做三件事：
//   1. 统一导出，避免业务代码到处 import * as p；
//   2. 暴露 isInteractive()：**非 TTY 一律不许抢终端**（管道 / CI / --json）；
//   3. 统一「取消」的语义：clack 用 isCancel() 判定，业务层只认这一个信号。

import * as clack from '@clack/prompts';

export const intro = clack.intro;
export const outro = clack.outro;
export const note = clack.note;
export const cancel = clack.cancel;
export const isCancel = clack.isCancel;
export const log = clack.log;
export const spinner = clack.spinner;
export const select = clack.select;
export const multiselect = clack.multiselect;
export const confirm = clack.confirm;

/**
 * 校验时该拿哪个值：空输入（undefined 或空串）按默认值算。
 *
 * 抽成纯函数是为了能单测——clack 的 text 只有真 TTY 下才跑得起来，
 * 而这条规则本身不需要终端。
 */
export function valueForValidation(value: string | undefined, def: unknown): string {
  return value === undefined || value === '' ? String(def) : value;
}

/**
 * text：**让默认值参与校验**。
 *
 * clack 的内部顺序是「先 validate，再 finalize」，而 defaultValue 是在 finalize
 * 里才补上的——用户直接敲回车（= 采用默认值）时，validate 拿到的是**空串**。
 * 于是「有默认值 + 有校验规则」的字段会莫名其妙地报「不能为空」
 * （实测：正则字段默认 `\.(docx|mp4|exe)$`，回车直接被判为空）。
 *
 * 这里把默认值提前喂给 validate，语义才对：回车 = 采用默认值。
 */
export const text = (
  opts: Parameters<typeof clack.text>[0]
): ReturnType<typeof clack.text> => {
  const def = opts?.defaultValue;
  const raw = opts?.validate;
  // validate 可能是标准 schema 对象（不可调用）——那就不包装，原样交给 clack。
  if (typeof raw !== 'function' || def === undefined) return clack.text(opts);
  return clack.text({
    ...opts,
    // 注意：clack 在校验时给的是 undefined（不是空串）——两种都要当成「采用默认值」。
    validate: (value: string | undefined) => raw(valueForValidation(value, def)),
  });
};

/**
 * 真终端吗？
 *
 * 这是「能不能问人」的唯一判据：stdin 与 stdout 都得是 TTY。
 * 少一个就说明输入不是人在敲（管道、CI、--json 重定向），
 * 此时任何交互式提问都会挂住或拿到垃圾输入。
 */
export function isInteractive(): boolean {
  return process.stdin.isTTY === true && process.stdout.isTTY === true;
}
