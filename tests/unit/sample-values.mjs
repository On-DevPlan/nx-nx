// 为模板的每个选项造一个「合法样例值」。跑模板库级别的长跑测试时需要它。
//
// 为什么要认真造，而不是一律填 'x'：选项可以声明 type / values / pattern 约束，
// 随手填的值会被 resolveVars 当场拒——那条测试本来只想验「占位符有没有写错」，
// 却因为造了个非法值而红，排查成本远高于这里多写几行。
//
// 规则与 core/templates.ts 的 resolveVars 对齐：letters 是 1~5 位小写字母、
// number 是数字、enum 取 values[0]、boolean 取 false、声明了 pattern 的必须能匹配。
const PATTERN_CANDIDATES = ['zz', 'ts', 'ab12', 'go', 'python3'];

export function sampleValue(opt) {
  if (opt.default !== undefined && opt.default !== null) return opt.default;
  const type = opt.type || 'string';
  if (type === 'number') return 8000;
  if (type === 'boolean') return false;
  if (type === 'letters') return 'zz';
  if (type === 'enum') return (opt.values && opt.values[0]) || 'x';
  if (opt.pattern) {
    const hit = PATTERN_CANDIDATES.find((c) => new RegExp(opt.pattern).test(c));
    if (!hit) {
      throw new Error(
        `选项 ${opt.name} 的 pattern ${opt.pattern} 连样例值都过不了；请放宽约束或补一个可用样例`,
      );
    }
    return hit;
  }
  return 'x';
}

export function sampleValues(meta) {
  const values = {};
  for (const opt of meta.options ?? []) values[opt.name] = sampleValue(opt);
  return values;
}