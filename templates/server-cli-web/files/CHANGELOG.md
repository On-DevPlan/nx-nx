# Changelog

本文件记录对外可见的变更。格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

- 新条目写在文件最上面；尚未发版的收进 [Unreleased]，发版时改成 `版本号 - 日期`（YYYY-MM-DD）
- 条目按 Added / Changed / Deprecated / Removed / Fixed / Security 分组，没有的组不写
- 只记对外可见的变更：CLI 命令行为、HTTP API、配置项、依赖与安全；内部重构不记

## [Unreleased]

### Added

- 初始骨架：TypeScript 版骨架，自带编译期类型安全系统（由 nx-nx 的 `server-cli-web` 模板生成）。
- 前端真实路由树：`src/web/frontend/views/<名>/route.ts` 一页一目录，由 `import.meta.glob` 自动发现；加页面不需要改任何全局文件。
- 可插拔布局壳：`app/shells/` 下每个壳是一个文件，`app/layouts.ts` 加一行即可；出厂带顶栏壳与左侧栏壳，页面 `route.ts` 用 `layout` 字段选择。特殊版式不再需要重写面板。
- 页面级错误边界与加载态：页面崩溃只影响内容区，导航仍可用。
- 路由参数（`/board/:id`）与「不写 `nav` 就不进导航」的详情页约定。

### Changed

- 页面不再登记在后端：删除 `core/views.ts`、`web/frontend/registry.ts` 与三方对账测试；页面清单的唯一来源是 `views/*/route.ts`。
- `GET /api/settings` 不再返回 `views`；`setting` 只保存「怎么摆」（分组 / 隐藏 / 顺序），不再校验页面 id 是否存在。
- `src/modules/` 变为纯 Node 侧（不再含 `view.tsx` / `navManager.tsx`），前端页面整体迁到 `src/web/frontend/views/`。
- eslint 分层规则改为**目录级**（`src/web/**` 禁 `node:*`、禁值导入 Node 侧），新增页面/模块不再需要改 lint 配置；模块互不依赖改由 `tests/unit/layering.test.mjs` 解析真实路径判定。
- `runtime/types/client.ts`：`kv` / `json` 类型 flag 的入参不再只收字符串，typed client 因此可以完整覆盖 `setting.set`。
- 当前视图不再存 store / localStorage，改由 URL 决定。
