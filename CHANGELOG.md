## [Unreleased]

### Added

- **管理空间成为常驻实体**：新增 `src/core/service/space-session.ts` 与 `_runner.mjs` 的
  `NX_NS_SESSION=1` 会话模式——空间面板**只装载一次**，之后所有 introspect / call / check
  都在同一个空间实例上执行（stdin/stdout 走 NDJSON 协议）。此前每次动作都新起子进程重新装载，
  于是状态堆每次重置、调用栈永远为空，空间退化成了「一段跑完就散的脚本」。
  现在 `sg space-call` 能看见**调用后的空间状态**与**这次调用的调用栈**，
  服务组的面板与 check 闸门也共享同一个空间实例。空闲 5 分钟自动回收，
  serve 退出 / CLI 结束都会收掉会话进程，不留孤儿。
- **命令与界面作用在同一个空间上**：serve 启动时把落点写到 `~/.nx-nx/serve.json`，
  CLI 的 `sg space` / `sg space-call` 检测到本机有面板在跑就转给它执行——
  于是命令行调完一个方法，Web「管理空间」卡的「最近调用」立刻能看到，
  不再是「命令一个空间、界面另一个空间」的两套状态。serve 不可达时自动退回本地会话。
- **共享面板升格为「管理空间」（namespace）**：新增 `assets/scripts/_ns.mjs`，把面板从
  「一段跑完就散的脚本」变成可装载、可列举、可调用的空间实体——有名字、有状态（堆）、
  有方法（可列举 / 可调用）、有调用栈。面板既可沿用 `globalThis` 风格，也可
  `defineSpace({ name, state, methods })` 显式声明（两种风格可混用）。
- **执行 server 前先 check**：服务组新增 `space: { panel, check }` 配置，`check` 指向空间里
  那个**返回 bool** 的方法。**启动主脚本之前**先调它，返回 false 就短路、不启动
  （依赖没就绪就别起，起早了只会白占端口）。`sg run` 的步骤报告新增 `space.check` 一行。
- **空间管理命令**：`sg hub <id>`（一组看清 server / client / 空间方法 / 当前状态）、
  `sg space <id>`（方法清单 + 状态堆快照）、`sg space-call <id> --method <名> [--args <JSON>]`、
  `sg spaces`（本机所有空间，索引落盘）。对应 HTTP 路由
  `GET /api/service-groups/:id/hub`、`GET .../space`、`POST .../space-call`、`GET /api/service-spaces`。
- **Web 面板改用 Ant Design 6 组件库**（`antd` + `@ant-design/icons`）：新增
  `src/web/frontend/components/theme.tsx`，把 antd 的 token 对齐到本项目既有的灰阶视觉规范
  （黑主色 / 12px 字号 / 28px 行高 / 1px 底线分隔 / 卡片不堆阴影），避免「两套面板」的割裂感。
  「服务」页改用 `Card` / `Statistic` / `Badge` / `Form` / `Select` / `Tooltip`，
  「脚本」页改用 `Tabs` / `Input` / `InputNumber` / `Switch`。
- **服务组「流水线步骤」可排序**：client 脚本列表支持上下移动，**列表顺序即执行顺序**
  （此前只能多选，表达不了顺序）。
- **共享面板隐藏测试案例（`__tests`）真的会跑**：装载面板后自动执行一遍，通过的用例不出声，
  失败的写 stderr 告警（不阻断业务脚本）——此前文档承诺了自动执行，runner 却从未实现。
- **服务组日志抽屉**：Web「服务」页可拉出日志抽屉（事件 / 主脚本 IO 尾部 / client 执行 / HTTP 请求清单），
  新增 `sg logs <id>` 命令与 `GET /api/service-groups/:id/logs` 路由。
- **client 执行记录落盘**：流水线每跑一个 client 就往
  `~/.nx-nx/services/logs/clients-<组>.log` 追加一条（脚本名 / 退出码 / 耗时 / 输出尾部），
  `sg logs` 与日志抽屉新增「client 执行」段 —— client 是业务验证的主体，
  此前它却是唯一「跑完就没」、查不到执行现场的一段。

### Changed

- **界面按钮做减法**：服务组状态卡从 5 个按钮减到 3 个（停止 / 启动 / 跑流水线），
  活性检测与日志降级为「命令式入口」（`sg check` / `sg logs` 文字链接），
  空间方法不铺逐个调用按钮——每个动作都有等价命令，自动化时照抄即可，
  按钮越少越好自动化。
- **Web 脚本参数改为「填值」而非「敲 flag」**：参数标签不再显示 `--port`，
  自定义参数框拆成「参数名 / 参数值」两段（名字留空 = 位置参数）。
  脚本头部的 `@param` 声明照旧自动渲染成对应控件，用户不必知道脚本内部的 flag 语法。
- **共享面板堆快照覆盖模块具名导出**：除 `globalThis` 新增键外，也打印面板 `export` 出来的
  常量与函数；对象展开列出其函数成员（`api: { getCustomers: [function getCustomers] }`），
  Map / Set / Buffer 等只报类型与条数，不再被 `JSON.stringify` 抹成误导性的 `{}`。
- 「服务」页不再用浏览器原生 `prompt` / `confirm`（项目规范要求一律页内实现），
  改用既有的 `useDialog` 弹窗组件。

### Fixed

- **服务组别名函数此前读不到面板 API 的真实内容**：面板接口的响应裹了一层
  `{ ok: true, data: <内容> }`，而脚本侧直接读 `r.json.alive` —— 取到 undefined，
  于是 `serviceAlive()` **恒为 false**。表现为「HTTP 明明 200，client 脚本却说服务没启动」。
  `serviceAlive` / `serviceCheck` / `serviceStatus` / `serviceStart` / `serviceStop` 全部修正。
- **空间闸门管住两扇门**：此前「执行 server 前先 check」只挂在流水线上，
  `sg start` 与面板「启动」按钮直连 `startGroup` —— 同一个组点「跑流水线」不启动、
  点「启动」却照样拉起进程。现已把闸门下沉到 `startGroup`，两扇门共用同一把锁；
  自愈重启走 `skipGate`（恢复动作不被业务闸门拦死，避免「永不重启」）。
- **空间子进程现在继承 `NX_NX_SERVE_PORT`**：面板里的 `serviceCheck` / `serviceAlive`
  靠它回连本机 API，缺了它会打到默认端口 7880，表现为「check 莫名其妙不通过」。
- **空间方法抛错时带调用栈**：`sg space-call` 失败时除了错误信息还会打印调用栈，
  排错时能看见「从哪儿调进去的」。
- **`@param` 解析与注释对齐**：此前只在前 80 行内扫描，正文里随便一句
  `// @param foo ...` 也会变成一个输入框；现在声明区遇到空行即结束。
- 内置全局函数清单里 `send` 重复登记了两条（描述较弱的重复项已删除）。
- 「服务」页状态卡拆到 `status-card.tsx`，视图文件回到 300 行上限内。
- `style.css` 里重复了两遍的「服务工作台」「脚本参数表单」样式块已合并去重。
- `serviceGroup.set` 里遗留的调试输出 `console.error("DBG ...")` 已清除。

## [0.16.0] - 2026-11-11

### Changed

- **`server-cli-web` 模板的模块结构改为「一条 action 一个文件 + 抽象基类 + IoC 自动注册」**
  （发布方决策：业务逻辑不该都塞在一个 service.ts 里）。

  - **一条 action 一个文件**：`src/modules/<域>/actions/<名>.ts`——`@action` 声明与
    业务实现同文件；契约常量仍在同域 `schemas.ts`；域内确实被多条 action 共用的规则
    单独成文件（如 home 的 `settings.ts`：设置项校验与渲染）；
  - **抽象基类**：`runtime/action-base.ts` 的 `ActionBase`——所有 action 类继承它，
    构造函数统一只接容器；
  - **IoC 容器**：`runtime/container.ts`——依赖按 key 注册与解析
    （`this.deps.get<JsonStore>('store')`），缺失依赖在取用时点名报错；
    默认容器已注册共享依赖（store），测试可换一整个容器；
  - **自动注册**：`pnpm gen:actions` 扫各域 `actions/` 目录，把继承 ActionBase 的类
    收进 `actions/_manifest.generated.ts`；模块 `index.ts` 只做装配（不手工列举）——
    **加一条 action = 新建一个文件 + 跑一次 `pnpm gen`，index.ts 零改动**（已实测：
    新建 ping.ts → gen → `nx-zz ping` 直接可用，routes --json 含 home.ping）；
    `pnpm gen` 同时刷新前端 apiclient（`pnpm gen:api`）；清单新鲜度由
    `tests/unit/action-registry.test.mjs` 对账（忘了生成 → 当场红）；
  - **service.ts 解散**：home/skill 的服务类被 action 类取代（业务在各自文件里，
    依赖经容器注入）；`src/index.ts` 改导出模块类、容器与基类。

  验证：真实生成项目 `pnpm test` 全绿（52/52：lint 分层 + typecheck + vite build +
  smoke 11 + unit 41，含新增的清单对账 2 条）。

## [0.15.1] - 2026-11-11

### Fixed

- **`server-cli-web`：`help <模块>` 的 topic 恢复为位置参数**——单通道改造时漏写
  `args: ['topic']`，zod 通道的位置性由 args 声明决定，于是 `{{name}} help home`
  报「多余的参数: home」（`help --topic home` 仍可用）。补上 args，并加一条
  smoke 用例钉住这条命令形态。

## [0.15.0] - 2026-11-11

### Changed

- **`server-cli-web` 模板收敛为**单一 action 通道**（发布方决策：不要共存要单一）——
  全部 action（业务 10 条 + 平台 3 条 = 13 条）一律 `@action` 装饰器 + zod 契约，
  defineAction builder 及其整套编译期机器整体移除。

  - **skill 域装饰器化**：`src/modules/skill/schemas.ts` 契约常量 + 4 条装饰方法
    （list / groups / get / install），互斥校验与安装结果渲染原样保留；
  - **平台命令也成了 action**：`serve` / `help` / `version` 收进
    `src/modules/platform/`（`ModuleBase` 子类）——CliApp 因此没有「平台命令特判」，
    不写 http 即纯 CLI（serve 天然无面板入口）；
  - **删除**：defineAction builder、`runtime/types/action.ts`（两段式泛型 + Assert）、
    `runtime/types/http.ts`（ParamsCovered / AmbiguousPairs）、
    `runtime/types/module.ts` 的元组查重机器（RegistryChecks 等）、
    `runtime/spec.ts` 的 FlagSpec 强转通道、前端 typed client
    （`web/frontend/api/typed-client.ts` + store 的 client）、
    eslint 的 `action-parity` 规则（扫对象字面量，扫不到装饰器声明）；
  - `runtime/spec.ts` 只剩三件无状态的活：cliPathsOf / usageOf(fields) / compileRoute；
    `runtime/registry.ts` 去掉编译期约束，只保留运行时装载自检；
  - 前端 action 调用**一律走生成的 apiclient**（`createApiClient({ request })`），
    schema 按模块分组 import type（`../../../modules/<域>/schemas.js`）——
    zod 运行时不进浏览器包；产物入库 + 逐字节新鲜度对账（`pnpm gen:api`）。

  随之而来的口径变化（写文档/排查时先看这里）：
  - 编译期装载查重**不再存在**（此前只在 builder 通道有）：装载正确性由
    `Registry.create` 运行时自检 + 「非 GET 操作必须有面板入口」测试兜底；
  - `:param ⊆ args` 一致性在收集期红（`zodActionsOf`）；
  - handler 入参类型手写 `z.output<typeof schema>`；`_zod.def` 内部 API 集中在
    `runtime/zod-bridge.ts`；
  - 每个 action 都要写一对 output schema（换来 apiclient 的返回类型）。

  验证：真实生成项目 typecheck 0 错 + `pnpm test` 50/50（lint + typecheck + vite
  build + smoke 11 + unit 39）；实测 CLI 13 条命令（help 用法串由 zod 字段派生）、
  HTTP 面板 /api/health、/api/greet、/api/settings（GET+PATCH）与面板首页均正常；
  nx-nx 自身闸门全绿（smoke 11 + unit 96 + spike 29）。

  评估报告（含 2026-11-11 单通道决策附录）见仓库内
  plan/2026-11-10-zod装饰器下沉-server-cli-web验证.md。

## [0.14.0] - 2026-11-10

### Added

- **`server-cli-web` 模板落地 zod + @action 装饰器通道（0.10.0 spike 暂缓的第二步下沉验证），
  与 defineAction builder 双通道共存**——结论：能进，以共存进，不替换 builder
  （完整评估见仓库内 plan/2026-11-10-zod装饰器下沉-server-cli-web验证.md）。

  新增基建：
  - `src/runtime/action-decorator.ts`：`@action` 装饰器（WeakMap 元数据，不碰
    `Symbol.metadata`——tsx 与 tsc 产物行为不一致的坑）+ `zodActionsOf(instance)`
    收集器（ModuleBase 子类的装饰方法 → actions，含路由 `:param ⊆ args` 运行期检查）
  - `src/runtime/zod-bridge.ts`：schema 拆解与 CLI/HTTP 文本归一化（读 `_zod.def`
    内部 API；`z.coerce` 的 'false'→true / ''→0 两个坑已绕开）；输入校验错误带
    「用法:」前缀（对 agent 的分类契约）
  - `src/runtime/codegen.ts` + `pnpm gen:api`：从同一份契约生成前端 apiclient
    （`client.generated.ts`，类型安全方法 + query/body 分流 + 路径参数编码）与
    CLI 命令树快照（`cli-tree.json`）；**import type 引 schema，zod 运行时不进
    浏览器包**（与 spike 的刻意偏差：既有 typed client 本无运行时校验，行为等价更省）
  - `tests/unit/api-client.test.mjs`：生成物入库 + 与 registry 逐字节新鲜度对账 +
    覆盖对账 + 布尔归一化对账

  试点接线：home 模块 6 条 action 全部 `@action` 装饰器化（`schemas.ts` 契约常量 +
  方法即 handler，`this.svc.*` 直调服务类）；首页问候/栏目管理保存切到生成的
  apiclient；skill 模块保持 builder——两条通道在 `Registry.create` 汇合。

  接受的债务（均有兜底，详见评估报告）：`:param` 检查降级运行期；
  `RegistryChecks` 对装饰器模块失效（运行时自检兜底）；handler 入参手写
  `z.output<typeof schema>`；`_zod.def` 内部 API 集中在 bridge 单文件；
  render 参数 any；codegen 手动触发（新鲜度测试兜底）。

  验证：真实生成项目 typecheck 0 错、`pnpm test` 52/52（含 4 条新增对账）；
  实测 `greet`（zod 通道 CLI 落盘）/ `health` / `routes --json`（13 条命令）；
  nx-nx 自身闸门全绿。

## [0.13.0] - 2026-11-10

### Changed

- **`server-cli-web` 模板 serve 端全链路 OOP 化（modules + runtime 装配层类化）**，
  接续 0.12.0 的服务层类化（JsonStore / HomeService / SkillService），这次把
  「声明 + 装配」也收进类：
  - **模块 = ModuleBase 子类**：`HomeModule` / `SkillModule` 用只读字段声明
    id / title / actions，业务编排调服务实例；actions 数组 **必须 as const**——
    装载检查的类型机器靠只读元组逐元素析构字面量声明，普通数组会让查重悄悄退化
    成空操作（注释已钉住）；readonly 字段保住 `id = 'home'` 的字面量类型。
  - **Registry 类**（runtime/registry.ts）：`Registry.create(MODULES)` 静态工厂——
    编译期执行 RegistryChecks 装载检查（const 泛型只有函数/方法能提供，构造函数
    不行，所以工厂模式），运行时排序 + 装载自检；`MODULES` 是 as const 模块元组
    （typed client 与编译期查重靠它的字面量形状——之前从 registry.modules 取会
    退化成 AnyModule[]，前端 typed client 直接失效，这是本轮抓到的最深的坑）。
  - **CliApp 类**（runtime/cli.ts）：平台命令（serve/help/version）与解析/派发/渲染
    收为实例成员，`run(argv)` 唯一入口，`runCli()` 留作兼容函数。
  - **ApiRouter 类**（runtime/api.ts）：构造期编译排序路由表，`handle()` 常驻复用。
  - **PanelServer 类**（runtime/server.ts）：静态文件 + /api 分发；
    `startServer()` 兼容函数保留。
  - 边界不变：无状态纯函数（spec 强转、help 派生、coerce、render）保持模块级；
    defineAction 的两段式 builder 保留——它是类型推断的载体，模块类内部继续用它。
  - 两个新钉住的坑写进注释：模块私有方法返回类型必须显式标注（不标会沿
    commandTable → cliApp → registry → 本模块 actions → bootstrap 绕成循环推断，
    整类退化 any，TS7022）；子类字段要写 override（noImplicitOverride）。
  - 同步更新：仓库内 plan/2026-11-10-server-cli-web-模板详解.md §4 架构章节。

  验证：真实生成项目 `pnpm install && pnpm typecheck && pnpm test` 全绿（48/48，
  lint 分层 + typecheck + vite build + smoke 11 条真实进程 + unit 37 条）；
  实测 `greet`（落盘）/ `health` / `routes --json`（13 条命令表）端到端可用。

## [0.12.0] - 2026-11-10

### Changed

- **`server-cli-web` 模板前端目录规范化 + serve 端服务层 OOP 化**：

  前端（src/web/frontend/）：
  - **路由声明集中到 `routes/`**：一条路由一个 `routes/<名>.ts`（`contract.ts` 是公共
    契约，页面发现用负模式排除），路由 id = 文件名；页面本体独立到
    `pages/<名>/index.tsx`，页面私有 `api.ts` 与 `components/<名>/` 跟着页面走。
    「加一个页面」从新建一个目录变成新建两个文件，仍然零全局登记
    （`import.meta.glob` 扫 `routes/*.ts` 自动发现）。
  - **组件一律 `<名>/index.tsx` 目录形式**：共享组件 `components/<名>/`
    （ui / theme / cli-hints / nav-model），纯模型同形式（nav-model 零 React 零 IO，
    可单测），复用优先抽纯函数。
  - **样式集中到 `assets/`**，四层：`tokens.css`（设计变量，颜色一律引用 token
    不写字面色值）、`base.css`（原子类）、`shells.css`（版式）、`features.css`
    （页面专属，分段注释标页面名）；顺带清掉模板里混入的 nx-nx 面板专属死样式，
    补 `--shadow-float` / `--fs-small` / `--radius-sm` 三个 token。

  serve 端 OOP：
  - `core/store.ts` 改为 **JsonStore 类**（进程内缓存收进私有字段，`store` 单例）；
  - 业务服务用**类 + 构造注入**组织：`HomeService(store)`（greet / settings / health）、
    `SkillService`（list / groups / get / install，互斥校验收进类），
    模块 export 组装好的单例给 action 装配层调方法；
  - **action 装配层保持 defineAction 声明式不变**——那是类型系统的基础，
    与 zod spike 第一阶段结论一致；无状态纯函数（coerce / render）保持模块级。

  同步更新：模板自带 dev skill（SKILL.md 代码地图与约束、A01-加一个页面 全文重写）、
  自测 `views.test.mjs` 重写为 `routes.test.mjs`（对账 routes/ 与 pages/ 一一对应）、
  `template.json` description、仓库内 plan/2026-11-10-server-cli-web-模板详解.md。

  验证：真实生成项目跑 `pnpm install && pnpm test` 全绿（48/48——lint 分层 + typecheck +
  vite build + smoke + unit；模板改动只有生成后才被编译，这是唯一的完整验证路径）。

## [0.11.0] - 2026-11-10

### Changed

- **模板 `server-cli-web-ts` 更名为 `server-cli-web`**：JS 版已在 0.10.0 下线，
  `-ts` 后缀失去了区分对象，TS 版收编干净名。`templates/` 下整棵目录改名，
  `template.json` 的 `id` 同步改为 `server-cli-web`（「目录名 = id」的加载期校验不变）。
  影响：`template create server-cli-web-ts` 不再可用——会报「模板不存在」并给出
  可用列表，照提示改用 `server-cli-web` 即可。已在用旧 id 生成的存量项目不受影响
  （模板是复制出去的产物，生成后与生成器无关）。
  同步更新：`README.md`、`package.json` description、`assets/nx-nx/*` 与
  `assets/nx-dev/*` skill 文档、`mono-gf` 模板注释、
  `tests/smoke.mjs` 与 `tests/unit/{templates,option-form,lint-enumeration}.test.mjs`。

## [0.10.0] - 2026-11-10

### Added

- **仓库内新增 `spike/zod-decorator/`**（不随包发布，`files` 白名单不含它）：
  **zod + 装饰器** action 模型的验证 spike，29 条断言 + 独立 tsconfig，已纳入 `pnpm test`
  闸门（`test:spike` 与 `typecheck:spike`）。结论：模型成立（CLI 完全自动化、
  前端 apiclient 半自动化且可量化），但**建议分两步下沉**——第一步只加 zod、保持
  `defineAction` 的 builder 形态；第二步（换注解形态 + codegen 前端 client）暂缓。
  完整评估见仓库内 `plan/2026-11-10-zod-装饰器模型验证.md`。

### Removed

- **删除 JS 版模板 `server-cli-web`**：nx-nx 不再维护 JavaScript 版骨架，
  `templates/server-cli-web/` 整棵目录下线，只保留 TypeScript 版 `server-cli-web-ts`。
  理由：两套模板是同一骨架的两个语言副本，每加一个能力（类型系统、路由树、
  共享面板……）都要写两遍；JS 版没有编译期检查，能被 TS 版覆盖的能力一律覆盖。
  影响：`template create server-cli-web` 不再可用（会报「模板不存在」并给出可用列表），
  模板总数 4 → 3（`server-cli-web-ts` / `mono-gf` / `std-a-lang`）。
  已在用 JS 版模板的存量项目不受影响——模板是复制出去的产物，生成后与生成器无关。

### Changed

- 文档与 skill 同步收敛到 TS 版：`README.md`、`assets/nx-nx/SKILL.md`（模板 id 清单
  由 4 套改 3 套）、`assets/nx-nx/references/A01-product.md`（模板对照表由四套改三套）、
  `assets/nx-dev/*`、`package.json` description。
- 测试对账同步：JS/TS 双份 `serve-port` 导出一致性用例删除（只剩一份来源，无需对账），
  `tests/smoke.mjs` 与 `tests/unit/{templates,option-form,lint-enumeration}.test.mjs`
  改指 TS 模板。

## [0.9.2] - 2026-11-05

### Changed

- **`skill install --all` 改为直接覆盖**：不再走「任一冲突整体不落文件」的预检，
  一次把本机对齐到包内版本；`--group` 与单装的冲突预检**保持不变**。

## [0.9.1] - 2026-11-04

### Changed

- **TS 模板前端改为真实路由树，页面登记点从 6 处归零**：新增
  `src/web/frontend/app/`（`route.ts` 契约、`pages.ts` 用 `import.meta.glob` 扫
  `views/*/route.ts`、`router.tsx`、`nav.ts`、`layouts.ts`、`shells/`），页面迁到
  `src/web/frontend/views/<名>/`（`route.ts` + `page.tsx` + `api.ts` + 私有 `components/`）。
  加一个页面 = 新建一个目录，不再改任何全局文件；`nav` 字段省略即不进导航（详情页约定），
  `path: '/board/:id'` 支持路由参数。
- **布局变成可插拔的壳**：出厂带顶栏壳与左侧栏壳，`route.ts` 写 `layout` 即可选择；
  特殊版式（如左侧栏应用）新增一个壳文件，既有页面一行不改。
- **后端做减法**：删除 `core/views.ts`、`web/frontend/registry.ts`、`App.tsx` 与三方
  对账测试；`GET /api/settings` 不再返回页面清单，`setting` 只保存「怎么摆」（分组 /
  隐藏 / 顺序），删除一个页面不会让整份导航配置失效。
- **eslint 分层规则改为目录级**：`src/web/**` 禁 `node:*` 与 Node 侧值导入，新增页面零
  配置；模块互不依赖改由 `tests/unit/layering.test.mjs` 解析真实路径判定，不再逐模块枚举。

### Added

- TS 模板新增依赖 `react-router-dom`（HashRouter，静态部署无 SPA fallback 也可用）。
- 页面级 `Suspense` + `ErrorBoundary`：一页崩溃不影响导航与其它页面。
- `tests/unit/views.test.mjs`：钉住「页面目录自包含」「路由树与目录一一对应」等约定。
- 模板自带 dev skill 补齐 `references/A01-加一个页面.md`（加页面的分步清单与验证方式）。

### Fixed

- `runtime/types/client.ts`：`kv` / `json` 类型 flag 的入参不再只收字符串，typed client
  可完整覆盖 `setting.set`（此前示例因此退回裸 `api()` 调用，类型安全破洞）。
- 当前视图不再存进 store / localStorage，改由 URL 决定——原来那套是手写了个功能不全的
  router（刷新丢状态、不能分享链接、无嵌套与参数）。

## [0.8.6] - 2026-10-25

### Added

- **Web 面板新增「脚本」工作台**：顶部「脚本」页可直接列出、编辑、保存、运行、新建、
  删除内置脚本；运行前自动保存当前编辑内容，右侧回显 stdout / stderr / 退出码，并可
  切到「内置函数」查看别名模块清单。对应新增 CLI 命令 `script read` / `script save` /
  `script create` / `script delete`，与页面走同一套 action。

### Fixed

- **HTTP 运行脚本不再污染 serve 进程退出码**：`script.run` 只在 CLI 传输时设置
  `process.exitCode`，面板里脚本失败只体现在返回结果里。
- **路由歧义类型检查改为按 `METHOD + 路径` 比较**：`GET/PUT/DELETE` 共用同一路径
  不再被误报为结构性歧义，与运行时「先按 method 过滤」的口径一致。

## [0.8.5] - 2026-10-25

### Added

- **模板强制 CLI / Web 成对**：`server-cli-web` 与 TS 模板新增 eslint 规则
  `local/action-parity` + 注册表装载期校验——每条 action 必须同时声明 `cli` 与
  `http`；`http: null` 需显式 `web: false`（出口），或属豁免前缀
  `serve / server / skill`。
- 单测补三条：成对断言、lint 与 runtime 豁免前缀对账、非 GET 操作必须有面板入口。

## [0.8.4] - 2026-10-25

### Changed

- **skill 文档与模板的 ref 统一为 ABC 序列**：`assets/nx-nx` 与 `assets/nx-dev` 的
  `00-product` / `50-template-authoring` / `51-verification-loop` / `52-hook-bus`
  改为 `A01-product` / `A01-template-authoring` / `B01-verification-loop` / `C01-hook-bus`；
  `nx-dev` 主文档的 references 列表改为按 A/B/C 路由，模板生成的 dev skill 也按
  `A01-/B01-/C01-` 序列命名 ref（A 操作流程 / B 设计与代码 / C 验证与发布）。

### Added

- **内置脚本域（别名模块）**：新增 `nx-nx script list` / `script aliases` / `script run`
  （别名 `js run`），可以在 nx-nx 里直接跑 `.mjs` 脚本——**内置全局函数直接可用**，
  不用 import、不用自己拼 fs / shell 样板。内置全局函数分四组：文件（`readText`
  `writeText` `readJson` `writeJson` `exists` `isDir` `isFile` `mkdirp` `removePath`
  `copyTree` `listDir` `listEntries` `walk` `findFiles`）、进程（`run` `sh` `which`）、
  系统（`homeDir` `tmpDir` `cwd` `absPath` `env` `setEnv` `sleep` `now` `parseArgs`）、
  输出（`log` `ok` `warn` `fail` `heading` `table`）。
- **第一个内置脚本 `sync-nx-skills`**：把一批 nx 项目的随包 skill **强制覆盖**安装到
  本机 skill 目录（模板固定 → skill 文档改完，一条命令全量刷新）。**自己装，不借
  各项目的 bin**：安装规则是确定的，所以直接按规则做——源 `<项目>/assets/<skill>/`
  → 目标 `<安装目录>/<skill>/`，目标目录先删后拷（强制覆盖，旧文件不残留），
  `hooks.json` 与 `install/` 这类安装期资产不随安装走，文本里的 `{{PROJECT_ROOT}}` /
  `{{NX_NX_ROOT}}` 渲染成项目根全路径。整个脚本是纯文件操作，不起额外子进程。
  `--dry` 可先看会发生什么。
- **解耦是结构性的，不是口头约定**：别名模块只依赖 node: 内置，不 import 任何
  nx-nx 源码；脚本只许用「内置全局函数 + node: 内置」；脚本跑在自己的子进程里，
  全局副作用与崩溃都被关住。

## [0.8.3] - 2026-10-20

### Fixed

- **模板的 dev 模式也能扛住端口被占**：新生成项目的 `pnpm dev` 之前遇到后端端口被占就
  直接崩——端口是自己的面板时，dev 会跟着一起死；端口是别人的服务时，`serve` 悄悄
  顺延了端口，而 vite 的代理还指着老端口，dev 前端会连到占用那个端口的别人：页面能开、
  数据全错，比直接报错更难查。
- **dev 模式现在先谈定后端端口再起进程**：端口是自己的面板就复用（不再起第二个 serve），
  是别人的服务就顺延到下一个空闲端口（顺延时跳过 vite 端口），解析出来的端口**同时**交给
  vite 的代理目标与 serve 的监听端口——两边永远一致。
- **端口被占时 dev 也会自动打开浏览器**，指到 dev 地址；`NX_SERVE_NO_OPEN=1` 同样能关掉。
- **vite 端口被占时明确报错并给出换端口的命令**，不再「vite 没起来仍然启动后端」。

### Changed

- 两套模板的 `vite.config` 代理目标改为读 `{{envPrefix}}_PORT` 环境变量（默认仍是
  `{{port}}`），所以「换一组端口跑 dev」这件事现在真的成立。
- TS 模板的 `dev` 脚本改为 `node --import tsx scripts/dev.mjs`（它要 import TS 源码里的
  `core/serve-port.ts`）。

## [0.8.2] - 2026-10-20

### Changed

- **端口被占用时不再报错退出：自动复用或顺延，并把浏览器指过去**。`serve` 绑定端口
  遇到 `EADDRINUSE` 时，先探测该端口上的 `/api/bootstrap`：占用者**就是本项目的面板**
  （`app.name` 相同）就直接复用它——不再起第二个进程——并打开浏览器指向它；占用者是
  别的服务（或探测不出来）则顺延到**下一个空闲端口**起自己的面板，并打开浏览器指向新
  面板，不会把浏览器指向别人的服务。
- **跨项目统一的关闭开关 `NX_SERVE_NO_OPEN`**：设成 `1` / `true` / `yes` / `on` 时
  `serve` 完全不开浏览器（所有 nx-xx 项目共用这一个变量名）；`--no-open` 仍然只关
  当前这一次。
- **两套项目模板也带上了同一套端口占用处理**：`server-cli-web`（JS）与
  `server-cli-web-ts`（TS）新增 `src/core/serve-port.js` / `.ts`，`serve` 撞端口时
  同样自动复用或顺延并打开浏览器，关闭开关同样是 `NX_SERVE_NO_OPEN=1`。
  **以后 `nx-nx create` 出来的项目默认就是这套行为，不需要再手工改。**

## [0.8.1] - 2026-10-19

三份项目模板的产物根都自带标准 `CHANGELOG.md`；模板 `link-local` 重构、行数上限放宽；pnpm 同步到 12.x。

### Added

- **三份项目模板的产物根都自带 `CHANGELOG.md`**：`server-cli-web` / `server-cli-web-ts` / `mono-gf` 的 `files/` 各自新增一份，遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)（带维护约定与初始 `[Unreleased]`）。从生成的第一秒起，新项目就有可维护的版本日志，CI 与 agent 都能直接读。`std-a-lang` 不生成项目（只铺 `a_<lang>/` 目录骨架），故不配。
- **TS 模板补齐 `link-local.mjs` 与 `link:local` / `unlink:local` 脚本**（此前只有 JS 模板有），实现与 JS 版同源。

### Changed

- **模板的 `link-local` 重写为「自定位 + 幂等覆盖」**：只做一件事——覆盖 PATH 上现成的全局启动器（volta / npm / pnpm 一视同仁）；`ROOT` 改由 `import.meta.url` 运行时推导，项目搬迁或换机器后重跑一次脚本即指向新路径；已有转发器不再被误当原件备份（原件持久化到 `~/.<name>/dev/backups.json`）。删掉 volta 快照模式、PATH 编辑、一次性 receipt 这些过度设计。
- **模板 lint 的 `max-lines` 上限 300 → 400**：两份模板的 `eslint.config.js` 同步放宽——`link-local` 这类单文件自包含脚本天然偏长，收紧的上限只会逼人把一件事拆散。
- **`packageManager` 升级到 pnpm 12.11.2**（原 10.33.0）。CI 端 `pnpm/action-setup@v4` 会按字段自动装对应版本，workflow 本身无需钉死。

## [0.8.0] - 2026-10-15

打磨两套模板的开箱体验：可选项目名前缀、黑夜模式、端口被占用时复用已运行实例，头部导航改为更有质感的「分段控件」；并把出厂的「首页 / 设置」合并为一个落地页。

### Added

- **项目名前缀（`prefix`）成为可配置项**：默认 `nx-`，可改成任意前缀（如 `my-`），CLI 显式传空（`--prefix=`）则生成无前缀项目——非 `nx` 项目也能正常生成。`core/templates` 的 `resolveVars` 能识别「显式空值」，面板表单与 `template.json` 同步。
- **色彩主题（`theme`：light / dark / auto）**：设置写入 `<html data-theme>`，CSS 只覆盖 token，深色下自动切换暗色变量；头部新增主题切换按钮，设置页有外观卡。
- **端口被占用时复用已运行实例**：`serve` 捕获 `EADDRINUSE` 后先探测该端口（`GET /api/bootstrap`，短超时）——若跑的是本服务则**不重复启动，直接打开浏览器**；被别的服务占用则顺延到下一个空闲端口。新增 `probeInstance` / `findFreePort`。

### Changed

- **头部导航改为「分段控件」**：整块浅底圆角容器（大按钮）包裹 pill tab（小按钮），激活项是一块内嵌白色滑块，视觉连贯、不再靠边框逐个描边（参考 nx-rh / nx-kv）。分组入口 pill 带计数徽章与三角 caret，下拉菜单完整可见。
- **出厂的「首页 home」与「设置 settings」合并为一个 home**：保留模块 id 与「首页」标题作为落地页，栏目管理（navManager）并入 home；删除 modules/settings。合并后命令总数为 13（BUILTINS 3 + home 6 + skill 4）。
- **版本徽章**：版本从头部右侧小 mono 文本改为品牌名旁的徽章（如 `nx-qq [v0.1.0]`）。
- **ESLint 升级到 10.x**（TS 模板 typescript-eslint 同步到 8.x）；JS 模板在 `pnpm.peerDependencyRules` 放行 eslint-plugin-react 对 ESLint 10 的 peer 要求。

### Fixed

- **栏目拖拽分组闪烁**：根因是拖动时实时重排整个列表、DOM 移到指针下再触发 dragover 形成反馈回路。改为「静态列表 + 落点指示线」——拖动不重排 DOM，被拖行原地变淡，只画指示线，松手才一次性提交。
- 修复 5 处细节缺陷：help 摘要硬编码 `nx-nx` 且缺右括号、启动横幅重复名、TS help 误显「项目生成器」、TS ErrorBoundary 日志前缀硬编码、横幅多显 APP_TITLE。

## [0.7.0] - 2026-10-15

两份模板（server-cli-web / server-cli-web-ts）都带上**完全模块化的 tab 导航**——分组、隐藏、平铺排序全是配置，壳只做投影。沉淀自 nx-sk 的「栏目管理」。

- **新增 `core/views`**：「有哪些页面」的**单一来源**（纯数据、零 import，前后端共用）——前端按 id 拼懒加载组件（保住 Vite 代码分割），后端按 id 校验导航配置（坏 id 当场报错，而不是只校验形状）。新增页面 = 写 `modules/<域>/view` + 这里加一行 + registry 的 COMPONENTS 加一行，`tests/unit/registry.test.mjs` 三方对账。
- **新增 `modules/settings`**：设置页承载「栏目管理」，并给出 `setting get` / `setting set`（`--set k=v`，值可以是 JSON 数组）。容器模型：平铺 / 各分组 / **隐藏**（不是开关，是与分组同构的容器）；拖拽编排 + **实时预览**（拖到一半就看到松手后的顺序）。
- **纯模型 `web/frontend/components/navModel.*`**：容器判定、插入位换算（同容器往下拖要让位）、平铺顺序、校验——管理逻辑集中一处且可单测。
- 壳：未分组页面按 `navOrder` 排 → 分组下拉（悬浮展开 + 菜单上沿透明桥 + 离开延迟）→ 隐藏项只藏入口，深链仍可直达。
- `runtime/spec` 补 `json` / `kv` 两种 flag 类型（`@file.json` 也认）；CLI 补「同名 flag 收成数组」（`--set a=1 --set b=2` 后者不再覆盖前者）。
- 模板内新增 `tests/unit`：nav-model（容器 / 插入位 / 平铺顺序 / 校验）、settings（三项导航配置的校验与归一）、registry（清单 ↔ 组件 ↔ 模块目录 ↔ eslint 三方对账）；smoke 补 `setting` 往返。

### Fixed

- **JS 模板的前端 lint 规则没覆盖模块视图**：原先只写 `src/web/frontend/**`，而真正写视图的 `modules/<域>/view.jsx` 从不受「前端别导 node:」这条约束——规则形同虚设。改为 `src/modules/**/*.jsx`（通配）。

## [0.6.3] - 2026-10-10

把「list 可变模板」做成引擎原生能力，并补上面板/元数据的小开关。

- **引擎原生支持列表变量**（`core/generate.ts: listVarExpansions`）。
  模板里形如 `a_{{lang}}/...` 的路径，只要对应变量（`vars.lang`）的值是数组，就按
  元素复制出多份子树；副本内该变量降为标量、其余变量同全局 `vars`，文本里的
  `{{lang}}` 用各副本的标量值替换。这就是 `std-a-lang` 这类「同一骨架铺多份」的
  原生机制——钩子不再需要「母版-复制」那套 workaround（v0.6.0~0.6.2 的
  beforeGenerate 留 `{{lang}}` 字面、afterGenerate 复制母版再清理），所有路径安全检查、
  文本/二进制分流都直接走引擎，不会分叉。
- **`std-a-lang` 用上列表变量后，「框架很奇怪」变成「按 schema 自然展开」**。
  模板树就是 `files/a_{{lang}}/{doc,sdk,proj,res}/`——输入 `ts, go, py` 时引擎直接铺
  `a_ts/ a_go/ a_py/` 平级到父目录。`template.json` 新增 `outputMode: "siblings"`，
  service 看到它就不再从 `vars.name` 倒推 `targetDir`；siblings 模板**单 lang 与多 lang
  都要求 `--dir`**（统一语义：「输出目录 = a_<lang>/ 们的父目录」）。钩子从
  32 行的母版+复制变成 12 行——拆列表、强制 `--dir`、设 `vars.lang = list`。
- **`outputMode: "siblings"` 让面板知道不要乱猜**。
  选中 `std-a-lang` 时面板的「输出目录」留空、标必填 `*`，底部提示
  「a_<lang>/ 们的父目录（必填、空目录，生成器拒绝非空）」；多出的「缺输出目录」
  阻塞项走 issues 单一通道，按钮门禁与底部提示同源。`template.preview` 也跟着
  接受 `--dir` 并走 list-var 展开——预览看到的清单 = 落盘时的清单，不会出现
  「preview 显示 `a_ts/a_ts/` 但生成的是 `a_ts/`」的错位。
- **模板元数据支持 `logo: false`**。面板按它决定是否画 logo 预览与撞色行。
  `std-a-lang`（纯目录骨架）与 `server-cli-web-ts`（无 logo 二进制产物）设了它——
  默认马尔斯绿撞色行只会误导；`server-cli-web`（有 scheme）与 `mono-gf`（有品牌首字母）
  继续保留。是否画是模板的事实，面板**不猜**。
- **`mono-gf` 的 `goModule` 提示**：
  「推荐与 GitHub 仓库保持一致：github.com/<用户>/<仓库名>；留空则用
  github.com/example/<项目名>，发布前记得改」——把「保持一致」摆到第一位，发布前再改。
- **测试**：`tests/unit/templates.test.mjs` 新增一条端到端回归——std-a-lang 单语言只生
  一个 `a_ts/`、多语言平级 `a_ts/` `a_go/`、副本文本 `# a_<lang> · <lang>` 用各副本
  标量替换、单/多 lang 缺 `--dir` 钩子当场拒。锁住 `a_ts/a_ts/` 这个 bug 形状。
  `option-form.test.mjs` 的回归断言也跟到新的 `allIssues.length > 0`。

## [0.6.2] - 2026-10-10

修 `mono-gf` 与 `std-a-lang` 在 Web 面板上「生成项目」点不动，并把必填 / 可选的呈现统一到一处。

- **面板的按钮门禁改为 schema 驱动**。此前 `view.tsx` 把可点性硬编码在 `letters` 上——那是
  `server-cli-web` 家族的专属选项。`mono-gf` 的必填项是 `name`、`std-a-lang` 是 `lang`，
  两个模板无论怎么填都够不到那条分支，「预览文件 / 生成项目」恒灰。判定改由
  `modules/scaffold/option-form.ts` 承担：必填项、格式、目录建议全部从模板的 option schema 推出，
  面板不再认识任何具体选项名。输出目录的默认建议也跟着改了（`namePrefix + letters` → 按 schema 推项目名），
  `mono-gf` 填完项目名自动带出目录，`std-a-lang` 填 `lang=ts` 建议 `a_ts`；多语言（`ts, go`）
  不是合法目录名就不猜，交给用户填。
- **必填 / 可选的显示统一**。必填的红色 `*` 此前只画在 string / number 上，enum 与 boolean 完全没有标记，
  同一份 schema 在面板上有两种读法。现在三种控件共用一个 `FieldBadge`：必填带 `*`，选填一律带「选填」徽标；
  表单按「必填 / 可选」分组；按钮上方直接写明还差什么（`还差必填项：项目名`）——灰着的按钮必须说清在等什么。
  模板列表视图原来的表头叫「可选项」却把必填项混在里面列出，现在同样按必填 / 可选分组并逐项打标。
- **`pattern` 从此真的生效**。`std-a-lang` 的 `lang` 早就在 `template.json` 里声明了格式正则，
  但引擎从头到尾没读过它——声明是契约，不执行就是骗模板作者，也让面板无从校验。
  `resolveVars` 现在会执行它（`readTemplateMeta` 也会把非法正则判成坏模板，不拖到生成期）。
- **测试**：新增 `tests/unit/option-form.test.mjs`，拿真实模板库与 `resolveVars` **对拍**——
  面板说能生成，服务端必须收；面板说缺必填，服务端必须拒；规则漂移直接红。
  另有一条把 bug 的形状钉死：视图里不得再出现按具体选项名门禁的写法。
  控件标记的一致性用 `renderToStaticMarkup` 断言，不依赖浏览器。
- 文档：README / `assets/nx-nx/SKILL.md` / `assets/nx-dev/references/51-verification-loop.md`
  的命令表不再把 `--letters` 写成通用参数（它只是 `server-cli-web` 家族的必填项）。

## [0.6.1] - 2026-10-10

修一处 v0.5.0 加 `mono-gf` 时就遗留、本次加 `std-a-lang` 才显式报修的文档漂移：
随包分发的 skill 文档里模板清单仍停留在「两套」，与实际四套不一致。

- `assets/nx-nx/SKILL.md` 的「模板 id」列表更新到 4 套（`server-cli-web` /
  `server-cli-web-ts` / `mono-gf` / `std-a-lang`），每套一行用途一句话
- `assets/nx-nx/references/00-product.md` 的「两套模板对比」表重写为「四套模板
  一览」：可运行的三套（JS / TS / GoFullstack）一行一列，`std-a-lang` 单独说明
  「只铺目录、不产出可运行项目」，并点出 `--lang` 多值特性

## [0.6.0] - 2026-10-10

新增第一个「不生成项目、只铺目录」的模板，并修掉 nx-nx 自己面板的图标 404。

- **新模板 `std-a-lang`：a_{语言} 命名空间骨架**。参考 `D:\code` 的实际布局
  （`a_js/`、`a_go/`、`a_py/` …），把每个语言目录收敛成 **sdk / proj / res / doc**
  四象限：sdk 放自研/封装的库，proj 放该语言的项目（建议统一前缀），res 放第三方
  仓库与下载资源，doc 放工具链笔记。`--lang` 支持**逗号分隔的多个值**，一次起多个
  语言工作区（`--lang "ts, go, py"`）；单语言留空 `--dir` 时默认在当前目录生成
  `a_<lang>/`，多语言必须 `--dir` 指定空父目录——否则当场报错，而不是把
  `a_<lang>/` 们嵌进 `a_<firstLang>/` 里。
- **模板引擎：`--dir` 注入钩子 ctx**。`beforeGenerate(vars, ctx)` 之前拿不到
  `--dir`，模板没机会在解析期判断「多语言却只给了可嵌套的默认目录」。现在
  `ctx.dir` 即 CLI `--dir` 原值（`service.ts` 把 `rawDir` 的取值提到钩子之前）。
  这是 `std-a-lang` 多语言校验的依据，也修掉了原先「钩子里改目录名没参与目标检查」
  的一个时序隐患。
- **修复 nx-nx 自身面板的图标全 404**：`index.html` 引用的 `/favicon-32.png`、
  `/favicon-16.png`、`/favicon.ico`、`/logo-rounded.png`，以及 `App.tsx` 侧栏的
  `<img src="/logo-rounded.png">`，在**整个项目里一个文件都不存在**，也没有
  `public/` 目录——dev 与 prod 下全 404，侧栏 logo 图裂。根因与 v0.5.1 修 mono-gf
  的 favicon 同源，但当时只修了「按模板生成的项目」，nx-nx 自己从没修过
  （旧注释还误称「图标由生成器的 logo-gen 产出」——logo-gen 是模板钩子，
  只在生成新项目时跑，nx-nx 自己永远不会被生成）。改法与 v0.5.1 一致：
  **内联 SVG data URI**，零网络请求、零二进制依赖，字面与侧栏品牌字统一取 `nx`。

## [0.5.1] - 2026-10-09

`mono-gf` 端到端实跑（真起 PostgreSQL + 真浏览器）之后修掉的两处 ——
两处都**不报错**，只有把项目真跑起来才看得见。v0.5.0 已发布的版本里都还在。

- **时间列全是字面的 `2006-01-02 15:04:05`**：`gtime.Time.Format()` 用的是 GoFrame
  自定义语法（`Y-m-d H:i:s`），标准库 layout 必须用 `Layout()`。用反了不报错，
  只是把格式串原样当结果输出。已改为 `Layout("2006-01-02 15:04:05")`。
- **每个生成项目的控制台都有一条 favicon 404，且侧栏品牌字是写死的 `M`**：
  新增 `initial` 选项（留空自动取项目名首字符，由 `hooks.mjs` 填充），
  侧栏品牌标记与标签页图标共用它；图标改用内联 SVG data URI，
  浏览器不再隐式请求 `/favicon.ico`。

## [0.5.0] - 2026-10-09

新增第一个**非 Node 生态**的模板（GoFrame 全栈），并把模板引擎的一个静默失败修掉。

- **新模板 `mono-gf`：GoFrame mono-repo 全栈骨架**（与 `server-cli-web` 同级）。
  Go 后端（GoFrame v2.10 + PostgreSQL）+ React 面板 + nginx 前置，一仓多应用：
  `app/server` 带 api 契约（`/hello`、`/user/list`、`/user/create`）、
  controller → logic → `g.DB()` 完整分层、`db/schema.sql`、`make dao` 的 gen 配置、
  docker-compose（pg + api + web）、CI。实测：生成即 `go build` 通过、
  前端 `tsc --noEmit` + `vite build` 通过、`docker compose config` 通过、
  起服务后 `/hello` 返回 `{code:0,message:"OK",data:{…}}`、`/user/list` 能真连库
  （无库时报连接失败而不是找不到驱动）、校验失败回 `code:51`。
- **修复 `isTextPath` 的扩展名白名单漏项**：`.go .mod .sum .sql .conf .example .dockerignore`
  之前不在白名单里 → 这些文件被当二进制**原样拷贝**，占位符字面留在生成产物里
  （不报错的静默失败）。mono-gf 模板就是踩到这一点才暴露的。
- 单测加固两条：`isTextPath` 覆盖非 JS 生态扩展名；
  「模板库全部文本文件都能渲染」新增一条断言 —— **非文本扩展名的文件里不允许出现占位符**，
  否则生成时会原样拷贝、静默坏掉。
- **两个模板的 lint 新增「单文件有效字符数」闸门**（`local/max-file-chars`，上限 15000）：
  `max-lines` 只管行数，把每行拉长照样能一直膨胀；字符数是同一件事的另一把尺子，
  两者同口径、都只统计「有效代码」（跳过空行与注释）。
  该闸门**不跟着 `max-lines` 给 `scripts/`、`tools/` 开豁免**：行数豁免的本意是
  「开发脚本结构随意」，不是「体积可以无上限」——JS 模板里被免检的
  `scripts/link-local.mjs`（约 12.7k 有效字符 / 528 行）现在也在闸门内。
- 新增单元测试：两个模板的 `eslint.config.js` 都必须带这条闸门。根 lint 忽略
  `templates/**`，模板规则没有别的地方会跑到，不钉住就没人发现。
- 新增长期护栏：**模板库全部文本文件都必须能渲染**。这条规则本身就是踩出来的——
  ESLint 的 `messages` / `messageId` 插值语法和模板引擎的占位符是同一套双花括号，
  写进模板文件会让 `template create` 当场报「未声明的变量」（smoke 只 dry-run 了
  JS 模板，TS 模板没人兜）。规则内改成字符串拼接，并把「渲染全部模板文件」钉成测试。

## [0.4.0] - 2026-10-09

多 skill 编排与配置驱动 hook 总线，并把整套机制沉淀为标准模块植入两个模板。

- **multi-skill**：`skill install [name]` 显式安装、`skill install --group <g>`
  一键装一组、`skill list` / `skill groups` 列出可装项与默认安装标记；
  `groups.json` 缺失或损坏时降级为目录扫描，schema 错误显眼报错
- **配置驱动 hook 总线**（参考 Claude Code hooks 模型）：
  - 每个 skill 可带 `hooks.json`，事件平面开放（首批 `skill:pre-install` /
    `skill:post-install`），`match` 正则匹配目标，核心不枚举事件
  - 两类 handler：`module`（ESM 导入，路径越界拒绝，支持 `#export`）与
    `command`（子进程语言无关，payload 走 stdin；exit 2 阻断、exit 0 返回决策）
  - 统一 decision：`block` 阻断安装、`vars` 聚合为动态字符串、`data` 收集；
    坏 JSON / schema / 坏正则一律 specError
  - 安装期资产（`hooks.json`、`install/`）不复制进安装目标
- **标准模块沉淀**：skill 机制重组为自包含的 `core/skills/` 六文件
  （index / get / install / bus / handlers / text-util），零生成器依赖，
  可直接移植；`text-util` 为文本判定的独立模块
- **两个模板初始化即具备 multi-skill + hook 机制**：
  - `server-cli-web-ts` 与 `server-cli-web` 均内置 skill 模块、模板资产
    （主 skill + hooks.json + install handler）
  - 首个 hook：skill 安装时校验当前项目根，非本项目拒绝安装，是则注入
    项目根全路径（安装期占位 `PROJECT_ROOT`）
  - JS 模板补齐 smoke 测试、JSX lint 支持（eslint-plugin-react）
- 工程：build 前清理 dist（杜绝旧产物打包），`tsc -b --force` 保证干净构建
- 测试：nx-nx smoke 8 项、unit 27 项全闸门通过；两个模板 e2e 项目
  （nx-ts / nx-js）lint / build / smoke 全部通过

## [0.3.0] - 2026-10-09

项目本身全面 TypeScript 化，并新增 TS 模板。

- **项目从 JavaScript 迁移到 TypeScript**，落地编译期类型安全系统：
  - 两段式泛型 action builder：run 的 ctx 由声明精确派生，漏传必填参数、
    flag 值类型写错编译即红
  - 注册表查重前移到编译期：模块 / action id、CLI 路径、HTTP 路由重复 +
    结构性路由歧义
  - typed client：未知 action、漏传路由参数、位置参数缺失全部编译报错，
    返回数据按 run 精确推导
  - branded 路径（AbsolutePath / SafeRelPath）、错误码穷尽映射
- **新增模板 `server-cli-web-ts`**：TypeScript 版骨架，自带上述类型系统与
  home 示例模块（bootstrap / routes / health / greet）
- ESLint 新增 `max-lines`：单文件有效代码行上限 300（跳过空行与注释）；
  超限文件（cli / view）已按职责拆分
- 修复：面板 `CliHints` 组件 props 与调用方不匹配，提示区域静默渲染为 null
- 修复：typed client 的调用参数漏覆盖不在路由中的位置参数
- 测试：smoke 6 项、unit 23 项，全闸门（lint / typecheck / build / smoke / unit）通过

## [0.2.0] - 2026-10-04

- 模板随包 skill 转为产品文档：`assets/{{name}}/` 面向使用者（客户 / agent），
  只讲解决什么问题、命令用法与使用场景，不再包含源码结构
  - `SKILL.md` 删除「核心不变量」（action 三端声明、依赖方向等开发内容）
  - `references/00-design.md`（架构图 / 分层 / 错误案例）替换为
    `references/00-product.md`（解决什么问题 / 使用背景与需求 / 使用场景）
- CLI：`--letters` 与 `--dir` 组合生成时输出目录语义不变

## [0.1.0] - 2026-09-27

首个版本。

- 通用模板引擎：`{{var}}` 占位符（路径 + 内容）、二进制原样复制、GitHub Actions `${{ }}` 不误替换
- 模板契约：`template.json`（元数据 + option schema）+ `hooks.mjs`（动态选项 / 生成前后钩子）
- 首个模板 `server-cli-web`：serve 驱动 CLI 与 Web 面板的全量骨架
  - runtime 五件套（cli/api/server/registry/spec，一条 action 三端同源）
  - core（paths/errors/store/open）
  - web 壳（React + vite，style 分 tokens/atomic/layout 三层）
  - logo 生成（零依赖，SVG + PNG + ICO，7 套撞色，每次生成实时产出）
  - dev 启动器、link-local shim、发版流水线（tag 幂等 + provenance）
- CLI：list / describe / preview / create / ports / check-dir，全命令 `--json`
- 面板：三栏可视化创建（模板选择 / schema 驱动表单 / logo 实时预览 + 文件树）
- 安全：目标目录非空即拒、路径非法段拒绝、模板 id 防穿越
- 测试：29 项（模板引擎边界 + smoke + lint 清单一致性）
