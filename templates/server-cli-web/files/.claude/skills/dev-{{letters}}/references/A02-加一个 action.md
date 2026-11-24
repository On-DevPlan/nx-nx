# A02 · 加一个 action（后端侧）

> 本文只管**后端能力**（一条 action → CLI 命令 + HTTP 路由）。加前端页面见 A01。
> 两件事互不强制：一个 action 可以暂时没有页面入口（写 `http: null`）。

## 结论先看

**加一条 action = 新建一个文件 + 跑一次 `pnpm gen`。模块 `index.ts` 零改动。**

```
src/modules/<域>/actions/<名>.ts   ← 必须有：声明 + 契约 + 实现（同文件）
```

清单由 `scripts/gen-actions.mjs` 扫 `actions/` 目录生成到
`actions/_manifest.generated.ts`；模块 index.ts 用它装配，不手工列举类。

## 骨架（照抄这个形状）

```ts
import { z } from 'zod';
import { action } from '../../../runtime/action-decorator.js';
import { ActionBase, type ActionInput } from '../../../runtime/action-base.js';

/** <action.id> 的入参契约（CLI 与 HTTP 共用同一份）。 */
const input = z.object({
  // 每个字段都必须有 .describe()：help / cli-tree / Swagger / MCP 都靠它
  name: z.string().min(1, '名字不能为空').describe('要问候的名字（位置参数）'),
  loud: z.boolean().optional().describe('大声问候（全大写）'),
});

export class GreetAction extends ActionBase<typeof input> {
  @action({
    id: 'home.greet',                       // 全局唯一，编成 <模块>.<动作>
    cli: ['greet'],                        // CLI 路径；别名写 [['a'], ['b']]
    http: ['POST', '/api/greet'],          // 路由；纯 CLI 写 http: null
    summary: '打个招呼',                   // 进 help 与面板
    args: ['name'],                        // 位置参数字段名（按序消费 argv）
    input,                                 // 契约
    render: (r) => r.greeting,             // CLI 人读渲染（可 async）
  })
  override async run(ctx: ActionInput<this['_input']>) {
    // ctx 的类型由基类泛型推导——不手写 z.output<typeof input>
    const store = this.deps.get('store');  // 依赖经 IoC 容器取
    return { greeting: `你好，${ctx.name}！` };
  }
}
```

## 为什么要这样写

| 写法 | 理由 |
| --- | --- |
| `extends ActionBase<typeof input>` | 类上的类型实参是**唯一声明点**：handler 的入参类型由幻影字段 `_input` 推导，不必再手写 `z.output<typeof input>`（写两遍就会漂移） |
| `override async run(ctx: ActionInput<this['_input']>)` | `run` 是唯一执行入口；`ActionInput` = `z.output`（解析后形状，`.default` 字段必填） |
| 契约内联在本文件 | 一条 action 一个文件自持；前端类型靠 `InstanceType<typeof X>['_input']` 从类上取，不需要暴露 schema 常量 |
| 出参不写 schema | **实现即契约**：前端 apiclient 的返回类型从 `run` 的签名推断，同一信息只声明一次 |
| 每个字段 `.describe()` | 字段描述同时喂 help 的「参数:」段、cli-tree、OpenAPI/Swagger、MCP inputSchema。漏写 → `field-descriptions.test.mjs` 当场红 |

## 三步

### 1. 新建 `actions/<名>.ts`

照上面的骨架写。约束：

- `cli` 必填（Web 上能做的，CLI 都能做）。多个路径写 `[['a'], ['b']]`。
- `http` **两态**：面板入口写 `[METHOD, PATH]`；纯 CLI 写 `null`；
  **不写（undefined）会在装载期报错**——「有意不给面板入口」与「忘了写」必须分得开。
- 路由里的 `:param` 必须在 `args` 里声明同名位置参数（收集期自检）。
- 位置参数之外的字段是 `--flag`；布尔字段裸写 `--flag`，其余 `--flag <值>`。

### 2. 跑 `pnpm gen`

```bash
pnpm gen          # = gen:actions + gen:api
```

刷新 `actions/_manifest.generated.ts` 与前端 `api/client.generated.ts` +
`api/cli-tree.json`。生成物**入库**，新鲜度由 `tests/unit/api-client.test.mjs`
逐字节对账——忘了跑 gen，测试当场红。

### 3. 跑测试

```bash
pnpm test
```

包含 lint（含字符数限制）+ 行数门禁 + typecheck + build + smoke + unit。

## 常见变体

**别名**（一条命令多个路径）：

```ts
cli: [['events'], ['watch']],
```

**尾部收参**（剩余位置参数整组收进数组字段）：

```ts
@action({ cli: ['tail'], http: null, restArg: 'tags', input })
// schema: tags: z.array(z.string())
// usage 渲染 <tags...>
```

**SSE / 长连**（HTTP 侧自己接管响应）：

```ts
@action({ id: 'events', cli: [['events'], ['watch']], http: ['GET', '/api/events'], input, stream: true })
override async run(ctx: ActionInput<this['_input']>, opts: ActionRunMeta = {}) {
  const raw = ctx as typeof ctx & { __raw?: { res?: ServerResponse } };
  if (opts.transport === 'http' && raw.__raw?.res) return streamSSE(raw.__raw.res);
  return streamNDJSON({ timeoutSec: ctx.timeout });   // CLI 侧等价通道
}
```

`stream: true` 的 action 不进前端 typed client（SSE 不是 req/resp 形状），
前端用 `EventSource` 直连。

**纯 CLI 平台命令**：`http: null`，且 `summary` 写清用法。

## 与其它层的关系

- **CLI 命令表**、**HTTP 路由表**、**help 文本**、**OpenAPI 文档**全部由 action
  声明派生——加一条 action，这四处自动跟上，不会分叉。
- 面板端要调用它 → 走生成的 apiclient（`createApiClient({ request })`），
  类型引用用 `import type`，禁止值导入 Node 侧。
