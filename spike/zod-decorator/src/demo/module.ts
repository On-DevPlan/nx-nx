// spike：demo 模块 —— 用「注解（装饰器）+ zod schema」声明 action。
//
// 写法对照：
//   现有模型：defineAction({ id, cli, http, args, flags })( (ctx) => run(ctx) )
//   本 spike：@action({ id, cli, http, args, input, output })  decorate method
//
// 注意 handler 的入参类型是**手写引用**的 `z.input<typeof schema>`：
// 装饰器无法改方法签名（TC39 标准装饰器要求返回类型与原方法兼容），
// 所以「schema → ctx 类型」的自动推导在注解式下拿不到。这是本模型最实在的代价。
import { action } from '../action.js';
import { collectActions, type ModuleDef } from '../registry.js';
import {
  demoConfigInput,
  demoConfigOutput,
  demoEchoInput,
  demoEchoOutput,
  demoGreetInput,
  demoGreetOutput,
  demoItemInput,
  demoItemOutput,
  demoPingInput,
  demoPingOutput,
  demoStatsInput,
  demoStatsOutput,
} from './schemas.js';
import type { z } from 'zod';

export class DemoApi {
  /** 实例状态：注解式的卖点之一就是「类可以持有状态」——handler 的 this 是实例 */
  private greetCount = 0;

  @action({
    id: 'demo.greet',
    cli: ['greet'],
    http: ['POST', '/api/greet'],
    summary: '打个招呼',
    args: ['name'],
    input: demoGreetInput,
    output: demoGreetOutput,
  })
  greet(ctx: z.output<typeof demoGreetInput>) {
    this.greetCount += 1;
    const greeting = `你好，${ctx.name}${ctx.loud ? '！' : '。'}`;
    return { greeting, count: this.greetCount };
  }

  @action({
    id: 'demo.echo',
    cli: ['echo'],
    http: ['POST', '/api/echo'],
    summary: '回声（数字默认值 / 数组 / 枚举）',
    args: ['text'],
    input: demoEchoInput,
    output: demoEchoOutput,
  })
  echo(ctx: z.output<typeof demoEchoInput>) {
    const mode = ctx.mode ?? 'plain';
    const one = mode === 'upper' ? ctx.text.toUpperCase() : ctx.text;
    return { echoed: Array.from({ length: ctx.repeat }, () => one), mode };
  }

  @action({
    id: 'demo.config',
    cli: ['config', 'set'],
    http: ['PATCH', '/api/config'],
    summary: '改配置（可重复 kv flag / json / dry-run）',
    input: demoConfigInput,
    output: demoConfigOutput,
  })
  config(ctx: z.output<typeof demoConfigInput>) {
    const applied = { ...(ctx.set ?? {}) };
    if (ctx.payload !== undefined) applied.payload = JSON.stringify(ctx.payload);
    return { applied, dryRun: ctx['dry-run'] ?? false };
  }

  @action({
    id: 'demo.ping',
    cli: ['ping'],
    aliases: [['health']],
    http: ['GET', '/api/ping'],
    summary: '探活',
    input: demoPingInput,
    output: demoPingOutput,
  })
  ping() {
    return { pong: 'pong' };
  }

  @action({
    id: 'demo.stats',
    cli: ['stats'],
    http: ['GET', '/api/stats'],
    summary: '统计（query 里的数字也要归一化）',
    input: demoStatsInput,
    output: demoStatsOutput,
  })
  stats(ctx: z.output<typeof demoStatsInput>) {
    return { days: ctx.days, window: `${ctx.days}d` };
  }

  @action({
    id: 'demo.item',
    cli: ['item', 'get'],
    http: ['GET', '/api/items/:id'],
    summary: '按 id 取条目（路由参数即位置参数）',
    args: ['id'],
    input: demoItemInput,
    output: demoItemOutput,
  })
  item(ctx: z.output<typeof demoItemInput>) {
    return { id: ctx.id, name: `条目-${ctx.id}` };
  }
}

export const demoModule: ModuleDef = {
  id: 'demo',
  title: '演示',
  actions: collectActions('demo', DemoApi),
};
