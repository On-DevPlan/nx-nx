---
name: dev-{{letters}}
description: {{name}} 的开发者 skill（项目级，.claude/skills/dev-{{letters}}）——修改 {{name}} 的 TypeScript 源码、加 action/模块/路由/页面、调 CLI 与面板、排障、跑测试与发版时使用。触发词：开发 {{name}}、改 TS 代码、加 action、加模块、加页面、加路由、改面板、类型错误、排障、pnpm test、发版。运行面使用（启动面板、执行 CLI）请用主 skill `{{name}}`；本 skill 只管"改这个项目本身"。
---

# dev-{{letters}} — {{name}} 开发者指南

**代码是唯一真相**：本 skill 的路径与命令以仓库当前代码为准；改完代码后同步更新对应 ref。

## 路由（先看这里）

主文档只做路由，场景细节一律放 `references/`。新增主题时：先建
`references/<A|B|C><两位序号>-<主题>.md`，再在下面表格加一行。

| 代号 | 干什么时读 | 一句话 |
| --- | --- | --- |
| `A01` | 加页面 / 改导航 / 加一种版式 / 改面板路由 | 新建 `routes/<名>.ts` + `pages/<名>/index.tsx` 即完成登记，零全局改动 |

## 序列约定

- **A 序列 = 关键操作流程**：拿命令照抄就能干（开发、测试、构建、发布、排障）
- **B 序列 = 关键设计与代码**：为什么这样设计、边界在哪、改哪里会牵动谁
- **C 序列 = 验证与发布**：改完怎么证明没坏、怎么构建与发版

## 项目事实（改代码前先确认）

- 架构：一条 action 同时派生 CLI 命令与 HTTP 路由；Web 上能做的，CLI 都能做
- **action 有两条声明通道**（在同一张注册表汇合）：
  - `@action` 装饰器（zod schema 即契约，试点=home 模块）：方法上标注解，
    `src/modules/home/schemas.ts` 放契约常量（命名约定 `<camelCase(actionId)>Input/Output`），
    `pnpm gen:api` 刷新 `src/web/frontend/api/client.generated.ts`（前端 apiclient，
    新鲜度由 `tests/unit/api-client.test.mjs` 对账）。债：`:param ⊆ args` 检查降级为
    运行期；handler 入参手写 `z.output<typeof schema>`
  - `defineAction` builder（skill 模块在用）：编译期全检查（ParamsCovered / 装载查重）
  - 完整评估见 nx-nx 仓库的 plan/2026-11-10-zod装饰器下沉-server-cli-web验证.md（生成项目不含）；新域二选一，不要混用
- 命令（项目根执行）：
  - `pnpm dev` —— vite + 后端 tsx 直跑源码，改码即生效
  - `pnpm typecheck` —— 只跑类型检查
  - `pnpm test` —— lint（含行数/字符数限制）+ typecheck + build + smoke + unit
  - `pnpm start` —— 构建并启动面板
- 代码地图（**前后端是两条目录线，不是同一个模块目录里的两半**）：
  - `src/runtime/` —— CLI / HTTP / 路由注册与参数校验；`types/` 是 action 与模块的类型契约
  - `src/core/` —— 存储（JsonStore 类）、路径、端口等通用能力（Node 侧）
  - `src/modules/` —— **后端**业务模块：`index.ts` 声明 actions，`service.ts` 写业务
    （服务用类组织，store 经构造注入）。**不包含任何 tsx**
  - `src/web/frontend/routes/` —— 路由声明：一条路由一个 `<名>.ts`（`contract.ts` 是公共契约，
    页面发现时被排除）
  - `src/web/frontend/pages/<名>/` —— 页面本体：`index.tsx`（组件，默认导出）+
    私有 `api.ts`（本页 action 调用收口）与 `components/<名>/index.tsx`（页面私有组件）
  - `src/web/frontend/components/<名>/index.tsx` —— 跨页面复用组件，**一组件一目录**
    （纯模型如 nav-model 也是这个形式；只有多个页面都用才放这里）
  - `src/web/frontend/assets/` —— 样式资产：`tokens.css`（设计变量，颜色一律引用 token）、
    `base.css`（原子类）、`shells.css`（版式）、`features.css`（页面专属样式）
  - `src/web/frontend/app/` —— 装配层：`pages.ts`（扫描 routes/ 自动发现）、`router.tsx`、
    `nav.ts`（导航计算）、`layouts.ts`（壳清单）、`shells/<名>/index.tsx`（布局壳）
  - `assets/{{name}}/` —— 随包分发的使用 skill（面向"用本项目"，不是"改本项目"）
  - `tests/` —— smoke 与 unit（`routes.test.mjs` 对账路由声明与页面目录一一对应）

## 约束

- **加一个页面 = 新建两个文件**，不需要改任何全局文件：
  `src/web/frontend/routes/<名>.ts`（路由声明）+ `src/web/frontend/pages/<名>/index.tsx`（组件）。
  路由由 `import.meta.glob` 自动发现，路由 id 就是文件名。详见 `references/A01-加一个页面.md`。
- **只改后端不需要动前端、只改前端不需要动后端**：两者唯一的连接点是 action 契约
  （`src/modules/*/index.ts` 声明、`runtime/types/` 定型）。页面通过 typed client 调 action，
  类型引用用 `import type`，禁止值导入 Node 侧。
- **前端不存"当前在哪一页"**：路由与 `searchParams` 就是状态。别往 store / localStorage
  里加"当前视图"这类字段——那是手写一个功能不全的 router。
- **样式写进 assets/**：颜色一律引用 `tokens.css` 的变量，不在 tsx 内联写死色值；
  页面专属样式进 `features.css`（分段注释），多个页面共用后升格进 `base.css`。
- **组件以 `components/<名>/index.tsx` 目录形式组织**：页面私有组件放
  `pages/<名>/components/<名>/`，跨页面复用放全局 `components/`；可复用逻辑优先抽成
  纯函数 / 纯模型（如 nav-model），可单测。
- **特殊版式 = 加一个壳目录**：`app/shells/<x>-shell/index.tsx` + `app/layouts.ts` 加一行，
  页面路由声明写 `layout: '<x>'`。既有页面零改动。
- **serve 端业务服务用类组织（OOP）**：有状态的能力（store、服务）用类 + 构造注入，
  模块 export 组装好的单例；无状态的纯函数（校验 coerce、渲染 render）保持模块级。
  action 装配层保持 defineAction 声明式——那是类型系统的基础，不要类化。
- 新增 action 必须同时声明 `cli` 与 `http`；确属纯 CLI（`serve` / `server` / `skill` 前缀之外）要写 `http: null, web: false`——`local/action-parity` 与启动期注册表都会拦
- **不要给"只是给面板拉个列表"的读接口硬凑 CLI 命令**：先想清楚它是不是该做成 action。
  纯展示数据（静态文案、前端路由推导出的清单）不需要 action。
- 类型契约优先改 `src/runtime/types/`，再改实现；不要让实现反推类型
- 动 CLI/HTTP 契约时同步 `tests/`，并确认 `routes` 输出一致
- 后端**不存页面清单**：`setting` 只保存"怎么摆"（分组 / 隐藏 / 顺序），不校验页面 id 存在性
- 与主 skill `{{name}}` 分工：`{{name}}` 管运行面，`dev-{{letters}}` 管开发面
