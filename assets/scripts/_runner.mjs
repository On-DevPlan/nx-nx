// 脚本解释器入口：先注入内置全局函数，再导入并执行目标脚本。
//
// 为什么是子进程而不是 vm：
//   - 脚本要能 import node: 内置（fs / path / child_process…），普通 vm 上下文不支持 ESM import；
//   - 子进程顺带隔离了全局副作用与崩溃，一个脚本炸了不会带走调用方。
//
// 约定：
//   node _runner.mjs <script.mjs> [args...]
//   脚本里读 process.argv.slice(2) 拿到的就是「脚本自己的参数」，不含 runner 的噪声。
//
// 共享函数面板（服务组）：
//   环境变量 NX_SHARED_PANEL 指向 <group>.shared.mjs 时，先装载面板（「常量 = 函数 = {}」
//   整体优先执行），再把面板挂到 globalThis 的新增键做「堆快照日志」——
//   只输出可 JSON 表示的数据确认；函数报签名，循环引用 / 原生句柄类对象只报类型，
//   不打印内部表示（无地址、无句柄细节）。
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { installAliases, ALIASES } from './aliases.mjs';

const [target, ...rest] = process.argv.slice(2);

if (!target) {
  console.error('用法: _runner.mjs <script.mjs> [args...]');
  process.exit(2);
}

// 全局函数先挂好：脚本被导入时就能用裸名调用它们。
const aliasNames = new Set(ALIASES.map((a) => a.name));
const beforeKeys = new Set(Object.keys(globalThis));
installAliases(globalThis);

// 共享函数面板：整体优先执行（服务组绑定，env 注入面板路径）。
const sharedPanel = process.env.NX_SHARED_PANEL;
if (sharedPanel) {
  await import(pathToFileURL(resolve(sharedPanel)).href);
  dumpSharedPanelSnapshot(aliasNames, beforeKeys);
}

// 让脚本看到的 argv 只有自己：argv[0]=node，argv[1]=脚本路径，之后是脚本参数。
process.argv = [process.argv[0], target, ...rest];

await import(pathToFileURL(resolve(target)).href);

// ---- 共享面板堆快照 ----
//
// 用户约定：共享面板里「常量 = 函数 = {}」，执行完成即产出数据（token、随机数组…）。
// 这里扫描 globalThis 的新增键，逐个给出「能被 JSON 表示」的确认输出：
//   - 可 JSON  → 打印预览（截断 240 字符）
//   - 函数     → 打印 [function name]
//   - 其余     → 只打印类型名（Map/Set/Buffer/循环引用对象…），不显示内部结构
function dumpSharedPanelSnapshot(aliasNames, beforeKeys) {
  const added = Object.keys(globalThis).filter(
    (k) => !beforeKeys.has(k) && !aliasNames.has(k),
  );
  console.log(`[shared] 共享面板已装载（${added.length} 个导出）：`);
  if (!added.length) {
    console.log('[shared] （面板没有挂任何全局导出——数据请挂到 globalThis 或用 export 声明）');
    return;
  }
  for (const k of added) {
    const v = globalThis[k];
    if (typeof v === 'function') {
      console.log(`  ${k}: [function ${v.name || 'anonymous'}]`);
      continue;
    }
    try {
      const s = JSON.stringify(v);
      const preview = s === undefined ? 'undefined' : s.length > 240 ? s.slice(0, 240) + '…(截断)' : s;
      console.log(`  ${k}: ${preview}`);
    } catch {
      console.log(`  ${k}: [${typeName(v)}]（非 JSON 可表示，内部细节已清理）`);
    }
  }
}

function typeName(v) {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  const c = v.constructor && v.constructor.name;
  return c || typeof v;
}
