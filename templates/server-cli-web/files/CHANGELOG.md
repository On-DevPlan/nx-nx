# Changelog

本文件记录对外可见的变更。格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

- 新条目写在文件最上面；尚未发版的收进 [Unreleased]，发版时改成 `版本号 - 日期`（YYYY-MM-DD）
- 条目按 Added / Changed / Deprecated / Removed / Fixed / Security 分组，没有的组不写
- 只记对外可见的变更：CLI 命令行为、HTTP API、配置项、依赖与安全；内部重构不记

## [Unreleased]

### Added

- **action 层泛型化**：action 类继承 `ActionBase<typeof input>`，handler 统一
  `override run(ctx: ActionInput<this['_input']>)`——入参类型由基类泛型推导
  （不再手写 `z.output`），出参由实现推断（实现即契约）。
- **契约内联**：每条 action 的 zod schema 收进自己的文件；删除模块级 `schemas.ts`。
- **字段级描述**：每个输入字段可带 `.describe()`，命令帮助的「参数:」段逐字段
  渲染含义；缺描述在测试期即红。
- **OpenAPI 文档**：`GET /api/api-docs`（CLI `api doc`）从 action 声明自动生成
  OpenAPI 3.1；面板新增「API 文档」页，Swagger UI 不可达时降级为内置渲染。
- **变更通知**：数据写入即推送通知——`GET /api/events`（SSE，别名 `watch`；
  CLI 等价 NDJSON），面板据此自动刷新。
- **跨域支持**：标准 CORS 头与 OPTIONS 预检；`serve --allow-origin <来源>` 收紧来源。
- **命令行别名**：一条命令支持多个路径（如 `events` 与 `watch`），帮助里列出别名。
- **行数门禁**：`pnpm check:lines` —— ≤600 干净 / 601-800 必须登记 / >800 严禁。
- 初始骨架：TypeScript 版骨架，自带编译期类型安全系统（由 nx-nx 的 `server-cli-web` 模板生成）。
- 前端真实路由树：`src/web/frontend/routes/<名>.ts` 一页一份路由声明 + `pages/<名>/index.tsx` 页面本体，路由由 `import.meta.glob` 自动发现；加页面不需要改任何全局文件。
- 可插拔布局壳：`app/shells/` 下每个壳是一个文件，`app/layouts.ts` 加一行即可；出厂只登记左侧栏壳（默认），页面 `route.ts` 用 `layout` 字段选择别的壳。特殊版式不再需要重写面板。
- 页面级错误边界与加载态：页面崩溃只影响内容区，导航仍可用。
- 路由参数（`/board/:id`）与「不写 `nav` 就不进导航」的详情页约定。

### Changed

- 纯 CLI 命令的路由声明改为显式 `http: null`；不写（缺省）在装载期报错。
- 页面不再登记在后端：删除 `core/views.ts`、`web/frontend/registry.ts` 与三方对账测试；页面清单的唯一来源是 `routes/*.ts`。
- `GET /api/settings` 不再返回 `views`；`setting` 只保存「怎么摆」（分组 / 隐藏 / 顺序），不再校验页面 id 是否存在。
- `src/modules/` 变为纯 Node 侧（不再含 `view.tsx` / `navManager.tsx`），前端页面整体迁到 `src/web/frontend/{routes,pages}/`。
- eslint 分层规则改为**目录级**（`src/web/**` 禁 `node:*`、禁值导入 Node 侧），新增页面/模块不再需要改 lint 配置；模块互不依赖改由 `tests/unit/layering.test.mjs` 解析真实路径判定。
- `kv` / `json` 类型 flag 的入参不再只收字符串，typed client 因此可以完整覆盖 `setting.set`。
- 导航摆法只存后端 settings：页面不再往 store / localStorage 里塞导航或筛选状态；只有壳的展示偏好（侧栏宽度、收起、分组折叠）留在 localStorage。
- 跨域策略不再按 Origin 主机名拒绝写请求：改用标准 CORS 头 + 预检，避免走内网
  穿透访问自己面板时被误判跨站。**安全边界**：面板只绑 127.0.0.1，暴露到公网时
  真正的边界是隧道自身的访问控制。

### Removed

- 顶栏壳（`app/shells/app-shell/`）：出厂没有任何路由挂到它下面，属于不可达代码；
  出厂只登记左侧栏壳。新增版式仍是「加壳目录 + `app/layouts.ts` 一行 + route 写 `layout`」。

### Fixed

- 面板开着时 Ctrl+C 退不掉：`server.close()` 会等已有连接自行断开，而面板常驻的
  SSE 长连不会自断，回调永远等不到。关停改为先 `closeAllConnections()` 再等 close
  （`runtime/server.ts#shutdownServer`），并补了「有活跃 SSE 时关停必须及时结束」的回归测试。
