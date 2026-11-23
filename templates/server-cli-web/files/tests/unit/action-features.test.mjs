// restArg（尾部收参）与 http 两态的装载/解析行为。
//
// restArg 目前没有业务使用方（与参考实现一致：能力 + 类型 + 解析链路就位，
// 使用方按需取用），所以这里用合成 action 直测解析通道——不为了测而塞业务。
import { test } from 'node:test';
import assert from 'node:assert/strict';

test('restArg：剩余位置参数整组收进数组字段', async () => {
  const { z } = await import('zod');
  const { describeInput } = await import('../../src/runtime/zod-bridge.ts');
  const { parseZodChannel } = await import('../../src/runtime/cli.ts');
  const { usageOf } = await import('../../src/runtime/spec.ts');

  const input = z.object({
    prefix: z.string().describe('前缀'),
    tags: z.array(z.string()).describe('标签（尾部收参）'),
  });
  const cmd = {
    id: 'test.tail',
    cli: ['tail'],
    http: null,
    fields: describeInput(input, ['prefix']),
    input,
    args: ['prefix'],
    restArg: 'tags',
  };
  const parsed = parseZodChannel(cmd, ['甲', 'x', 'y', 'z']);
  assert.deepEqual(parsed, { prefix: '甲', tags: ['x', 'y', 'z'] });

  // usage 尾部渲染 <tags...>
  assert.ok(usageOf(cmd).includes('<tags...>'), usageOf(cmd));

  // 没有 restArg 时多余位置参数仍是错误（不能静默吞掉）
  const noRest = { ...cmd, restArg: undefined };
  assert.throws(() => parseZodChannel(noRest, ['甲', 'x', 'y']), /多余的参数/);
});

test('http 两态：缺省即装载报错，显式 null 放行且不进路由', async () => {
  const { Registry } = await import('../../src/runtime/registry.ts');
  const { ApiRouter } = await import('../../src/runtime/api.ts');
  const { z } = await import('zod');
  const { describeInput } = await import('../../src/runtime/zod-bridge.ts');

  const mk = (http) => {
    const input = z.object({});
    return {
      id: 'x.do',
      cli: ['x', 'do'],
      http,
      fields: describeInput(input),
      input,
      run: () => ({}),
    };
  };
  const mod = (actions) => ({ id: 'm', title: 'm', actions });

  // 缺省（undefined）→ 启动即红：这是「忘了写」与「有意纯 CLI」的区分闸
  assert.throws(() => Registry.create([mod([mk(undefined)])]), /http 未声明/);
  // 显式 null → 合法纯 CLI
  const reg = Registry.create([mod([mk(null)])]);
  assert.equal(reg.actions.length, 1);
  // null 不进 HTTP 路由表
  const router = new ApiRouter(reg.actions);
  assert.equal((router).routes.length, 0);
});
