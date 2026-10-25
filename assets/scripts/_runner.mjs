// 脚本解释器入口：先注入内置全局函数，再导入并执行目标脚本。
//
// 为什么是子进程而不是 vm：
//   - 脚本要能 import node: 内置（fs / path / child_process…），普通 vm 上下文不支持 ESM import；
//   - 子进程顺带隔离了全局副作用与崩溃，一个脚本炸了不会带走调用方。
//
// 约定：
//   node _runner.mjs <script.mjs> [args...]
//   脚本里读 process.argv.slice(2) 拿到的就是「脚本自己的参数」，不含 runner 的噪声。
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { installAliases } from './aliases.mjs';

const [target, ...rest] = process.argv.slice(2);

if (!target) {
  console.error('用法: _runner.mjs <script.mjs> [args...]');
  process.exit(2);
}

// 全局函数先挂好：脚本被导入时就能用裸名调用它们。
installAliases(globalThis);

// 让脚本看到的 argv 只有自己：argv[0]=node，argv[1]=脚本路径，之后是脚本参数。
process.argv = [process.argv[0], target, ...rest];

await import(pathToFileURL(resolve(target)).href);
