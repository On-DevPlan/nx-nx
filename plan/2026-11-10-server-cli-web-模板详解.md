# server-cli-web 模板详解（当前版）

> 对应版本：nx-nx v0.15.0 · 模板源：`templates/server-cli-web/`
> 状态：**单一 action 通道**（`@action` 装饰器 + zod 契约），builder 已整体移除。
> 本文按「先看什么 → 是什么 → 怎么跑 → 怎么改」组织；核对过的源码事实，
> 与实现不符时以源码为准（每节末尾给了对应文件）。

---

## 0. 阅读指引

| 你的目的 | 读这几节 |
| --- | --- |
| 5 分钟搞懂它是什么 | §1 定位 · §3 地图（只看树） |
| 要加一个后端能力 | §4.2 声明契约 · §5 CLI 生命周期 · §13.1 加 action |
| 要加一个页面 | §7.1 路由与页面 · §13.3 加页面 |
| 排查问题 | §14 红线与已知债 · §15 速查 |
| 想理解为什么这么设计 | §4.3 归一化桥 · §12 logo · 仓库内 `plan/2026-11-10-zod装饰器下沉-server-cli-web验证.md` |

---

## 1. 定位

`server-cli-web` 生成一个**开箱可用的本机工具项目**：

- **serve 驱动**：`pnpm start` 起一个 Web 面板（node:http，零框架依赖）；
- **CLI 与 API 同源**：一条 action 声明同时派生 CLI 命令与 HTTP 路由——
  面板上每个按钮都有等价 CLI 命令，agent 与人共用同一套能力；
- **契约即代码**：action 的入参/出参由 zod schema 定义，CLI 与 HTTP 共用同一份校验；
- **前端类型安全**：前端调用走 codegen 出来的 apiclient，类型来自同一份 schema；
- **真实路由树 + 可插拔布局壳**：加一个页面 = 新建两个文件，零全局登记；
  换版式 = 加一个壳目录，既有页面零改动；
- **带发版流水线**：lint（含体积/分层闸门）+ typecheck + build + smoke + unit
  一条 `pnpm test` 全绿，GitHub Actions 双 Node 版本实测。

**适用**：本机小工具、管理面板、agent 可操作的 CLI+Web 混合界面。
**不适用**：多用户远程部署（服务只绑 127.0.0.1，无鉴权层）。

---

## 2. 生成一个项目

```bash
# CLI
nx-nx template create server-cli-web --letters zz --dir ../nx-zz
# 或 Web 面板：nx-nx serve → 「新建项目」页
```

### 2.1 选项

| 选项 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `letters` | letters | **必填** | 1~5 位小写字母；决定项目名（前缀+字母）、数据目录、bin 名与 logo |
| `prefix` | string | `nx-` | 项目名前缀；可改（`my-`）或显式清空（生成无前缀项目） |
| `description` | string | 「本机工具：TypeScript 版 CLI 与 Web 面板同源」 | 写进 package.json 与面板副标题 |
| `port` | number | 钩子探测（7920 起） | serve 端口 |
| `vitePort` | number | 钩子探测（再 +10） | vite dev 端口 |
| `scheme` | enum | `mars` | logo 撞色（klein/mars/hermes/tiffany/red/vandyke/prussian） |
| `version` | string | `0.1.0` | 初始版本号 |

### 2.2 生成时发生的三件特殊事

1. **端口现探测**：`hooks.mjs` 的 `options(ctx)` 调 `ctx.probePorts({start: 7920, count: 2})`
   给出建议值；用户留空时 `beforeGenerate` 再补一次。
2. **`PROJECT_ROOT` 占位保留**：它是 **skill 安装期**的占位（安装时由 `hooks.json`
   的 handler 注入真实项目根），生成期渲染成字面 `{{PROJECT_ROOT}}`。
3. **logo 现算**：`afterGenerate` 调 `tools/logo-gen` 产出 svg+png+ico 全套。
   不预置二进制 logo——每次现算，杜绝「图与项目名对不上」的漂移。

### 2.3 生成后

```bash
cd nx-zz && pnpm install
pnpm dev      # vite + 后端 tsx 直跑源码，改码即生效
pnpm test     # lint + typecheck + build + smoke + unit
pnpm start    # 构建并启动面板
nx-zz greet 世界   # 试试与面板同源的 CLI
```

> 对应文件：`templates/server-cli-web/{template.json,hooks.mjs}` · `src/core/paths.ts`

---

## 3. 生成物的完整地图

```
nx-xx/
├─ bin/<letters>.mjs            # 唯一入口：import dist/runtime/cli.js 跑 runCli
├─ package.json                 # scripts: dev/start/build/typecheck/lint/test/gen:api/link:local
├─ eslint.config.js             # 分层约束 + 体积闸门（400 行 / 15000 有效字符）
├─ vite.config.ts               # root=src/web/frontend, outDir=dist/web/public, /api 代理
├─ tsconfig.{base,node,web}.json
├─ scripts/
│  ├─ dev.mjs                   # pnpm dev：端口协商 + 双进程 + 一个 ctrl-c 全关
│  ├─ gen-api-client.mjs        # pnpm gen:api：生成前端 apiclient + 命令树快照
│  └─ link-local.mjs            # 覆盖全局启动器为转发器，改码即生效不发版
├─ src/
│  ├─ index.ts                  # 编程入口：导出服务类 / 装配类
│  ├─ core/                     # 零业务底层（Node 侧）
│  │  ├─ paths.ts               #   路径与安全校验（生成时写入 name/端口/存储路径）
│  │  ├─ brand.ts               #   品牌类型（AbsolutePath / SafeRelPath）
│  │  ├─ errors/index.ts        #   NxError + 错误码 → HTTP 状态 / 退出码
│  │  ├─ store.ts               #   JsonStore 类（原子写 + mtime 缓存失效）
│  │  ├─ open.ts                #   打开浏览器
│  │  ├─ serve-port.ts          #   端口探测 / 复用判定（与生成器自身逐字节一致）
│  │  └─ skills/                #   skill 平台能力（发现/导出/安装/hook 总线）
│  ├─ runtime/                  # 装配层：CLI / HTTP / 注册表 / 契约
│  │  ├─ container.ts           #   IoC 容器（依赖注册与解析）
│  │  ├─ action-base.ts         #   action 抽象基类（持容器）
│  │  ├─ action-decorator.ts    #   @action 装饰器 + zodActionsOf 收集器
│  │  ├─ zod-bridge.ts          #   schema 拆解 + 文本归一化 + zod 校验
│  │  ├─ registry.ts            #   Registry 类（装载 + 运行时自检）
│  │  ├─ cli.ts                 #   CliApp 类（命令匹配 / 解析 / 派发 / 渲染）
│  │  ├─ api.ts                 #   ApiRouter 类（路由表编译 + 分发）
│  │  ├─ server.ts              #   PanelServer 类（静态文件 + /api 分发）
│  │  ├─ spec.ts                #   cliPathsOf / usageOf / compileRoute（无状态）
│  │  ├─ help.ts                #   命令条目与 help 文本派生
│  │  ├─ codegen.ts             #   apiclient 与命令树生成
│  │  └─ types/module.ts        #   ModuleBase 基类
│  ├─ modules/<域>/             # 业务域（一条 action 一个文件）
│  │  ├─ actions/<名>.ts        #   声明（@action）+ 实现同文件，类继承 ActionBase
│  │  ├─ actions/_manifest.generated.ts   # codegen 收进本目录所有 action 类
│  │  ├─ schemas.ts             #   zod 契约（命名 <camelCase(actionId)>Input/Output）
│  │  └─ index.ts               #   只做装配：模块元信息 + 容器建实例
│  │  （platform = serve/help/version；home = 启动聚合/演示业务/本机设置；
│  │    skill = 随包 skill 的发现与安装）
│  └─ web/frontend/             # 浏览器侧
│     ├─ routes/<名>.ts         #   路由声明（一条路由一个文件）+ contract.ts 公共契约
│     ├─ pages/<名>/index.tsx   #   页面本体（+ 私有 api.ts 与 components/）
│     ├─ app/                   #   装配：pages.ts 发现 / router.tsx 路由树 / nav.ts 导航
│     │                          #         layouts.ts 壳清单 / shells/<名>/index.tsx 壳
│     ├─ components/<名>/index.tsx  # 共享组件与纯模型（ui / theme / cli-hints / nav-model）
│     ├─ assets/                #   样式：tokens / base / shells / features
│     ├─ api/                   #   client.ts（传输层）+ client.generated.ts（生成物）
│     ├─ store.tsx              #   bootstrap + settings + 刷新
│     └─ main.tsx / index.html
├─ assets/{{name}}/             # 随包分发的使用 skill（面向「用本项目」）
│  ├─ SKILL.md + hooks.json + install/inject-root.mjs
│  └─ ../groups.json            # group 别名表（skill install --group 用）
├─ .claude/skills/dev-<letters>/ # 项目级开发者 skill（面向「改本项目」）
├─ tools/logo-gen/index.mjs     # 零依赖 SVG+PNG+ICO 生成
├─ tests/
│  ├─ smoke.mjs                 # 真实进程跑 CLI 关键路径（11 条）
│  └─ unit/                     # 8 个文件：api-client / core / home-settings /
│                                 #   layering / nav-model / registry / routes / serve-port
├─ CHANGELOG.md                 # Keep a Changelog 格式，从第一秒起可维护
└─ .github/workflows/ci.yml     # lint+typecheck+build+smoke+unit，Node 20/22
```

**前后端是两条目录线**：`src/modules/` 只有后端（不含任何 tsx），
`src/web/frontend/` 只有前端；两者唯一的连接点是 action 契约。

> 对应文件：整个 `templates/server-cli-web/files/`

---

## 4. 运行时架构

### 4.1 全景

```
     @action 装饰的方法（ModuleBase 子类）
        │  zodActionsOf(this) 收集（原型扫描 + WeakMap 元数据）
        ▼
   Registry.create([platform, home, skill])   ← 13 条 action，按 order 排序 + 运行时自检
        │
   ┌────┴────────────────────────────┐
   ▼                                 ▼
CliApp.run(argv)                 ApiRouter.handle(req,res,url)
   │ argv → fields → 归一化 → zod 校验      │ route/query/body → 归一化 → zod 校验
   ▼                                 ▼
action.run(input)  ←── 同一个 handler ──→  action.run(input)
   │                                             │
   ├─ render(result, ctx) → 人读文本            └─ JSON 信封 {ok,data}
   └─ --json → 原始 data
```

### 4.2 声明：一条 action 一个文件

```ts
// src/modules/home/actions/greet.ts
export class GreetAction extends ActionBase {
  @action({
    id: 'home.greet',                       // 全局唯一
    cli: ['greet'],                         // CLI 命令路径
    http: ['POST', '/api/greet'],           // HTTP 路由；**不写 = 纯 CLI**
    args: ['name'],                         // 位置参数字段（顺序即消费顺序）
    summary: '打个招呼（演示动作…）',
    input: homeGreetInput,                  // zod 入参契约（CLI 与 HTTP 共用）
    output: homeGreetOutput,                // zod 出参契约（apiclient 的返回类型来源）
    render: (r) => r.greeting,              // CLI 人读渲染；面板不用（走 JSON）
  })
  async greet(ctx: z.output<typeof homeGreetInput>) {
    const store = this.deps.get<JsonStore>('store');   // 依赖经 IoC 容器取
    const count = await store.mutate((s) => { /* … */ });
    return { greeting: `你好，${ctx.name}！`, count, … };
  }
}
```

**IoC 自动注册**（加一条 action 零登记）：

```
新文件 actions/ping.ts（继承 ActionBase，方法标 @action）
        │  pnpm gen:actions —— 扫 actions/ 目录，收进所有 ActionBase 子类
        ▼
actions/_manifest.generated.ts   ← 模块 index.ts 只读这份清单（不手工列举）
        │  容器建实例（依赖注入）→ zodActionsOf 收集
        ▼
注册表 → CLI 命令表 / HTTP 路由表 / 前端 apiclient（pnpm gen:api）
```

于是「加一条 action」= **新建一个文件 + 跑一次 `pnpm gen`**，
模块 `index.ts` 一行都不用改（已实测：新建 ping.ts → gen → `nx-zz ping` 直接可用）。

- **契约文件**：每域一份 `schemas.ts`，命名约定 `<camelCase(actionId)>Input/Output`
  （`home.greet` → `homeGreetInput`）。约定破了，codegen 会生成指向不存在符号的
  import，typecheck 立刻红；
- **handler 入参类型手写** `z.output<typeof schema>`——装饰器改不了方法签名（TC39 要求
  返回类型兼容），这是注解式的固有代价；
- **`output` 可选**：平台命令（serve/help/version）不产出数据，不写 output；
- **不写 `http` = 纯 CLI**：没有豁免名单，也没有 `web: false` 仪式。

> 对应文件：`src/runtime/action-decorator.ts` · `src/modules/*/schemas.ts`

### 4.3 归一化桥：zod 不能替代的那一半

zod 的 schema 面向「已成形的数据」：HTTP JSON 里 number 就是 number；
CLI argv 与 HTTP query 里一切都是字符串。同一份 schema 要同时吃两种形态，
中间必须有一层**归一化**——而它只能从 schema 内部结构反推（zod 没有公开的
「CLI 形态」概念）：

```
argv "--port 8080"        →  { port: "8080" }   文本
        │ normalizeCliValue（读 _zod.def 判字段种类）
        ▼
                          →  { port: 8080 }    schema 期待的形状
        │ zod parse（校验 + 应用 default）
        ▼
                          →  { port: 8080 }    handler 拿到的值
```

三条硬规则（都是从坑里长出来的）：

1. **只能读 zod 的内部字段** `_zod.def.type` 判断字段种类——zod 不公开这个信息。
   这是**内部 API，zod 升级时先看 `runtime/zod-bridge.ts`**；
2. **`z.coerce` 不能用**：`z.coerce.boolean()` 把字符串 `'false'` 变成 true、
   `z.coerce.number()` 把空串变成 0。归一化规则自己写（`normalizeCliValue`）；
3. **归一化按字段种类分派**：string / number / boolean / enum / array / kv / json
   七类各有各的文本形态规则（kv 支持 `--set k=v` 重复、json 走 JSON.parse）。

> 对应文件：`src/runtime/zod-bridge.ts`（`describeInput` / `normalizeCliValue` / `parseInput` / `parseOutput`）

### 4.4 装载自检

`Registry.create` 在装载期做运行时自检（单通道下没有编译期对账可互为备份）：

- action id 重复 → 启动即红；
- CLI 命令路径重复 → 启动即红；
- HTTP 路由重复（method + path）→ 启动即红；
- action 缺 `run` → 启动即红；
- 路由 `:param` 未在 `args` 里声明 → **收集期**红（`zodActionsOf`）。

> 对应文件：`src/runtime/registry.ts` · `src/runtime/action-decorator.ts`

---

## 5. 一条 CLI 命令的完整生命周期

以 `nx-xx greet 世界 --loud` 为例：

```
argv
 │ ① splitGlobals         摘掉 --json / --store（可出现在任意位置）
 ▼
argv
 │ ② resolveCommand       声明路径与 argv 前缀逐 token 比较，最长匹配胜出
 │                        （逐 token 是必需的：命令路径本身可能含 flag）
 ▼
命中 action（fields = describeInput 的产物：name 位置参数、loud 布尔 flag）
 │ ③ parseRest            位置参数与 flag 分离；布尔 flag 不吞下一个 token
 │                        （--loud 后面跟 demo，demo 是位置参数不是 flag 值）
 ▼
{ positional: ['世界'], flags: { loud: true } }
 │ ④ normalizeCliValue    文本 → schema 形状（number/boolean/array/kv/json 各有规则）
 ▼
{ name: '世界', loud: true }
 │ ⑤ zod parse            校验 + 应用 default；失败 → 「用法: … —— 参数不合法: …」
 ▼
handler 的 ctx            （z.output 形状）
 │ ⑥ action.run(ctx)      handler 里 this 是实例 → this.svc.greet(...)
 ▼
data                     ⑦ parseOutput 再守一道出参 schema（声明写错当场红）
 ▼
渲染                      ⑧ --json → 原始 data；否则 render(data, ctx) 的人读文本
                          失败 → exit 1 + 「错误: …」（--json 下是可解析信封）
```

**错误契约**（对 agent 的分类接口，assets 文档靠它判断）：

| 形态 | 例子 |
| --- | --- |
| 输入非法 | `用法: nx-xx greet <name> [--loud] —— 参数不合法: name 名字不能为空` |
| 未知 flag | `未知参数 --loudd（用法: nx-xx greet <name> [--loud]）` |
| 多余位置参数 | `多余的参数: xx（用法见 nx-xx help）` |
| 业务失败（NOT_FOUND / CONFLICT / BLOCKED） | 服务层抛 `NxError`，带 code |

> 对应文件：`src/runtime/cli.ts`

---

## 6. 一次 HTTP 请求的完整生命周期

```
GET /api/greet?name=世界
 │ ① PanelServer.dispatch     /api/* → ApiRouter；其余 → 静态文件
 ▼
ApiRouter.handle
 │ ② 路由匹配               路由表在构造期编译好并排序：
 │                          字面量段多的优先，其次段数多，再次左起第一个分歧处字面量优先
 │                          （排序是必需的：否则 /api/x/status 与 /api/x/:id 谁先声明谁赢）
 │ ③ 跨站防护               非 GET/HEAD 且 Origin 非本机 → 403
 ▼
raw 值                      route 参数（字符串）/ query（字符串）/ body（已是 JSON）
 │ ④ normalizeCliValue      统一归一化（对 JSON 值是幂等的）
 ▼
zod parse                    ⑤ 校验（失败 → 400 + 错误信封）
 ▼
handler → data              ⑥ parseOutput 守出参
 ▼
{ ok: true, data }           失败 → { ok: false, error, code }，状态码由错误码映射
                            （INVALID_INPUT→400 / NOT_FOUND→404 / CONFLICT·BLOCKED→409 /
                              EXTERNAL→502 / SPEC·INTERNAL→500）
```

> 对应文件：`src/runtime/api.ts` · `src/runtime/server.ts` · `src/core/errors/index.ts`

---

## 7. 前端

### 7.1 路由与页面

```
src/web/frontend/routes/<名>.ts        # 一条路由一个文件（+ contract.ts 公共契约）
src/web/frontend/pages/<名>/index.tsx  # 页面本体（默认导出）
src/web/frontend/pages/<名>/api.ts     # 本页对 action 的调用收口
src/web/frontend/pages/<名>/components/<组件名>/index.tsx   # 页面私有组件
```

```ts
// routes/home.ts
export default definePage({
  path: '/',
  nav: { label: '首页', order: 10 },   // 省略整个 nav = 不进导航
  layout: 'app',                        // 省略则 'app'
  page: () => import('../pages/home/index.js'),   // 必须是函数（保住按页代码分割）
});
```

- **发现**：`app/pages.ts` 用 `import.meta.glob(['../routes/*.ts', '!../routes/contract.ts'])`，
  路由 id = 文件名——**新建文件即登记，不改任何全局文件**；
- **不写 nav** = 该页不进导航（详情页/向导页），深链仍可达；
- **路由参数**：`path: '/board/:id'` + `useParams()`——旧骨架的「id→组件」平面映射
  加不出这种带参路径。

> 对应文件：`src/web/frontend/app/pages.ts` · `src/web/frontend/routes/*`

### 7.2 壳与导航

- `app/layouts.ts` 是**全项目唯一**需要为「加一种新版式」改的全局文件（一行）：
  ```ts
  export const LAYOUTS = { app: AppShell, sidebar: SidebarShell };
  ```
  未登记的 layout 退回默认壳并**大声报错**（不静默降级）；
- 壳在 `app/shells/<名>/index.tsx`：顶栏壳（品牌 + 平铺 tab + 分组下拉 + 主题切换）、
  侧栏壳（左栏）；壳只决定「页面摆在哪」，页面不知道自己被摆在哪种壳下；
- **导航 = 路由树 × 设置**：`app/nav.ts` 的 `useNav()` 是唯一计算入口——
  「有哪些页」来自路由树（前端事实），「怎么摆」来自 settings（分组/隐藏/顺序），
  两者相乘。任何壳都只调它，摆法只有一份解释；
- **store 边界**：store 只放跨页共享的东西（bootstrap / settings / 刷新函数）。
  当前在哪一页、筛选、选中项一律放 URL（路由 + searchParams）——刷新、分享、后退
  天然可用。往 store 里加「当前视图」是在手写一个功能不全的 router。

> 对应文件：`src/web/frontend/app/{layouts,nav}.ts` · `app/shells/*` · `store.tsx`

### 7.3 生成的 apiclient（前端怎么调 action）

```ts
// src/web/frontend/pages/home/api.ts
import { api } from '../../api/client.js';
import { createApiClient, type Transport } from '../../api/client.generated.js';

// 手写的那一半：传输层适配（api() 已拆好错误信封与超时）
const request: Transport['request'] = (method, path, body) => api(path, { method, body });

const generated = createApiClient(request);
await generated.greet({ name: '世界', loud: false });   // 类型来自 zod schema
```

- `client.generated.ts` **入库**（生成物随模板带出），由 `pnpm gen:api` 刷新，
  `tests/unit/api-client.test.mjs` 与当前 registry **逐字节对账**——改了声明忘了
  重新生成，当场红；
- 方法名取 action id 末段，撞名自动加模块前缀（`setting.get` → `get`，
  `skill.get` 撞名 → `skillGet`）；
- **返回类型 = 实现类型**：`Awaited<ReturnType<InstanceType<typeof GreetAction>['greet']>>`，
  从 action 类 type-only 引用（zod 运行时不进浏览器包；运行时校验只有服务端入参这一道）。
  实现即契约——handler 改返回值，前端类型跟着变，不存在两份声明漂移；

> 对应文件：`src/web/frontend/api/client.generated.ts` · `src/runtime/codegen.ts` · `scripts/gen-api-client.mjs`

### 7.4 样式：assets 四层

| 文件 | 内容 | 谁可以改 |
| --- | --- | --- |
| `assets/tokens.css` | 设计变量（颜色/尺寸/圆角/阴影），light/dark/auto | 换肤改这里 |
| `assets/base.css` | 原子类（按钮/卡片/行/标签/弹窗…） | 各项目高度一致，改前三思 |
| `assets/shells.css` | 版式（头部/侧栏/栅格） | 随项目自由改 |
| `assets/features.css` | 页面专属样式（分段注释标页面名） | 多页共用后升格进 base.css |

**颜色一律引用 token，不写死色值**；`tokens.css` 里没有的字面色值不许出现在别处。

> 对应文件：`src/web/frontend/assets/*.css`

---

## 8. 存储与设置

- `core/store.ts` 的 **`JsonStore` 类**：用户目录 `~/.<name>/store.json` 单文件 JSON。
  - **原子写**（临时文件 + rename，进程中断不损坏）；
  - **进程内缓存 + mtime 失效**（CLI 改了文件，Web 服务侧立刻可见）；
  - `mutate(fn)` 读-改-写事务（greet 计数并发不丢、抛错不写半个事务）；
  - 业务服务经**构造注入**拿到它（测试可传临时路径的实例）；
- 结构由 `initialState()` 决定，`normalize` 自动给老数据补默认值——**不需要迁移脚本**；
- 环境变量 `<NAME>_STORE` 覆盖存储路径（测试用，不写脏用户数据）；
- **设置的关键边界**：后端**不存页面清单、不校验页面 id 存在性**。
  「有哪些页」是前端路由树的事实；后端只保存「怎么摆」并校验**形状**
  （`navGroups` 得是 `[{title, views}]`、跨组重复拒绝——那是摆法本身的矛盾）。
  于是加/删页面不需要动后端，删页也不会让整份导航配置失效。

> 对应文件：`src/core/store.ts` · `src/modules/home/service.ts`

---

## 9. 开发与运行

| 命令 | 作用 | 要点 |
| --- | --- | --- |
| `pnpm dev` | vite + 后端 tsx 直跑源码 | 后端端口**先谈定再起进程**：占用者是自己就复用，是别人就顺延；vite 代理目标跟着后端实际端口走 |
| `pnpm start` | 构建并启动面板 | 先 build 再 serve |
| `pnpm gen:api` | 生成前端 apiclient + 命令树快照 | build/typecheck 已前置，但**入库的产物**靠新鲜度测试兜底 |
| `pnpm link:local` | 把全局 `<name>` 启动器覆盖为转发器 | 改码即生效不发版；原件备份到 `~/.<name>/dev/backups.json`，`unlink:local` 还原 |
| `pnpm test` | lint + typecheck + build + smoke + unit | 见 §10 |

**端口占用处理**（serve 与 dev 同口径）：上面已经是本项目的面板 → 直接打开浏览器，
不重复启动；是别的服务 → 顺延到下一个空闲端口再起自己的面板。两种情况都会开浏览器，
`NX_SERVE_NO_OPEN=1` 全局关掉。

> 对应文件：`scripts/{dev,gen-api-client,link-local}.mjs` · `src/core/serve-port.ts`

---

## 10. 质量闸门

| 闸门 | 拦什么 |
| --- | --- |
| eslint `max-lines` 400 / `max-file-chars` 15000 | 单文件膨胀（按有效代码计，跳过空行与注释） |
| eslint 分层规则 | core 不得依赖 modules/runtime/web；`src/web/**` 只准跑在浏览器（禁 `node:*` 与 Node 侧值导入，目录级、零配置） |
| `tests/unit/layering.test.mjs` | `src/modules/<域>` 之间不得互相值依赖（**解析真实路径**判定，不枚举——枚举会随新模块过期） |
| `tests/unit/routes.test.mjs` | 每个 `routes/<名>.ts` 都有 `pages/<名>/index.tsx`、path 唯一、page 是函数 |
| `tests/unit/api-client.test.mjs` | 生成物与 registry 逐字节一致；每条带 http 的 action 都有方法；布尔归一化不被翻转 |
| `tests/unit/registry.test.mjs` | 模块目录与注册表一一对应；**非 GET 操作必须有面板入口**（前端引用了 action id 或路由路径） |
| `tests/smoke.mjs` | 真实进程跑 CLI（11 条）：greet 落盘计数、setting 往返、skill 安装、help 主题是位置参数、错误码与退出码 |

`pnpm test` = lint → typecheck → build（含 gen:api）→ smoke → unit。
生成项目实测：**smoke 11 条 + unit 50 条 = 61 条断言全绿**，CI 另跑 Node 20/22 双版本。

---

## 11. 随包 skill 与安装钩子

| 资产 | 面向 | 作用 |
| --- | --- | --- |
| `assets/<name>/SKILL.md` | **用**本项目的人/agent | serve / routes / health / skill install 常用命令、端口行为、典型会话；权威清单看 `routes --json` |
| `assets/<name>/hooks.json` | 安装钩子总线 | `skill:pre-install` 注册 `install/inject-root.mjs` |
| `assets/<name>/install/inject-root.mjs` | 安装期 | cwd 的 package.json name 不匹配 → `{block}` 拒绝安装；匹配 → 注入 `PROJECT_ROOT` |
| `assets/groups.json` | `skill install --group` | group 别名表 |
| `.claude/skills/dev-<letters>/` | **改**本项目的人/agent | 开发者指南：代码地图、约束红线、A01「加一个页面」分步清单 |

分工：`<name>` 管运行面，`dev-<letters>` 管开发面。

---

## 12. logo 生成

`tools/logo-gen/index.mjs`：零依赖纯 JS——SVG（真实字体，任意尺寸清晰）+
PNG（内置 5x7 点阵字模 + zlib）+ ICO 容器，7 套撞色方案。
放在模板自己的 tools/ 而非生成器核心：logo 是**这个模板的偏好**，通用生成器只认识
「文件」不认识「图片」（由 `afterGenerate` 调用）。

**已知局限**：点阵 PNG 只适合 1~3 个字母，4~5 字母请用 SVG 或引入字体光栅化。

---

## 13. 扩展指南

### 13.1 加一个 action

1. 在所属域的 `schemas.ts` 加一对契约常量（命名 `<camelCase(actionId)>Input/Output`）；
2. 新建 `actions/<名>.ts`——类继承 `ActionBase`，方法标 `@action`，实现同文件：
   ```ts
   export class PingAction extends ActionBase {
     @action({ id: 'home.ping', cli: ['ping'], http: ['GET', '/api/ping'],
               input: homePingInput, output: homePingOutput, render: (r) => r.pong })
     async ping(_ctx: z.output<typeof homePingInput>) { return { pong: 'pong' }; }
   }
   ```
   依赖经容器取：`this.deps.get<JsonStore>('store')`；
3. `pnpm gen`（清单 + 前端 apiclient）——**别忘**，新鲜度测试会红；
4. 跑 `pnpm test`。**模块 `index.ts` 不需要改**（清单自动收编）。

### 13.2 加一个业务域

`src/modules/<域>/{actions/,schemas.ts,index.ts}` → 在 `runtime/registry.ts` 的
`Registry.create([...])` 里加一个模块实例 → `tests/unit/registry.test.mjs` 会要求
模块目录与注册表一一对应（漏登记直接红）。域内再加 action 不用改这两个文件。

### 13.3 加一个页面

新建 `routes/<名>.ts` + `pages/<名>/index.tsx`（详见模板自带
`.claude/skills/dev-<letters>/references/A01-加一个页面.md`）：零全局登记；
筛选/分页/选中放 `useSearchParams()` 不放 useState；页面私有组件放
`pages/<名>/components/<名>/`；跨页面复用的进全局 `components/<名>/`。

### 13.4 加一种版式

`app/shells/<x>-shell/index.tsx`（内含 `<Outlet />`，导航用 `useNav()`）+
`app/layouts.ts` 加一行 + 路由声明写 `layout: '<x>'`。既有页面零改动。

### 13.5 改样式

颜色/尺寸 → `assets/tokens.css`；原子类 → `assets/base.css`（三思）；
版式 → `assets/shells.css`；页面专属 → `assets/features.css`。

---

## 14. 设计红线与已知债

**红线**（改代码前先看）：

1. action 只有一条声明通道：`@action` + zod 契约；
2. CLI 与 HTTP 共用同一份契约与同一套归一化；
3. 前后端唯一连接点是 action 契约；`src/web` 只准 `import type` 引用 Node 侧；
4. 前端不存「当前在哪一页」——URL 就是状态；
5. 后端不存页面清单——settings 只存摆法；
6. 路由唯一真相是文件系统；壳清单（layouts.ts）是唯一的全局版式登记点；
7. core 是最底层；域之间互不依赖（由测试解析真实路径判定，不枚举）；
8. 颜色一律引用 token；
9. serve 端用类组织：action 类继承 ActionBase，依赖经 IoC 容器取，模块只做装配；
   **一条 action 一个文件**（`actions/<名>.ts`），加 action 零登记（`pnpm gen`）；
10. 无状态纯函数保持模块级；模板文件里**不许出现裸 `{{ }}`**（连 eslint 消息都不行）。

**已知债**（单通道放大的部分）：

| 债 | 兜底 |
| --- | --- |
| 编译期装载查重不存在（曾有 RegistryChecks / ParamsCovered） | `Registry.create` 运行时自检 + 「非 GET 必须有面板入口」测试 |
| handler 入参手写 `z.output<typeof schema>` | 无——装饰器改不了方法签名 |
| zod `_zod.def` 内部 API | 集中在 `runtime/zod-bridge.ts` 一个文件 |
| eslint `action-parity` 已删（扫不到装饰器声明） | 运行时 parity + 面板入口测试 |
| `render` 回调参数是 `any` | eslint 对 any 仅警告 |
| IoC 依赖按 key 取（`deps.get('store')`） | `DependencyMap` 接口约束 key 与值类型，拼错编译期红 |

> 完整评估与决策记录：仓库内 `plan/2026-11-10-zod装饰器下沉-server-cli-web验证.md`

---

## 15. 速查

```bash
# 生成 / 运行
nx-nx template create server-cli-web --letters zz --dir ../nx-zz
cd ../nx-zz && pnpm install && pnpm dev
pnpm start && pnpm test && pnpm gen:api

# 常用 CLI（生成项目里）
nx-zz routes --json          # CLI ↔ HTTP 对照表（13 条）
nx-zz greet 世界 --json
nx-zz setting set --set 'navGroups=[{"title":"求职","views":["home"]}]'
nx-zz skill install --all

# 本机工具 nx-nx 自身
nx-nx template list / describe server-cli-web / preview server-cli-web --letters zz
node bin/nx-nx.mjs routes    # nx-nx 自己的命令表
```

**文件索引（按职责）**

| 我想改… | 去改 |
| --- | --- |
| 命令/接口的契约 | `src/modules/<域>/schemas.ts` |
| 声明一条 action（声明+实现） | `src/modules/<域>/actions/<名>.ts` |
| 域内共享规则（设置项校验等） | `src/modules/<域>/<规则>.ts` |
| action 清单（自动注册产物） | `src/modules/<域>/actions/_manifest.generated.ts` |
| IoC 容器与 action 基类 | `src/runtime/container.ts` · `src/runtime/action-base.ts` |
| 参数归一化规则 | `src/runtime/zod-bridge.ts` |
| CLI 解析/渲染 | `src/runtime/cli.ts` |
| HTTP 路由/错误映射 | `src/runtime/api.ts` · `src/core/errors/index.ts` |
| 路由与页面 | `src/web/frontend/routes/` · `pages/` |
| 导航与壳 | `src/web/frontend/app/` |
| 样式 | `src/web/frontend/assets/` |
| 前端调用 action | `src/web/frontend/pages/<页>/api.ts` |
| 生成物 | `src/runtime/codegen.ts` · `scripts/gen-api-client.mjs` |
| 存储 | `src/core/store.ts` |
