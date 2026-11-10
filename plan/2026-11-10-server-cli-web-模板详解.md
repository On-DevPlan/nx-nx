# server-cli-web 模板详解

> 生成日期：2026-11-10 · 基于 nx-nx v0.11.0 · 模板源：`templates/server-cli-web/`
> 核对范围：该目录下全部源文件（template.json / hooks.mjs / files/**）。
> 本文描述的是**这个模板生成出来的项目**长什么样、怎么运转；模板引擎本身见
> `plan/2026-11-10-模板功能与数据流向.md`。

---

## 1. 定位

`server-cli-web` 生成一个**开箱可用的本机工具项目**：

- **serve 驱动**：`pnpm start` 起一个 Web 面板（node:http 零框架依赖）；
- **CLI 与 API 同源**：一条 action 声明同时派生 CLI 命令与 HTTP 路由——
  面板上每个按钮都有等价 CLI 命令，agent 与人共用同一套能力；
- **编译期类型安全**：action 的参数、返回值、路由一致性由 TypeScript 类型系统
  在编辑器里当场报错，不等运行时；
- **真实路由树 + 可插拔布局壳**：加一个页面 = 新建一个目录，零全局登记；
  换版式 = 加一个壳文件，既有页面零改动；
- **带发版流水线**：lint（含体积/分层闸门）+ typecheck + build + smoke + unit
  一条 `pnpm test` 全绿，GitHub Actions 双 Node 版本实测。

适用场景：本机小工具、管理面板、agent 可操作的 CLI+Web 混合界面。
不适用：多用户远程部署的 Web 应用（服务只绑 127.0.0.1，无鉴权层）。

---

## 2. 生成与首次运行

### 2.1 生成

```bash
# CLI
nx-nx template create server-cli-web --letters zz --dir ../nx-zz
# 或 Web 面板（nx-nx serve → 新建项目页）
```

### 2.2 选项

| 选项 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `letters` | letters | **必填** | 1~5 位小写字母；决定项目名（前缀+字母）、数据目录、bin 名与 logo |
| `prefix` | string | `nx-` | 项目名前缀；可改（`my-`）或显式清空（生成无前缀项目） |
| `description` | string | 「本机工具：TypeScript 版 CLI 与 Web 面板同源」 | 写进 package.json 与面板副标题 |
| `port` | number | 钩子探测（7920 起） | serve 端口 |
| `vitePort` | number | 钩子探测（再 +10） | vite dev 端口 |
| `scheme` | enum | `mars` | logo 撞色（klein/mars/hermes/tiffany/red/vandyke/prussian） |
| `version` | string | `0.1.0` | 初始版本号 |

### 2.3 生成时发生的特殊处理

- **钩子 `beforeGenerate`**：端口留空则现探测补齐；`PROJECT_ROOT` 渲染成字面
  `{{PROJECT_ROOT}}` 保留——它是 **skill 安装期**占位，安装时由钩子注入真实项目根。
- **钩子 `afterGenerate`**：调 `tools/logo-gen` 实时产出 logo 全套
  （svg + png + ico，落到 `src/web/frontend/public/`）。不预置二进制 logo，
  杜绝「图与项目名对不上」的漂移。PNG 走 5x7 点阵字模，**只适合 1~3 个字母**。
- **`nextSteps`**（生成后展示）：
  `pnpm install` → `pnpm dev`（改码即生效）→ `pnpm test` → `pnpm start` →
  `<name> greet <名字>` 试试 CLI → 面板点「看板」看左侧栏壳。

### 2.4 模板变量落点（哪些文件被渲染了什么）

| 变量 | 主要落点 |
| --- | --- |
| `{{name}}` | package.json name/bin、paths.ts 的 `APP_NAME`/`APP_DIR`（`~/.<name>/`）、bin 名、skill 名、CLI 提示文本 |
| `{{letters}}` | `bin/<letters>.mjs`、dev skill 目录名 `dev-<letters>` |
| `{{title}}` | paths.ts `APP_TITLE` |
| `{{description}}` | package.json、paths.ts `APP_DESC`、面板副标题、skill description |
| `{{port}}` / `{{vitePort}}` | paths.ts `DEFAULT_PORT`、vite.config.ts、dev.mjs |
| `{{envPrefix}}` | 环境变量前缀：`<NAME>_STORE`（存储路径覆盖）、`<NAME>_PORT` / `<NAME>_VITE_PORT`（dev 端口覆盖） |
| `{{version}}` | package.json |
| `{{PROJECT_ROOT}}` | skill 文本占位，安装时注入（见 §9） |

---

## 3. 生成的项目结构

```
nx-xx/
├─ bin/<letters>.mjs            # 唯一入口：import dist/runtime/cli.js 跑 runCli
├─ package.json                 # scripts: dev / start / build / typecheck / lint / test
├─ eslint.config.js             # 分层约束 + 体积闸门 + action 成对闸门（见 §7）
├─ vite.config.ts               # root=src/web/frontend, outDir=dist/web/public, /api 代理
├─ tsconfig.{base,node,web}.json
├─ scripts/
│  ├─ dev.mjs                   # pnpm dev：端口协商 + 双进程 + 一个 ctrl-c 全关（§6.1）
│  └─ link-local.mjs            # 覆盖全局启动器为转发器，改码即生效不发版（§6.3）
├─ src/
│  ├─ index.ts                  # 库入口：导出 service / ACTIONS / startServer / runCli
│  ├─ core/                     # 零业务底层：paths / brand / errors / open / serve-port / store(JsonStore 类) / skills
│  ├─ runtime/                  # 装配层：cli / api / server / registry / spec / help / types/
│  ├─ modules/                  # 后端业务域：home（出厂示例，HomeService 类）、skill（SkillService 类）
│  └─ web/frontend/             # 浏览器侧：routes/（路由声明） pages/（页面本体） app/（装配+壳）
│                               #   components/<名>/（共享组件） assets/（样式 token） api/
├─ assets/                      # 随包分发的 skill（面向「用本项目」）
│  ├─ <name>/SKILL.md + hooks.json + install/inject-root.mjs
│  └─ groups.json               # group 别名表（skill install --group 用）
├─ .claude/skills/dev-<letters>/# 项目级开发者 skill（面向「改本项目」）
├─ tools/logo-gen/index.mjs     # 零依赖 SVG+PNG+ICO 生成（afterGenerate 调用）
├─ tests/
│  ├─ smoke.mjs                 # 真实进程跑 CLI 关键路径
│  └─ unit/                     # core / home-settings / layering / nav-model / registry / routes / serve-port
├─ CHANGELOG.md                 # Keep a Changelog 格式，从第一秒起可维护
└─ .github/workflows/ci.yml     # lint+typecheck+build+smoke+unit，Node 20/22 双版本
```

**前后端是两条目录线，不是同一个模块目录里的两半**：
`src/modules/` 只有后端（不含任何 tsx），`src/web/frontend/{routes,pages}/` 只有前端；
两者唯一的连接点是 action 契约（`src/modules/*/index.ts` 声明、`runtime/types/` 定型）。

---

## 4. 核心架构：一条 action，两个出口

### 4.1 全局数据流

```
        ModuleBase 子类（src/modules/<域>/index.ts，如 HomeModule）
         readonly actions = [ defineAction({ id, cli, http, args, flags })(run, render?) ] as const
                      │                │                │
          ┌───────────┘                │                └───────────┐
          ▼                            ▼                            ▼
   runtime/registry.ts          runtime/spec.ts              runtime/help.ts
   Registry.create（装载查重）  flag 强转/校验/默认值        help 文本/用法串派生
          │                            │                            │
          ▼                            ▼                            ▼
   ┌─────────────┐            ┌─────────────┐              面板 CliHints 组件
   │ CliApp      │            │ ApiRouter   │              （每个按钮亮出 CLI 等价）
   │ .run(argv)  │            │ .handle()   │
   └──────┬──────┘            └──────┬──────┘
          │  {transport:'cli'}       │  {transport:'http'}
          └────────────┬─────────────┘
                       ▼
              服务类（业务真相，src/modules/<域>/service.ts，构造注入 store）
                       ▼
              JsonStore（JSON 原子写 + mtime 缓存失效）
```

serve 端的 OOP 分层（从外到内全是类，边界清晰）：
- `Registry`（runtime/registry.ts）：`Registry.create(MODULES)` 静态工厂——编译期执行
  RegistryChecks 装载检查，运行时排序 + 自检；`registry` 单例被 CliApp / ApiRouter 共享。
  `MODULES` 是 as const 模块元组（typed client 与编译期查重靠它的字面量形状）。
- `CliApp`（runtime/cli.ts）：平台命令（serve/help/version）+ 命令匹配/解析/派发/渲染
  都是实例成员，`run(argv)` 是唯一对外入口；`runCli(argv)` 是兼容函数。
- `ApiRouter`（runtime/api.ts）：构造期把 actions 编译成排序路由表，`handle()` 是
  PanelServer 的 /api/* 入口；一次编译常驻复用。
- `PanelServer`（runtime/server.ts）：静态文件 + /api 分发；`startServer()` 兼容函数
  每次用当前注册表新建 ApiRouter。
- spec.ts / help.ts 保持纯函数——无状态的派生工具不装进类里（OOP 不当教条）。

- **Registry 装载期自检**（create 工厂内，与编译期 RegistryChecks 互为备份）：
  action id / CLI 路径 / HTTP 路由查重、每条 action 必有 cli——
  「面板上有按钮、CLI 里没命令」结构上不可能发生。
- **CliApp 与 ApiRouter 是同一批 action 的两个出口**：CLI 端失败 exit 1 + 可解析文本；
  HTTP 端错误码映射 4xx/5xx（INVALID_INPUT→400、NOT_FOUND→404、CONFLICT/BLOCKED→409）。
- **错误契约**：失败 throw `NxError`（带 code）；业务结果 `return {status}`。
  message 里「用法:」「未设置」「不存在」是对 agent 的分类契约，不得删。

### 4.2 出厂模块

- **home**：面板落地页，三类职责——启动聚合（`bootstrap show` / `routes` /
  `health`）、演示业务（`greet`：问候次数经 store.mutate 原子累计进本机存储，
  演示「面板操作 → 状态落盘」闭环）、本机设置（`setting get|set`，PATCH 语义）。
- **skill**：`skill list / get / install`（含 `--all` 直接覆盖、`--group`），
  把 `assets/` 里的 skill 装到本机 skill 目录。
- **全链路 OOP（serve 端风格）**：有状态的能力一律**类 + 构造注入**——
  `JsonStore`（缓存私有字段，`store` 单例被注入）、服务类 `HomeService(store)` /
  `SkillService`、模块 `HomeModule` / `SkillModule`（ModuleBase 子类：只读字段声明
  id/title/actions，actions 数组 **as const** 保住字面量元组——装载检查的类型机器
  靠它逐元素析构声明；readonly 字段保住 `id = 'home'` 的字面量类型），
  装配层 `Registry` / `CliApp` / `ApiRouter` / `PanelServer`。
  无状态的纯函数（spec 的强转、help 派生、设置项校验 coerce、人读渲染 render）
  保持模块级——没有状态的东西不装进类里，OOP 不当教条。
  测试想换实现时 `new HomeModule(new HomeService(otherStore))` 即可。
  两个已钉住的坑（注释里都有）：模块 actions 必须 as const（普通数组会让查重类型
  退化成空操作）；模块私有方法的返回类型必须显式标注（不标会沿
  commandTable → cliApp → registry → 本模块 actions → bootstrap 绕成循环推断，
  整类退化 any——TS7022）。

### 4.3 zod 装饰器通道（home 模块试点，与 builder 共存）

`@action` 装饰器把「声明与实现写进同一个方法」：zod schema 即契约
（`src/modules/home/schemas.ts`，命名约定 `<camelCase(actionId)>Input/Output`），
`ModuleBase` 子类的 actions 由 `zodActionsOf(this)` 从装饰过的方法收集。
- CLI 侧：参数归一化与校验全部从 schema 推导（`runtime/zod-bridge.ts`，
  `z.coerce` 的 'false'→true / ''→0 两个坑已绕开）；
- 前端侧：`pnpm gen:api` 生成 `api/client.generated.ts`（类型安全 apiclient，
  **import type 引 schema，zod 运行时不进浏览器包**）+ `cli-tree.json`（命令树快照）；
  入库并由 `tests/unit/api-client.test.mjs` 逐字节对账新鲜度；
- 接受的债务：`:param ⊆ args` 检查降级为运行期、handler 入参手写
  `z.output<typeof schema>`、`RegistryChecks` 对装饰器模块失效（运行时自检兜底）。
  完整评估与全量替换的触发条件见仓库 `plan/2026-11-10-zod装饰器下沉-server-cli-web验证.md`。

---

## 5. 编译期类型安全（这个模板的招牌）

### 5.1 defineAction 两段式

```ts
defineAction({
  id: 'home.greet',
  cli: ['greet'],
  http: ['POST', '/api/greet'],
  args: [{ name: 'name', required: true }],
  flags: { loud: { type: 'boolean' } },
})(
  (ctx) => greet(ctx.name, !!ctx.loud),        // ctx 被 CtxOf<S> 精确类型化
  (r) => r.greeting,                            // r 由 run 返回值推出
);
```

- 第一段 `const S` 保留声明字面量；第二段把 `ctx` 类型化为
  `{ name: string; loud?: boolean }`——**flag 类型、必填与否全部由声明推出**，
  `ctx.name` 写错拼写当场红。
- **编译期报错零件**：`Assert<Cond, Msg>` 在条件不成立时让类型长出
  `__error__: Msg` 字段，错误消息直接展示在编辑器里：
  - flag 的 type 白名单（string/number/boolean/array/json/kv）
  - http 必须是 `[METHOD, PATTERN]` 或显式 `null`
  - **路由 `:param` 与 args 名一致性**（不一致运行时会静默变 undefined，
    编译期就拦下）
- 为什么两段不是一锤子：自引用泛型（同对象内从 flags 推 run 的 ctx）在 TS 里
  会退化成 any/unknown；两段式把推断顺序显式化。

### 5.2 defineModules 装载检查

registry 处 `defineModules([...])` 把运行时循环的每项检查**前移成编译错误**：
模块 id 重复、action id 重复、CLI 路径重复、HTTP 路由重复、
结构性路由歧义（同方法同路径；GET+PATCH 同路径是合法 REST，不误报）。

### 5.3 typed client（前端侧）

```ts
const r = await client['home.greet']({ name, loud });   // 参数、返回值全有类型
```

- 类型由注册表推出（`import type`，编译后擦除——**不会把 Node 侧代码打进浏览器包**）；
- 运行时路由模式来自 `/api/bootstrap` 下发的命令表，浏览器不 import registry；
- 写错 action id、参数名、返回类型，编译期即红。
- 约束：页面组件不裸写 `fetch` / `api()`（绕过类型契约），一律经本页 `api.ts` 收口。

---

## 6. 开发与运行

### 6.1 `pnpm dev`（scripts/dev.mjs）

一条命令起 vite + 后端 serve（tsx 直跑源码，改码即生效），一个 ctrl-c 全关。
关键决策：

1. vite ready 之后再起 serve（反过来 ready 行会被噪音吞掉）；
2. 直接 spawn node 二进制不走 `npm run`（Windows 上 cmd.exe 会重排参数）；
3. vite 必须 `--host 127.0.0.1`（Node 18+ 默认 [::1]，curl 127.0.0.1 会拒连）；
4. **后端端口先谈定再起进程**：端口被占时先问「上面跑的是不是我」——
   是本项目面板就复用（不起第二个 serve）；是别人就顺延到下一个空闲端口
   （顺延时跳过 vite 端口）。解析出的端口**同时**交给 vite 代理目标与 serve
   `--port`——两边永远一致，不会「dev 前端连到占用端口的别人」；
5. vite 端口被占（`--strictPort`）则明确报错并给出换端口命令：
   `<NAME>_VITE_PORT=<n> pnpm dev`。
6. 端口被占过 → 主动把浏览器指到 dev 地址；`NX_SERVE_NO_OPEN=1` 全局关自动开浏览器。

### 6.2 vite 代理的一个坑（已内置解法）

前端源码根下有 `api/client.ts`，会被 Vite 暴露成 URL `/api/client.ts`，
撞上后端 `/api` 前缀——前端自己的模块请求会被代理吞掉，dev 白屏。
`vite.config.ts` 用 `shouldServeLocally()`（按扩展名判断「是不是前端资源」）
决定请求走 Vite 还是代理；该函数导出供单测钉住。

### 6.3 `pnpm start` 与 `link:local`

- `pnpm start` = build（tsc + vite）→ `bin/<letters>.mjs serve`。
  serve 撞端口同 dev 口径：自己的面板直接打开、别人顺延、都开浏览器。
- `pnpm link:local`：把全局 `<name>` 命令的启动器**原地覆盖**成转发到本仓库的
  shim（PATH 一字不动，已开终端立即生效）；原件备份到 `~/.<name>/dev/backups.json`，
  `unlink:local` 还原。幂等、自定位（ROOT 由 import.meta.url 推导），
  volta/npm/pnpm 装的全局启动器一视同仁。替代 npm link（Windows shim 不可靠）。

---

## 7. 前端：真实路由树 + 可插拔布局壳

### 7.1 一条路由 = routes/<名>.ts + pages/<名>/index.tsx

```
src/web/frontend/routes/<名>.ts        # 路由声明：path / nav? / layout? / page（指向组件）
src/web/frontend/pages/<名>/index.tsx  # 页面组件（默认导出）
src/web/frontend/pages/<名>/api.ts     # 建议：本页对 action 的调用收口
src/web/frontend/pages/<名>/components/<组件名>/index.tsx  # 可选：页面私有组件
```

- **发现机制**：`app/pages.ts` 用 `import.meta.glob(['../routes/*.ts',
  '!../routes/contract.ts'], { eager: true, import: 'default' })` 扫描——路由 id
  就是文件名，**不需要改任何全局文件**（contract.ts 是公共契约，负模式排除）。
  取代旧骨架「后端 views.ts + 前端组件表 + 测试」三方对账（漏一处页面就悄悄消失）。
- **组件与模型一律 `<名>/index.tsx` 目录形式**：共享组件 `components/<名>/`
  （cli-hints / theme / ui / nav-model），页面私有组件 `pages/<名>/components/<名>/`；
  纯模型（nav-model，零 React 零 IO）也走这个形式，可单测。
- **样式集中在 assets/**，按四层组织：
  `tokens.css`（设计变量：颜色/尺寸/阴影，深色主题只覆盖 token；
  **颜色一律引用 token，不许写字面色值**）、`base.css`（原子类：按钮/卡片/行/标签/弹窗）、
  `shells.css`（版式：头部/侧栏/栅格，随项目自由改）、`features.css`（页面专属，
  分段注释标明页面名；多个页面共用后升格进 base.css）。main.tsx 逐个 import。
- **路由声明字段取舍**：

| 想做的事 | 写法 |
| --- | --- |
| 进导航 | `nav: { label, order }` |
| 不进导航（详情页/向导页） | **不写 nav**；路由参数直接 `path: '/board/:id'` |
| 换版式 | `layout: 'sidebar'`（默认 'app'） |

- 出厂三条路由正好覆盖三种形态：`home`（顶栏壳 + 调 action）、`board`
  （**左侧栏壳** + 零 action，证明页面可以不碰后端）、`board-detail`
  （**无 nav + 路由参数**，`useParams` 取 id，深链/刷新可用）。

### 7.2 路由与壳

- `app/router.tsx`：HashRouter（server 只发静态目录、无 SPA fallback，
  hash 路由的刷新/深链/后退不需要后端配合）；页面 `lazy` 按需加载（路由声明的
  `page` 必须是函数，Vite 才保得住按页代码分割）；**错误边界挂在页面这一层**，
  一页崩溃壳还在、别的页面不受影响。
- **按壳分组**：同一个壳下的页面共享一个父路由——壳只渲染一次，切页不重挂壳。
- `app/layouts.ts` 是全项目唯一需要在「加一种新版式」时改的全局文件（一行）：
  `LAYOUTS: { app: AppShell, sidebar: SidebarShell }`（壳在 `app/shells/<名>/index.tsx`）；
  未登记的名字退回默认壳并**大声报错**（不静默降级）。
- 壳只是「版式」：AppShell = 品牌 + 平铺 tab + 分组下拉 + 主题切换；
  SidebarShell = 左侧栏。页面完全不知道自己挂在哪种壳下。

### 7.3 导航 = 路由树 × 设置

- `app/nav.ts` 是**唯一计算入口**：`useNav()` 把「有哪些页」（前端路由树）与
  「怎么摆」（settings：navGroups / navHidden / navOrder）相乘，任何壳都只调它，
  顶栏壳与左侧栏壳看到的摆法必然一致。
- **store 边界**：store 只放跨页共享的东西（boot / settings / typed client）。
  当前在哪一页、筛选、选中项一律放 URL（路由 + searchParams）——刷新、分享、
  后退天然可用。旧骨架把当前视图存 store+localStorage 是在手写功能不全的 router。
- 首页自带**栏目管理**（`pages/home/components/nav-manager/`）：候选来自路由树，
  保存走 `setting set`（PATCH），完成后 `refreshSettings()` 让两个壳同时跟上。
  窗口重新可见时自动 `refreshBoot()`——别的终端改了状态，切回来就能看到。

## 8. 存储与设置

- `core/store.ts` 的 `JsonStore` 类（`store` 单例）：用户目录 `~/.<name>/store.json`
  单文件 JSON。**原子写**（临时文件 + rename，进程中断不损坏）、**进程内缓存 +
  mtime 失效**（CLI 改了文件，Web 服务侧立刻可见）、`mutate()` 读-改-写事务
  （greet 计数并发不丢、抛错不写半个事务）。
- 扩展方式：改 `initialState()`，`normalize` 自动给老数据补默认值——**不需要迁移脚本**。
- 环境变量 `<NAME>_STORE` 覆盖路径（测试指向临时目录，不写脏真实数据）。
- **设置的关键边界**：后端**不存页面清单、不校验页面 id 存在性**。
  「有哪些页」是前端路由树的事实；后端只保存「怎么摆」并校验形状
  （navGroups 得是 `[{title, views}]`、跨组重复拒绝——那是摆法本身的矛盾）。
  于是加/删页面不需要动后端，删页也不会让导航配置失效。

---

## 9. 随包 skill 与安装钩子

| 资产 | 面向 | 作用 |
| --- | --- | --- |
| `assets/<name>/SKILL.md` | **用**本项目的人/agent | serve / routes / health / skill install 常用命令、端口与浏览器行为、典型会话、约束（权威清单看 `routes --json`，不要凭记忆杜撰） |
| `assets/<name>/hooks.json` | 安装钩子总线 | `skill:pre-install` 事件注册 `inject-root.mjs` |
| `assets/<name>/install/inject-root.mjs` | 安装期 | cwd 的 package.json name 不匹配 → `{block}` 拒绝安装；匹配 → 注入 `PROJECT_ROOT` 渲染进 SKILL.md（skill 只能在项目根安装） |
| `assets/groups.json` | `skill install --group` | group 别名表：`<name>` → `[<name>]` |
| `.claude/skills/dev-<letters>/` | **改**本项目的人/agent | 开发者指南：路由表（A01-加一个页面）、项目事实（代码地图、命令）、约束红线；与主 skill 分工：`<name>` 管运行面，`dev-<letters>` 管开发面 |

安装：项目根执行 `node bin/<letters>.mjs skill install <name>`（或 `--all` 强制
覆盖装齐）。文本里的 `{{PROJECT_ROOT}}` 安装时渲染成项目根全路径。

---

## 10. 质量闸门（pnpm test = lint + typecheck + build + smoke + unit）

### 10.1 eslint 管架构意图，不只管风格

| 规则 | 管什么 |
| --- | --- |
| `max-lines: 400`（跳过空行注释） | 单文件结构膨胀 |
| `local/max-file-chars: 15000`（内联插件，跳过注释按有效字符计） | 密度膨胀——行数管结构、字符数管密度，两把尺子 |
| `local/action-parity`（扫 action 字面量） | 每条 action 必须同时声明 cli 与 http；`http: null` 必须属于豁免前缀（serve/server/skill）**或**显式 `web: false`；同时声明 http 与 `web: false` 报语义冲突。判决提前到编辑器（运行时注册表也拦，但那是启动后） |
| core 层 no-restricted-imports | core 是最底层，不得依赖 modules/runtime/web |
| src/web 层（目录级） | 浏览器边界：`src/web/**` 禁 `node:*` 与 Node 侧值导入——目录级规则，新建页面零配置自动覆盖 |

- **模块互不依赖故意不写进 eslint**：那需要逐模块枚举路径，漏补即静默失效，
  且「加模块要改全局配置」。改由 `tests/unit/layering.test.mjs` 解析真实路径判定
  （`import type` 放行——编译后擦除），新模块零配置、不随枚举过期。
- 一个模板特有的坑已写进注释：eslint 插件消息**不能用 `{{ }}` 插值语法**——
  本文件是模板文件，双花括号会被模板引擎当生成变量，生成项目时直接报
  「未声明的变量」。

### 10.2 测试

- **unit**（7 个文件）：
  - `routes.test.mjs`——钉「路由唯一真相是文件系统」：每条 routes/<名>.ts 都有
    pages/<名>/index.tsx、path 唯一且以 / 开头、page 是函数（否则丢代码分割）、
    contract.ts 存在且导出 definePage；
  - `layering.test.mjs`——模块互不值依赖（见上）；
  - `registry.test.mjs`——装载期查重与 lint 豁免前缀对账；
  - `nav-model.test.mjs` / `home-settings.test.mjs`——导航摆法计算与设置校验；
  - `serve-port.test.mjs`——端口协商（与生成器自身逐字节一致，只有一份来源）；
  - `core.test.mjs`——底层通用能力。
- **smoke**：真实进程跑 `bin/<letters>.mjs`——version 裸版本号可被
  `V=$(<name> version)` 消费、serve 起面板、命令跑通；每用例独立
  `<NAME>_STORE` 临时目录，不写脏用户数据。
- **CI**：GitHub Actions，Node 20/22 双版本跑同一条 `pnpm test`。

---

## 11. logo 生成（tools/logo-gen）

零依赖纯 JS：SVG（真实字体，浏览器渲染，任意尺寸清晰）+ PNG（内置 5x7 点阵
字模 + zlib deflate）+ ICO 容器，7 套撞色方案。放在模板自己的 tools/ 而非生成器
核心——logo 是**这个模板的偏好**，通用生成器只认识「文件」不认识「图片」
（由 afterGenerate 调用）。已知局限：点阵 PNG 只适合 1~3 个字母，4~5 字母
请用 SVG 或引入字体光栅化。

---

## 12. 扩展指南

### 加一个 action / 功能域（后端）

1. `src/modules/<域>/service.ts` 写业务（**不含 tsx**）；
2. `index.ts` 用 `defineAction` 声明（id/cli/http/args/flags）+ `(run, render?)`；
   类型系统自动管住 ctx 形状、返回值、路由一致性；
3. `src/runtime/registry.ts` 登记模块（一行 import + 数组一项）；
4. 需要 UI 就建页面（见下），页面经 `api.ts` → typed client 调用；
5. 跑 `pnpm test`：action-parity、registry 查重、layering、smoke 全部自动对账。

红线：
- 新 action 必须同时声明 cli 与 http；确属纯 CLI 要 `http: null, web: false`
  或属于豁免前缀——lint 与启动期注册表都会拦；
- 不要给「只是给面板拉个列表」的纯展示数据硬凑 action；
- 类型契约优先改 `src/runtime/types/`，再改实现；动契约时同步 `tests/`。

### 加一个页面（前端）

新建 `routes/<名>.ts` + `pages/<名>/index.tsx`，详见模板自带的
`.claude/skills/dev-<letters>/references/A01-加一个页面.md`——零全局登记；
筛选/分页/选中放 `useSearchParams()` 不放 useState；页面私有组件放
`pages/<名>/components/<名>/index.tsx`，跨页面复用才进全局 `components/<名>/`。

### 加一种版式

`app/shells/<x>-shell/index.tsx`（内含 `<Outlet />`，导航用 `useNav()`）+
`app/layouts.ts` 加一行 + 路由声明写 `layout: '<x>'`。既有页面零改动。

---

## 13. 设计红线汇总（改动前先看）

1. CLI 与 Web 必须成对（action-parity；结构上不可能只加面板按钮不加命令）；
2. 前后端唯一连接点是 action 契约；`src/web` 与 Node 侧只许 `import type`；
3. 前端不存「当前在哪一页」——URL 就是状态；
4. 后端不存页面清单——settings 只存摆法，不校验页面存在性；
5. 路由唯一真相是文件系统（routes/ + pages/）；壳清单（layouts.ts）是唯一的全局版式登记点；
6. core 是最底层；模块互不依赖由测试解析真实路径判定（不枚举）；
7. 所有「东西放哪」从 core/paths.ts 取，不在别处拼字符串；
8. 模板文件里**不许出现裸 `{{ }}`**（eslint 消息、正则、示例代码都要绕开）；
9. 存储走 `mutateStore` 事务，不裸读裸写 store.json；
10. 单文件 400 行 / 15000 有效字符上限——逼近上限先拆分；
11. 前端颜色一律引用 assets/tokens.css 的 token，不写字面色值；
12. serve 端全链路 OOP：模块 = ModuleBase 子类（actions as const）、装配层 =
    Registry / CliApp / ApiRouter / PanelServer 类，服务 = 构造注入的类
    （JsonStore / HomeService / SkillService）；无状态纯函数保持模块级。
