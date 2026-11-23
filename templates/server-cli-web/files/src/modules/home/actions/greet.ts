// home.greet —— 演示业务动作：打个招呼，问候次数累计进本机存储。
//
// 「一条 action 一个文件」：声明（@action 元数据）、契约（zod schema）与实现同文件。
// 依赖经 IoC 容器取（this.deps.get('store')）——测试可换一整个容器，不必改构造参数。
//
// 每个字段都带 .describe()：help 的参数含义、cli-tree 的字段说明、未来的 MCP
// inputSchema 都从这一处描述派生——字段描述纪律是 MCP 通道的前置基础设施。
import { z } from 'zod';
import { action } from '../../../runtime/action-decorator.js';
import { ActionBase, type ActionInput } from '../../../runtime/action-base.js';

/** home.greet 的入参契约（CLI 与 HTTP 共用同一份）。 */
const input = z.object({
  name: z.string().min(1, '名字不能为空').describe('要问候的名字（位置参数）'),
  loud: z.boolean().optional().describe('大声问候（全大写）'),
});

export class GreetAction extends ActionBase<typeof input> {
  @action({
    id: 'home.greet',
    cli: ['greet'],
    http: ['POST', '/api/greet'],
    summary: '打个招呼（演示动作：问候次数累计进本机存储）',
    args: ['name'],
    input,
    render: (r) => r.greeting,
  })
  override async run(ctx: ActionInput<this['_input']>) {
    const store = this.deps.get('store');
    // 走 mutate 读-改-写事务：计数 +1 与落盘是一个原子动作，
    // 两个并发请求不会丢计数，函数抛错则半个事务不会写进磁盘。
    const t = await store.mutate((s) => {
      const count = Number(s.greetCount || 0) + 1;
      s.greetCount = count;
      return count;
    });
    const count = Number(t);

    let greeting = `你好，${ctx.name}！这是第 ${count} 次问候。`;
    if (ctx.loud === true) greeting = greeting.toUpperCase();
    return { greeting, name: ctx.name, count, at: new Date().toISOString() };
  }
}
