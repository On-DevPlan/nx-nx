// 模板钩子：把 lang 拆成列表，交给引擎的「列表变量」展开能力去铺 a_<lang>/ 们。
//
// 这个模板的模板树是 files/a_{{lang}}/{doc,sdk,proj,res}——{{lang}} 是**列表变量**
//（见 core/generate.ts 的 listVarExpansions）：传入 ['ts','go'] 时引擎自动复制整棵子树
// 为 a_ts/ 与 a_go/，文本里的 {{lang}} 用各副本对应的标量值替换。
//
// 因此这里**不再需要** v0.6.x 那种「母版-复制」的工作 around（beforeGenerate 留
// '{{lang}}' 字面、afterGenerate 把母版复制 N 份再清理）——引擎原生就懂。
//   - beforeGenerate：拆列表、强制要求 --dir（siblings 不留容身之处）
//   - afterGenerate：不做事（引擎已经把多份子树铺好）
//
// 「单 lang 也要求 --dir」是有意为之：siblings 模板的语义是「输出目录是 a_<lang>/
// 们的父目录」，无论单还是多都适用；面板、CLI 在 outputMode=siblings 下走同一条分支。
//
// 不自己再实现一遍展开的原因：那是引擎再写一遍引擎——路径安全检查、文本/二进制分流、
// 生成前后的目录可见性等等都已经在 core 里，绕过它们迟早分叉。

export default {
  // 把 lang 拆成列表后 vars.lang 改为列表——引擎（core/generate.ts 的 listVarExpansions）
  // 看到 a_{{lang}}/ 子树就按列表元素铺 N 份；文本里的 {{lang}} 用各副本的标量值替换。
  beforeGenerate(vars, ctx) {
    const list = String(vars.lang ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (!list.length) throw new Error('lang 不能为空');

    if (!ctx?.dir) {
      throw new Error(
        'std-a-lang 必须用 --dir 指定一个空目录（作为 a_<lang>/ 们的父目录）——' +
          '单 lang 与多 lang 都要求；面板填写「输出目录」即可。',
      );
    }

    return { langs: list, lang: list };
  },
};