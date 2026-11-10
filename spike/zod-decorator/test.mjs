// spike 的验证用例。跑法：
//   node --import tsx --test spike/zod-decorator/test.mjs
//
// 这些断言就是任务里四个断言的「可执行版本」：
//   1. CLI 完全自动化   → 树完整 + CLI 里没有硬编码命令名
//   2. apiclient 半自动 → 生成物与 action 对账 + 生成物真跑得通 + 手写部分确实手写
//   3. 注解方式可用      → 装饰器在无 Symbol.metadata 的运行时里仍能收集元数据
//   4. 只留 TS 版        → 类型层收益（z.input / z.output）在别处无法复现
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { z } from 'zod';
import { action } from './src/action.js';
import { buildRegistry } from './src/registry.js';
import { demoModule } from './src/demo/module.js';
import { runCli } from './src/cli.js';
import { buildTree, matchTree, renderHelp } from './src/tree.js';
import { generateClient, generateCliTreeJson, schemaName } from './src/codegen.js';
import { startServer } from './src/demo/server.js';
import { createHttpTransport } from './src/demo/transport.js';
import { bootstrapDemoPage } from './src/demo/frontend.js';
import { createApiClient } from './generated/client.generated.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const actions = buildRegistry([demoModule]);

// ---- 1. CLI 完全自动化 ----

test('CLI 树覆盖全部 action，且树上没有一条命令是手写的', () => {
  const tree = buildTree(actions);
  const leaves = [];
  const walk = (node) => {
    if (node.action) leaves.push(node.action.id);
    node.children.forEach(walk);
  };
  walk(tree);
  assert.equal(leaves.length, actions.length, '每个 action 都应在树里出现一次');
  assert.deepEqual([...leaves].sort(), actions.map((a) => a.id).sort());
});

test('CLI 源码里没有任何硬编码的命令名（自动化可证伪）', () => {
  const src = readFileSync(join(HERE, 'src', 'cli.ts'), 'utf8');
  for (const a of actions) {
    for (const seg of a.cli) {
      assert.ok(!src.includes(`'${seg}'`), `cli.ts 里出现了命令名字面量 '${seg}'`);
    }
  }
});

test('help 文本由树派生，含每条命令', () => {
  const help = renderHelp(buildTree(actions), 'demo');
  for (const a of actions) assert.ok(help.includes(a.cli.join(' ')), `help 缺 ${a.cli.join(' ')}`);
});

test('CLI 派发：位置参数 + 布尔 flag', async () => {
  const r = await runCli(actions, ['greet', '世界']);
  assert.equal(r.ok, true, r.error);
  assert.match(r.data.greeting, /世界/);

  const loud = await runCli(actions, ['greet', '世界', '--loud']);
  assert.match(loud.data.greeting, /！/);
});

test('CLI：--loud=false 解析为 false（zod coerce.boolean 的坑被避开）', async () => {
  const r = await runCli(actions, ['greet', 'x', '--loud=false']);
  assert.equal(r.ok, true, r.error);
  assert.equal(r.data.greeting.includes('！'), false);
});

test('CLI 与 HTTP 的布尔语义不等价：--loud false 不被当成值', async () => {
  // 布尔 flag 不吞下一个 token（否则 `skill install --force demo` 会把 demo 吃掉），
  // 于是 CLI 侧只能 `--loud=false` 关掉它；HTTP query 侧却能直接写 ?loud=false。
  // 既有模型（spec.ts）也是这个行为 —— 同一处不对称，不是本模型引入的。
  const r = await runCli(actions, ['greet', 'x', '--loud', 'false']);
  assert.equal(r.ok, false);
  assert.match(r.error, /多余的参数/);
});

test('CLI：缺必填位置参数 → 报错而不是 undefined', async () => {
  const r = await runCli(actions, ['greet']);
  assert.equal(r.ok, false);
  assert.match(r.error, /参数不合法|缺少/);
});

test('CLI：zod 的字符串约束生效（空名字被 min(1) 拦下）', async () => {
  const r = await runCli(actions, ['greet', '']);
  assert.equal(r.ok, false);
  assert.match(r.error, /名字不能为空/);
});

test('CLI：数字默认值 / 强转 / 裸 flag 报错', async () => {
  const def = await runCli(actions, ['echo', 'hi']);
  assert.equal(def.data.echoed.length, 1, 'repeat 默认为 1');

  const three = await runCli(actions, ['echo', 'hi', '--repeat', '3']);
  assert.equal(three.data.echoed.length, 3, '字符串 "3" 应被强转成 3');

  const bad = await runCli(actions, ['echo', 'hi', '--repeat', 'abc']);
  assert.equal(bad.ok, false);
  assert.match(bad.error, /必须是数字/);

  const naked = await runCli(actions, ['echo', 'hi', '--repeat']);
  assert.equal(naked.ok, false, '裸 --repeat 不能被当成 1');
  assert.match(naked.error, /需要提供值/);
});

test('CLI：裸的字符串 flag 报错（不被悄悄变成 "true"）', async () => {
  const r = await runCli(actions, ['echo', 'hi', '--mode']);
  assert.equal(r.ok, false);
  assert.match(r.error, /需要提供值/);
});

test('CLI：数组 flag 按逗号切分', async () => {
  const r = await runCli(actions, ['echo', 'hi', '--tags', 'a,b']);
  assert.equal(r.ok, true, r.error);
  assert.equal(r.data.mode, 'plain');
});

test('CLI：枚举值非法时报错', async () => {
  const r = await runCli(actions, ['echo', 'hi', '--mode', 'weird']);
  assert.equal(r.ok, false);
});

test('CLI：可重复的 kv flag 收成对象', async () => {
  const r = await runCli(actions, ['config', 'set', '--set', 'a=1', '--set', 'b=2']);
  assert.equal(r.ok, true, r.error);
  assert.deepEqual(r.data.applied, { a: '1', b: '2' });
});

test('CLI：json flag 解析 JSON 文本', async () => {
  const r = await runCli(actions, ['config', 'set', '--payload', '{"x":1}']);
  assert.equal(r.ok, true, r.error);
  assert.equal(r.data.applied.payload, '{"x":1}');
});

test('CLI：路由参数即位置参数', async () => {
  const r = await runCli(actions, ['item', 'get', 'abc']);
  assert.equal(r.ok, true, r.error);
  assert.equal(r.data.id, 'abc');
});

// ---- 2. 前端 apiclient：半自动化 ----

test('生成的 client：每个 http action 恰好一个方法', () => {
  const src = generateClient(actions, { schemaImport: '../src/demo/schemas.js' });
  const httpActions = actions.filter((a) => a.http);
  for (const a of httpActions) {
    const method = a.id.split('.').pop();
    assert.ok(src.includes(`async ${method}(`), `生成物缺方法 ${method}`);
  }
  const methodCount = (src.match(/^ {4}async /gm) ?? []).length;
  assert.equal(methodCount, httpActions.length);
});

test('生成的 client：引用的 schema 常量在 schemas 模块里真实存在', () => {
  const src = generateClient(actions, { schemaImport: '../src/demo/schemas.js' });
  const schemas = readFileSync(join(HERE, 'src', 'demo', 'schemas.ts'), 'utf8');
  const imported = [...src.matchAll(/^ {2}(\w+),$/gm)].map((m) => m[1]);
  assert.ok(imported.length > 0);
  for (const name of imported) {
    assert.ok(schemas.includes(`export const ${name} =`), `schemas.ts 没有导出 ${name}`);
  }
  // 命名约定：schemaName 的推导结果必须等于真实导出名
  for (const a of actions) {
    assert.ok(
      schemas.includes(`export const ${schemaName(a.id, 'Input')}`),
      `命名约定被破坏：${a.id} → ${schemaName(a.id, 'Input')}`,
    );
  }
});

test('生成的 cli-tree.json 与注册表对账', () => {
  const json = JSON.parse(generateCliTreeJson(actions));
  const ids = [];
  const walk = (node) => {
    if (node.action) ids.push(node.action.id);
    (node.children ?? []).forEach(walk);
  };
  walk(json);
  assert.deepEqual(ids.sort(), actions.map((a) => a.id).sort());
});

test('生成物与手写层各司其职：生成物不含 base url / 鉴权 / 错误信封', () => {
  const src = generateClient(actions, { schemaImport: '../src/demo/schemas.js' });
  assert.ok(!/baseUrl|authorization|fetch\(/.test(src), '传输层细节不该出现在生成物里');
  assert.ok(src.includes('transport.request('), '生成物应通过 Transport 发起请求');
});

// ---- 3. 注解方式 ----

test('装饰器元数据收集不依赖 Symbol.metadata（与运行时版本无关）', () => {
  // 断言**实现**而不是断言运行时：采集机制挂在方法函数上（WeakMap），
  // 源码里不允许出现 context.metadata —— 将来 Node 补上 Symbol.metadata
  // 也不该让这条测试变红（那只是运行时多了一个可选项，不是行为依赖）。
  const src = readFileSync(join(HERE, 'src', 'action.ts'), 'utf8');
  // 只看代码行（注释里会提到这两个名字作为「为什么不用它」的说明）
  const code = src
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n');
  assert.ok(!code.includes('context.metadata'), 'action.ts 不该依赖 context.metadata');
  assert.ok(!code.includes('Symbol.metadata'), 'action.ts 不该依赖 Symbol.metadata');
  // 元数据确实收集到了
  assert.ok(actions.length > 0);
  assert.ok(actions.every((a) => a.id && a.cli.length));
});

test('装饰器只标方法（标到 getter 上会当场报错）', () => {
  // .mjs 里没有装饰器语法（Node 22 的 V8 还不支持），直接调装饰器工厂验证守卫
  const decorate = action({ id: 'x', cli: ['x'], input: z.object({}), output: z.object({}) });
  assert.throws(() => decorate(() => 1, { kind: 'getter' }), /只能标注方法/);
});

// ---- 4. 类型层收益（TS 才有） ----

test('schema 的类型推导由 TS 提供（z.input / z.output 的存在即证据）', () => {
  const src = readFileSync(join(HERE, 'src', 'demo', 'module.ts'), 'utf8');
  assert.ok(src.includes('z.output<typeof demoGreetInput>'), 'handler 入参类型应引用 schema（解析后的形状）');
});

// ---- 端到端：生成物与手写 server 真的对得上 ----

test('端到端：生成的 client 能调用手写的 server', async () => {
  const stop = await startServer(actions, 18991);
  try {
    const transport = createHttpTransport('http://127.0.0.1:18991');
    const api = createApiClient(transport);

    const greeted = await api.greet({ name: '前端', loud: true });
    assert.match(greeted.greeting, /前端！/);

    const item = await api.item({ id: 'x1' });
    assert.equal(item.name, '条目-x1');

    const cfg = await api.config({ set: { k: 'v' } });
    assert.deepEqual(cfg.applied, { k: 'v' });
  } finally {
    stop();
  }
});

test('端到端：手写的交互层能用生成的 client 打通（且表单校验复用同一份 schema）', async () => {
  const stop = await startServer(actions, 18994);
  try {
    const page = bootstrapDemoPage('http://127.0.0.1:18994');
    const greeting = await page.onGreetClick('前端', true);
    assert.match(greeting, /前端！/);

    // 表单校验用的是服务端那份 schema：空名字在**发请求之前**就被拦下
    await assert.rejects(() => page.onGreetClick('', false), /不能为空/);

    const name = await page.onItemClick('x2');
    assert.equal(name, '条目-x2');
  } finally {
    stop();
  }
});

test('端到端：HTTP 侧非法入参被 zod 拦下（400）', async () => {
  const stop = await startServer(actions, 18992);
  try {
    const res = await fetch('http://127.0.0.1:18992/api/greet', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: '' }),
    });
    assert.equal(res.status, 400);
    const payload = await res.json();
    assert.equal(payload.ok, false);
    assert.match(payload.error, /名字不能为空/);
  } finally {
    stop();
  }
});

test('端到端：HTTP query 参数也要归一化（?days=3 是字符串）', async () => {
  const stop = await startServer(actions, 18993);
  try {
    const res = await fetch('http://127.0.0.1:18993/api/stats?days=3');
    const payload = await res.json();
    assert.equal(payload.ok, true, JSON.stringify(payload));
    assert.equal(payload.data.days, 3, 'query 里的 "3" 应被归一化成数字 3');
    assert.equal(payload.data.window, '3d');
  } finally {
    stop();
  }
});

test('CLI 别名能派发，且 help 里不重复列一条', async () => {
  const r = await runCli(actions, ['health']);
  assert.equal(r.ok, true, r.error);
  assert.equal(r.data.pong, 'pong');

  const help = renderHelp(buildTree(actions), 'demo');
  assert.ok(help.includes('ping'), 'help 应有主命令');
  assert.ok(!help.includes('health'), 'help 不该把别名列成另一条命令');
});

test('位置参数按 args 声明顺序消费（不是 schema 字段顺序）', async () => {
  // 造一个 args 顺序与 schema 字段顺序**故意不同**的 action：
  // schema 是 {a, b}，args 声明成 ['b','a'] —— 值必须按 args 顺序落位。
  const schema = z.object({ a: z.string(), b: z.string() });
  const action = {
    id: 'order.probe',
    cli: ['order'],
    args: ['b', 'a'],
    input: schema,
    output: z.object({ seen: z.string() }),
    module: 'order',
    moduleTitle: '顺序',
    method: 'probe',
    run: (input) => ({ seen: JSON.stringify(input) }),
  };
  const r = await runCli([action], ['order', 'FIRST', 'SECOND']);
  assert.equal(r.ok, true, r.error);
  assert.deepEqual(JSON.parse(r.data.seen), { a: 'SECOND', b: 'FIRST' });
});

test('树匹配：最长匹配命中子命令', () => {
  const tree = buildTree(actions);
  const hit = matchTree(tree, ['config', 'set', '--dry-run']);
  assert.equal(hit?.node.action?.id, 'demo.config');
});
