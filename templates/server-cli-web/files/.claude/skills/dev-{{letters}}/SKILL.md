---
name: dev-{{letters}}
description: {{name}} 的开发者 skill（项目级，.claude/skills/dev-{{letters}}）——修改 {{name}} 的 TypeScript 源码、加 action/模块/页面、调 CLI 与面板、排障、跑测试与发版时使用。触发词：开发 {{name}}、改 TS 代码、加 action、加模块、加页面、改面板、类型错误、排障、pnpm test、发版。运行面使用（启动面板、执行 CLI）请用主 skill `{{name}}`；本 skill 只管“改这个项目本身”。
---

# dev-{{letters}} — {{name}} 开发者指南

**代码是唯一真相**：本 skill 的路径与命令以仓库当前代码为准；改完代码后同步更新对应 ref。

## 路由（先看这里）

主文档只做路由，场景细节一律放 `references/`。新增主题时：先建
`references/<A|B|C><两位序号>-<主题>.md`，再在下面表格加一行。

| 代号 | 干什么时读 | 一句话 |
| --- | --- | --- |
| `A01` | 加页面 / 改导航 / 加一种版式 / 改面板路由 | 新建 `views/<名>/` 目录即完成登记，零全局改动 |

## 序列约定

- **A 序列 = 关键操作流程**：拿命令照抄就能干（开发、测试、构建、发布、排障）
- **B 序列 = 关键设计与代码**：为什么这样设计、边界在哪、改哪里会牵动谁
- **C 序列 = 验证与发布**：改完怎么证明没坏、怎么构建与发版

## 项目事实（改代码前先确认）

- 架构：一条 action 同时派生 CLI 命令与 HTTP 路由；Web 上能做的，CLI 都能做
- 命令（项目根执行）：
  - `pnpm dev` —— vite + 后端 tsx 直跑源码，改码即生效
  - `pnpm typecheck` —— 只跑类型检查
  - `pnpm test` —— lint（含行数/字符数限制）+ typecheck + build + smoke + unit
  - `pnpm start` —— 构建并启动面板
- 代码地图（**前后端是两条目录线，不是同一个模块目录里的两半**）：
  - `src/runtime/` —— CLI / HTTP / 路由注册与参数校验；`types/` 是 action 与模块的类型契约
  - `src/core/` —— 存储、路径、端口等通用能力（Node 侧）
  - `src/modules/` —— **后端**业务模块：`index.ts` 声明 actions，`service.ts` 写业务。**不包含任何 tsx**
  - `src/web/frontend/app/` —— 路由树（`router.tsx` / `pages.ts`）、导航计算（`nav.ts`）、布局壳（`shells/`）
  - `src/web/frontend/views/` —— **前端**页面：一页一个目录（`route.ts` + `page.tsx` + 私有 `components/`）
  - `src/web/frontend/components/` —— 跨页面复用的组件（只有多个页面都用才放这里）
  - `assets/{{name}}/` —— 随包分发的使用 skill（面向“用本项目”，不是“改本项目”）
  - `tests/` —— smoke 与 unit

## 约束

- **加一个页面 = 新建一个目录**，不需要改任何全局文件：
  `src/web/frontend/views/<名>/{route.ts,page.tsx}`。路由由 `import.meta.glob` 自动发现，
  页面 id 就是目录名。详见 `references/A01-加一个页面.md`。
- **只改后端不需要动前端、只改前端不需要动后端**：两者唯一的连接点是 action 契约
  （`src/modules/*/index.ts` 声明、`runtime/types/` 定型）。页面通过 typed client 调 action，
  类型引用用 `import type`，禁止值导入 Node 侧。
- **前端不存“当前在哪一页”**：路由与 `searchParams` 就是状态。别往 store / localStorage
  里加“当前视图”这类字段——那是手写一个功能不全的 router。
- **特殊版式 = 加一个壳文件**，不是重写壳：`app/shells/<X>Shell.tsx` + `app/layouts.ts` 加一行，
  页面 `route.ts` 写 `layout: '<x>'`。既有页面零改动。
- 新增 action 必须同时声明 `cli` 与 `http`；确属纯 CLI（`serve` / `server` / `skill` 前缀之外）要写 `http: null, web: false`——`local/action-parity` 与启动期注册表都会拦
- **不要给“只是给面板拉个列表”的读接口硬凑 CLI 命令**：先想清楚它是不是该做成 action。
  纯展示数据（静态文案、前端路由推导出的清单）不需要 action。
- 类型契约优先改 `src/runtime/types/`，再改实现；不要让实现反推类型
- 动 CLI/HTTP 契约时同步 `tests/`，并确认 `routes` 输出一致
- 后端**不存页面清单**：`setting` 只保存“怎么摆”（分组 / 隐藏 / 顺序），不校验页面 id 存在性
- 与主 skill `{{name}}` 分工：`{{name}}` 管运行面，`dev-{{letters}}` 管开发面
