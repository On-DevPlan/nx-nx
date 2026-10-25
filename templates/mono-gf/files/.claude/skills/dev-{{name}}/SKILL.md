---
name: dev-{{name}}
description: {{name}} 的开发者 skill（项目级，.claude/skills/dev-{{name}}）——修改 {{name}} 的 GoFrame 后端、React 面板、数据库与 nginx 配置，加接口/页面/表、排障、构建与部署时使用。触发词：开发 {{name}}、改 Go 代码、加接口、加页面、加表、改 nginx、排障、make run、docker compose。本 skill 只管“改这个项目本身”。
---

# dev-{{name}} — {{name}} 开发者指南

**代码是唯一真相**：本 skill 的路径与命令以仓库当前代码为准；改完代码后同步更新对应 ref。

## 路由（先看这里）

主文档只做路由，场景细节一律放 `references/`。新增主题时：先建
`references/<A|B|C>-<主题>.md`，再在下面表格加一行。

| 代号 | 干什么时读 | 一句话 |
| --- | --- | --- |
| _（待补）_ | 首个开发主题出现时补第一行 | 命名示例：`A-本地开发.md` / `B-代码地图.md` / `C-验证发布.md` |

## 序列约定

- **A 序列 = 关键操作流程**：拿命令照抄就能干（开发、测试、构建、发布、排障）
- **B 序列 = 关键设计与代码**：为什么这样设计、边界在哪、改哪里会牵动谁
- **C 序列 = 验证与发布**：改完怎么证明没坏、怎么构建与发版

## 项目事实（改代码前先确认）

- 技术栈：GoFrame v2 + PostgreSQL + React + nginx，mono-repo（一个 `go.mod`，多个 `app/`）
- 命令（项目根执行）：
  - `docker compose up -d pg` —— 只把数据库放容器里
  - `make run` —— 本机起 Go API（:{{apiPort}}）
  - `cd web && npm install && npm run dev` —— 起 React 面板（vite 已代理到 API）
  - `make check` —— gofmt + go build + 前端类型检查（提交前闸门）
  - `make build` / `make build-web` —— 编译后端 / 构建前端产物
  - `make up` / `make down` / `make logs` / `make psql` —— 整栈容器化
  - `make dao` —— 按现有库表生成 dao/do/entity（读 `hack/config.yaml`）
- 代码地图：
  - `app/server/api/` —— 接口契约（路由 + 校验 + 文档的唯一真相源）
  - `app/server/internal/` —— `cmd` 装配、`controller`、`logic`、`model/entity`、`consts`
  - `app/server/main.go` —— 入口（必须在 `app/server/` 下，否则 import 不到 internal）
  - `manifest/config/` —— `config.yaml` 本机开发 / `config.docker.yaml` 容器
  - `db/schema.sql` —— 建表 + 种子（容器首次启动自动执行）
  - `web/` —— React 面板 + `nginx.conf` + 前端 Dockerfile
  - `hack/config.yaml` —— `make dao` 的生成配置

## 红线（违反 = 本地好、上线坏）

- `/api` 前缀在**两处**被剥掉：开发期 `web/vite.config.ts` 的 proxy rewrite、
  生产期 `web/nginx.conf` 里 `proxy_pass` 结尾的 `/`。两处规则必须一致。
- GoFrame 的 `g.Cfg().Get` **不读环境变量**，只有 `GetWithEnv` / `GetEffective` 会查
  `GF_` 前缀；要覆盖配置就改 `manifest/config/` 或挂载整个目录。
- Go 的 `internal/` 可见性决定入口位置：入口留在 `app/server/`，不要挪到仓库根。
- `/swagger` 与 `/api.json` 只在开发配置里开；生产多一个入口就多一份暴露面。

## 约束

- 新增能力照现有分层放置：契约进 `api/`，业务进 `logic/`，controller 只做转换
- 改表结构时同步 `db/schema.sql` 与 `model/entity/`，再跑 `make dao`
- 本 skill 只管“改本项目”；给使用者的运行说明以 `README.md` 为准
