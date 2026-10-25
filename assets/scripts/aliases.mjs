// 内置全局函数（别名模块）——脚本里直接用裸名调用。
//
// 「解耦」的三条硬约束（改这个文件前先读完）：
//   1. 只依赖 node: 内置，绝不 import 任何 nx-nx 源码 → 整个目录可整体搬到别的项目；
//   2. 不认识 nx-nx 的任何概念（模板 / skill / 面板），只提供通用原语；
//   3. 业务脚本只许用「这些全局函数 + node: 内置」，不许再 import 内部模块——
//      于是脚本与项目之间只有这一份契约，改项目不会连带改脚本。
//
// 用法（脚本里）：
//   const files = await walk(dir, { filter: (rel) => rel.endsWith('.md') });
//   const r = run('git', ['status', '--porcelain']);
import * as fsLib from './lib/fs.mjs';
import * as shellLib from './lib/shell.mjs';
import * as sysLib from './lib/sys.mjs';
import * as outLib from './lib/out.mjs';

// 别名清单 = 文档 = 契约。名字必须与实现一一对应（installAliases 会当场校验）。
export const ALIASES = [
  { name: 'readText', group: '文件', desc: '读文本文件（utf8）' },
  { name: 'writeText', group: '文件', desc: '写文本文件（自动建父目录）' },
  { name: 'readJson', group: '文件', desc: '读 JSON 文件' },
  { name: 'writeJson', group: '文件', desc: '写 JSON 文件（默认缩进 2）' },
  { name: 'exists', group: '文件', desc: '路径是否存在' },
  { name: 'isDir', group: '文件', desc: '是否为目录' },
  { name: 'isFile', group: '文件', desc: '是否为文件' },
  { name: 'mkdirp', group: '文件', desc: '递归建目录' },
  { name: 'copyFile', group: '文件', desc: '复制单个文件' },
  { name: 'removePath', group: '文件', desc: '递归删除路径' },
  { name: 'copyTree', group: '文件', desc: '递归复制并覆盖（可排除若干名字）' },
  { name: 'listDir', group: '文件', desc: '列出目录下的名字' },
  { name: 'listEntries', group: '文件', desc: '列出目录项（名字 + 是否目录/文件）' },
  { name: 'walk', group: '文件', desc: '递归遍历，返回相对路径数组' },
  { name: 'findFiles', group: '文件', desc: '按正则找文件' },
  { name: 'run', group: '进程', desc: '执行命令（不走 shell），返回 { code, ok, stdout, stderr }' },
  { name: 'sh', group: '进程', desc: '用 shell 执行一行命令' },
  { name: 'which', group: '进程', desc: '在 PATH 里找可执行文件' },
  { name: 'homeDir', group: '系统', desc: '用户主目录' },
  { name: 'tmpDir', group: '系统', desc: '临时目录' },
  { name: 'cwd', group: '系统', desc: '当前工作目录' },
  { name: 'absPath', group: '系统', desc: '把路径解析成绝对路径' },
  { name: 'env', group: '系统', desc: '读环境变量（可给兜底值）' },
  { name: 'setEnv', group: '系统', desc: '写环境变量' },
  { name: 'sleep', group: '系统', desc: '等待若干毫秒' },
  { name: 'now', group: '系统', desc: '当前时间（ISO 字符串）' },
  { name: 'parseArgs', group: '系统', desc: '解析命令行参数 → { _, flags }' },
  { name: 'log', group: '输出', desc: '打印一行' },
  { name: 'ok', group: '输出', desc: '打印一行成功信息' },
  { name: 'warn', group: '输出', desc: '打印一行警告（stderr）' },
  { name: 'fail', group: '输出', desc: '打印一行错误（stderr）' },
  { name: 'heading', group: '输出', desc: '打印一个小节标题' },
  { name: 'table', group: '输出', desc: '打印一张对齐的表格' },
];

// 实现表：名字 → 函数。挂全局时只暴露这里的键。
const IMPL = {
  ...fsLib,
  ...shellLib,
  ...sysLib,
  ...outLib,
};

// 把别名挂到目标对象（默认 globalThis）。脚本在 ESM 里用裸名调用时，
// 标识符会沿作用域链落到 globalThis 上——所以「挂上去」就等于「能用」。
export function installAliases(target = globalThis) {
  const documented = ALIASES.map((a) => a.name);
  const implemented = Object.keys(IMPL);
  const missing = documented.filter((n) => typeof IMPL[n] !== 'function');
  const extra = implemented.filter((n) => !documented.includes(n));
  if (missing.length || extra.length) {
    const detail = [
      missing.length ? `清单里没有实现: ${missing.join(', ')}` : '',
      extra.length ? `实现了但清单里没有: ${extra.join(', ')}` : '',
    ]
      .filter(Boolean)
      .join('；');
    throw new Error(`别名清单与实现不一致 —— ${detail}`);
  }
  for (const name of documented) target[name] = IMPL[name];
  return target;
}
