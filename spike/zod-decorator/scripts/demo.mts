// spike 的手动演示：一条命令把整个模型跑一遍给人看。
//   node --import tsx spike/zod-decorator/scripts/demo.mts
import { buildRegistry } from '../src/registry.js';
import { demoModule } from '../src/demo/module.js';
import { runCli } from '../src/cli.js';
import { buildTree, renderHelp } from '../src/tree.js';

const actions = buildRegistry([demoModule]);

console.log('=== 1. 命令树（全部由 action 声明派生）===');
console.log(renderHelp(buildTree(actions), 'demo'));

console.log('\n=== 2. CLI 派发（同一份声明）===');
for (const argv of [
  ['greet', '世界'],
  ['greet', '世界', '--loud'],
  ['echo', 'hi', '--repeat', '3', '--mode', 'upper'],
  ['config', 'set', '--set', 'a=1', '--set', 'b=2'],
  ['stats', '--days', '14'],
  ['item', 'get', 'x1'],
]) {
  const r = await runCli(actions, argv, 'demo');
  const label = argv.join(' ');
  console.log(`  demo ${label}\n    → ${r.ok ? JSON.stringify(r.data) : '错误: ' + r.error}`);
}

console.log('\n=== 3. 非法输入被 zod 拦下 ===');
for (const argv of [['greet'], ['echo', 'hi', '--repeat', 'abc'], ['echo', 'hi', '--repeat']]) {
  const r = await runCli(actions, argv, 'demo');
  console.log(`  demo ${argv.join(' ')}\n    → ${r.ok ? JSON.stringify(r.data) : '错误: ' + r.error}`);
}
