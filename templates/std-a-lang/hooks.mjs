// 模板钩子：单次生成多个 a_<lang>/ 工作区。
//
// 为什么需要钩子：模板引擎的 generate.ts 是「files/ 全树走一遍 → 渲染 → 写盘」
// 的单趟渲染（src/core/generate.ts:70-123），没有「按列表重复整棵子树」的能力。
// 我们用最小入侵的方式补一段 engine 不擅长的事：
//
//   1. beforeGenerate：把「ts, go, py」拆成列表；单 lang 直接渲染，多 lang 时
//      把 vars.lang 设为字面「{{lang}}」让 engine 把目录名与文本占位都原样保留
//      （renderString 是单趟替换，不会再扫一遍结果，见 src/core/templates.ts:241）。
//
//   2. afterGenerate：把 engine 渲染好的 a_{{lang}}/ 当成 master，复制 N 份到
//      a_<lang>/，文本里的 {{lang}} 替换成实际语言名；最后删掉 master。
//
// 不自己从头写所有文件的原因：那要绕开 engine 的 isTextPath / 路径安全检查
// （src/core/generate.ts:97-119），越堆越多最终和 engine 分叉。只补一段不重复造轮子。

import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  readdirSync,
  statSync,
  copyFileSync,
  rmSync,
  existsSync,
} from 'node:fs';
import { join } from 'node:path';

const MASTER_DIR = 'a_{{lang}}'; // engine 渲染时占位目录名（vars.lang 设为字面 {{lang}}）

export default {
  // lang → langs[]；多 lang 时强制要求 --dir 指定一个空父目录，
  // 否则 engine 默认 targetDir = cwd/a_<firstLang>/，会把所有 a_<lang>/ 嵌进去。
  // 通过 ctx.dir 拿到 CLI --dir（service.ts 把 rawDir 注进 ctx）。
  beforeGenerate(vars, ctx) {
    const list = String(vars.lang ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (!list.length) throw new Error('lang 不能为空');

    if (list.length > 1 && !ctx?.dir) {
      throw new Error(
        '多语言模式必须用 --dir 指定一个空目录（将作为 a_<lang>/ 的父目录）。' +
          '单语言留空时默认在当前目录生成 a_<lang>/。',
      );
    }

    return {
      langs: list,
      // 单 lang：让 engine 直接渲染成 a_<lang>/，钩子不做事；
      // 多 lang：留字面 {{lang}}，让 afterGenerate 复制 N 份。
      lang: list.length === 1 ? list[0] : '{{lang}}',
      // service.ts 要求 vars.name 存在（service.ts:118），用它派生 targetDir：
      // 单 lang 默认 cwd/a_<lang>，多 lang 默认 cwd/a_<firstLang>/（父目录）。
      name: 'a_' + list[0],
    };
  },

  async afterGenerate(targetDir, vars) {
    const langs = vars.langs || [];
    if (langs.length <= 1) return null; // 单 lang：engine 已直接渲染好

    const master = join(targetDir, MASTER_DIR);
    if (!existsSync(master)) return null;

    const created = [];
    for (const lang of langs) {
      const dest = join(targetDir, `a_${lang}`);
      copyTree(master, dest, lang);
      created.push(`a_${lang}`);
    }
    // master 是占位目录，不属于任何真实语言；删掉避免污染输出。
    rmSync(master, { recursive: true, force: true });

    return { copied: created };
  },
};

// 递归复制 master 树到 dest；文本文件做 {{lang}} → lang 替换，二进制原样落盘。
// 二进制判定用「首字节 NUL」——比扩展名白名单更可靠（避免漏掉未来新增的图片格式）。
function copyTree(src, dest, lang) {
  mkdirSync(dest, { recursive: true });
  for (const name of readdirSync(src)) {
    const s = join(src, name);
    const d = join(dest, name);
    const st = statSync(s);
    if (st.isDirectory()) {
      copyTree(s, d, lang);
    } else {
      const buf = readFileSync(s);
      if (buf.length && buf[0] === 0) {
        copyFileSync(s, d);
      } else {
        const text = buf.toString('utf8').replace(/\{\{lang\}\}/g, lang);
        writeFileSync(d, text, 'utf8');
      }
    }
  }
}