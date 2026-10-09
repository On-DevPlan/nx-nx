# mono-gf —— GoFrame mono-repo 全栈骨架

生成一个**开箱能跑**的全栈 mono-repo：GoFrame v2 后端 + PostgreSQL + React 面板 + nginx 前置。

与其他模板的区别：`server-cli-web` 系列是「本机小工具」（CLI 与面板同源、状态落本机文件），
这个是**标准 Web 应用**（服务端 + 数据库 + 反向代理），面向需要多人访问、要落库的场景。

## 生成

```bash
nx-nx template create mono-gf --name my-app
# 或者面板里选「mono-gf 全栈骨架」
```

生成后按 nextSteps 走即可：

```bash
cp .env.example .env              # 可选
docker compose up -d pg           # 起 PostgreSQL
make run                          # 起 Go API
cd web && npm i && npm run dev    # 起面板
```

`go.sum` 随模板提供，生成后直接可 `go build`；改了依赖再 `make tidy`。

## 选项

| 选项 | 说明 |
|---|---|
| `name` | 项目名（必填）。决定目录名、Go module 后缀、容器名、库名与环境变量前缀 |
| `goModule` | Go module 路径，留空则 `github.com/example/<name>` |
| `apiPort` / `webPort` | Go API / nginx 的端口，留空自动探测空闲端口 |
| `pgHost` / `pgPort` / `pgDatabase` / `pgUser` / `pgPassword` | 数据库参数；`pgPort` 刻意不探测（本机已有 PG 时应该连它） |

## 设计取舍（为什么长这样）

- **一个 go.mod，多个 app/**：升级 GoFrame 只改一处。新增应用不用动根配置。
- **入口在 `app/server/` 而不是仓库根**：Go 的 internal 规则决定的 ——
  根目录的 `main.go` import 不到 `app/server/internal`。
- **`/api` 前缀在 vite proxy 与 nginx 两处剥离，且规则必须一致**：
  不一致的症状是「本地好、上线 404」。nginx 里 `proxy_pass` 结尾的 `/` 不能省。
- **不配 CORS**：前端走「同源 + 反代」，同源就不需要 CORS，
  也就不存在「预检放行了但 Cookie 没带」这类半好不坏的状态。
- **GoFrame 自带面板只在开发配置里开**：`/swagger` 好用，但生产多一个入口多一份暴露面。
- **`manifest/config/` 两份**：`config.yaml`（本机开发，开面板、开 SQL 日志）
  与 `config.docker.yaml`（容器，关面板、关 SQL 日志、数据库指向服务名 `pg`）。
- **`.env` 全部写成 `${VAR:-默认值}`**：不建 `.env` 也能 `make up`。

## 后续可加

- 前端 eslint（带分层/体积约束，与 `server-cli-web-ts` 同款）
- 一个 `job` 应用示例（mono 里的定时任务）
- 数据库迁移目录约定（`db/migrations/`）
- 本 skill（让 agent 学会用它）—— 本模板暂未随包发 skill
