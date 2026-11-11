# zod + 装饰器下沉 server-cli-web 验证报告

> 日期：2026-11-10 · 前置：0.10.0 的 spike（`spike/zod-decorator/`，当时结论是
> 「模型成立，但建议分两步下沉，第二步（注解形态 + codegen apiclient）暂缓」）·
> 本轮 = 在 v0.13.0 全 OOP 的 server-cli-web 模板上执行那次暂缓的验证：
> **zod + @action 装饰器能否进入 serve-cli-web。**
> 交付：模板内的可运行垂直切片（home 模块 6 条 action 全部装饰器化 + codegen
> apiclient 已接线到页面）+ 本报告的结论。

## 附录（2026-11-11 决策）：已改为**单一通道**

发布方决策：**不要共存，要单一**。本报告原结论（「以双通道共存进」）作废，
模板已在 v0.15.0 收敛为单一通道：

- skill 域与平台命令（serve / help / version）全部装饰器化——业务 10 条 + 平台 3 条
  = 13 条 action，同一张注册表、同一条解析路径；
- **defineAction builder 及其编译期机器整体移除**：FlagSpec 强转、ParamsCovered、
  RegistryChecks 元组查重、typed client（前端改用生成的 apiclient）全部删除；
- 因此上表债务 **#2 从「部分模块退化」升级为「永久移除」**：编译期装载查重不再存在，
  装载正确性只由 `Registry.create` 的运行时自检 + 「非 GET 操作必须有面板入口」测试
  兜底；债务 #3（handler 入参手写 z.output）与 #4（`_zod.def` 内部 API）不变；
- 新增两条被单通道放大的债：输出 schema 是纯样板（每个 action 都要写），
  eslint 的 `action-parity` 规则随 builder 一起删除（扫不到装饰器声明），
  面板入口改由运行时/测试守。
  —— **这两条在 2026-11-11 的 v0.17.0 已清**：output schema 整体移除（返回类型
  从 action 类的实现推断，「实现即契约」），依赖改为强类型 DependencyMap
  （拼错 key 编译期红）。详见 CHANGELOG 0.17.0。

评估报告其余部分（量化、债务清单、验证记录）仍然成立，仅「结论」一节按上述更新。

---

## 结论（原始）

**能进——但以「双通道共存」进，不替换 defineAction builder。**

- `@action` 装饰器通道已作为模板的一等公民落地：`runtime/action-decorator.ts`
  （装饰器 + 收集）+ `runtime/zod-bridge.ts`（schema 归一化桥）+ `runtime/codegen.ts`
  （apiclient / 命令树生成）+ `pnpm gen:api` 脚本 + 入库产物与新鲜度对账测试。
- **home 模块 6 条 action 全部装饰器化**（试点），skill 模块仍是 builder——两条通道
  在 `Registry.create` 汇合成同一张命令表/路由表，CliApp / ApiRouter 按 action 是否
  带 `fields` 分叉解析通道，渲染器与派发器共用。
- 「生成树的 cli + 前端 apiclient」两点都成立且已验证：CLI 解析参数全部从 schema
  推导（零手写 switch）；apiclient 6 个方法手写 0 行，页面只写了传输层适配 1 行
  （`const request: Transport['request'] = (method, path, body) => api(path, { method, body })`）
  与两处接线调用——与 spike 的量化一致。

## 相比 spike 的两处刻意偏差（都朝省的方向）

1. **前端不做 zod 运行时校验**：生成的 client 以 `import type` 引 schema，
   zod 运行时不进浏览器包。既有 typed client 本来就没有运行时校验，行为等价；
   服务端照旧在 zod-bridge 双端守 schema（CLI 与 HTTP 共用同一份）。
2. **产物入库 + 新鲜度对账**（spike 是生成后即用）：`client.generated.ts` /
   `cli-tree.json` 提交进模板，`tests/unit/api-client.test.mjs` 把「入库的」与
   「从当前 registry 重新生成的」逐字节对账——改声明忘了 `pnpm gen:api` 当场红。

## 全 OOP 结构下的合流点（本轮新验证的）

装饰器 + 类是天作之合：`@action` 标在 **ModuleBase 子类的方法**上，handler 的
`this` 是实例——服务注入（`this.svc.greet(...)`）、私有装配方法（`this.bootstrap()`）
全部直接可用。spike 里「类持有状态」的卖点在 OOP 模板上从演示变成了常态。

## 接受的债务清单（每条都有兜底，改动前先读）

| # | 债务 | 兜底 |
| --- | --- | --- |
| 1 | 路由 `:param ⊆ args` 一致性检查从编译期降级为**运行期** | `zodActionsOf` 收集时当场抛错 |
| 2 | `RegistryChecks` 对装饰器模块失效（actions 是运行时数组，无字面量元组） | `Registry.create` 运行时自检（id/cli/http 查重 + parity）；builder 模块（skill）仍受编译期保护 |
| 3 | handler 入参类型必须手写 `z.output<typeof schema>`（装饰器改不了方法签名） | 无兜底——这是注解式的固有代价 |
| 4 | zod `_zod.def` 内部 API（归一化靠它判字段种类） | 集中在 `zod-bridge.ts` 一个文件，版本升级先看它 |
| 5 | codegen 手动触发（`pnpm gen:api`），build/typecheck 已前置 | 新鲜度对账测试兜底 |
| 6 | `render` 回调参数类型是 `any`（上下文 never 让 `r.greeting` 整片红） | eslint 对 any 仅警告；已有 disable 注释 |
| 7 | eslint `action-parity` 扫的是对象字面量，扫不到装饰器 | home 全部有 http，运行时 parity 兜底；**未来要加纯 CLI 的装饰 action 时**，需给 ActionMeta 补 `web: false` 机制（记为 TODO，当前未需要） |
| 8 | 输出 schema 是纯样板（装饰器拿不到返回类型） | 换来 apiclient 的返回类型——这笔交易就是模型的核心 |

## 验证

- 真实生成项目：`pnpm typecheck` 0 错；`pnpm test` **52/52**（lint 含 web 分层 +
  typecheck + vite build + smoke 11 条真实进程 + unit 41 条，其中 4 条是本轮新增的
  api-client 对账）。
- 端到端实测：`greet 世界`（zod 通道 CLI，落盘计数）/ `health` / `routes --json`
  （13 条命令表，含 6 条装饰器 action + 3 条 builder action + 4 条平台命令）。
- 页面接线：首页问候按钮 / 栏目管理保存已切到生成的 apiclient
  （`pages/home/api.ts`），builder 通道的 skill 域继续走 typed client。
- nx-nx 自身闸门全绿（smoke 11 + unit 96；已知失败仅 ui-kit 空骨架一条，与本轮无关）。

## 何时全量替换 builder

现在不换：builder 的编译期检查（ParamsCovered、RegistryChecks、ctx 类型全推导）
在装饰器式下都会降级，而模板 action 总量还小。触发条件（满足其一再全量）：
- 模板 action 数量长到 builder 数组难以维护（>20 条/模块）；
- TS 装饰器支持改写方法签名（债务 #3 消失）；
- 团队需要「每个 action 必带 output schema」的纪律压过编译期检查的价值。

## 落点（文件索引）

| 文件 | 职责 |
| --- | --- |
| `src/runtime/action-decorator.ts` | `@action` 装饰器 + WeakMap 元数据 + `zodActionsOf` 收集 + `:param` 运行期检查 |
| `src/runtime/zod-bridge.ts` | schema 拆解（`_zod.def`）/ CLI 文本归一化 / zod 输入输出校验 |
| `src/runtime/codegen.ts` | apiclient 源码生成 + 命令树 JSON 生成 |
| `src/modules/home/schemas.ts` | home 域 zod 契约（命名约定 `<camelCase(actionId)>Input/Output`） |
| `src/modules/home/index.ts` | 装饰器化试点模块（方法 + `@action`，actions 由收集器填充） |
| `scripts/gen-api-client.mjs` | 生成脚本（`pnpm gen:api`） |
| `src/web/frontend/api/client.generated.ts` + `cli-tree.json` | 入库产物（勿手改，新鲜度对账） |
| `tests/unit/api-client.test.mjs` | 新鲜度 + 覆盖 + 布尔归一化对账 |
