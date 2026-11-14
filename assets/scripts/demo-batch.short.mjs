// 短脚本示例：在沙箱里跑的一次性计算（无 fs、无网络、无 process）。
//
// 运行：
//   nx-nx js sandbox demo-batch --panel demo.shared
//   nx-nx js sandbox demo-batch --panel demo.shared --args '[5]'
//
// 沙箱里能用什么：log / args / set / heap / panel / use(name) / call(name, ...args)
// 产出放在变量堆里（set），运行结束以 JSON 返回——面板与接口都读同一份。

const n = Number(args[0] || 3);
log('可用面板: ' + Object.keys(panels).join(', '));
log('面板数据键: ' + Object.keys(panel).join(', '));

// call() 调共享面板里的同步函数（async 函数请改用 Node 运行：script run）
const made = call('makeUsers', n);
if (!Array.isArray(made)) throw new Error('makeUsers 没有返回数组');

// 按 tag 计数——这就是这次执行要产出的东西
const byTag = {};
for (const u of made) byTag[u.tag] = (byTag[u.tag] || 0) + 1;

set('count', made.length);
set('byTag', byTag);
set('first', made[0]);
set('token', panel.API_TOKEN);

// 故意放一个不可 JSON 表示的对象：验证堆快照的「清理」——只报类型，不泄露内部结构
set('cache', new Map([['session', 'should-not-leak']]));

log('完成：' + made.length + ' 条用户，' + Object.keys(byTag).length + ' 个 tag');
