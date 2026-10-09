# {{name}}

{{description}}

由 nx-nx 的 `mono-gf` 模板生成。技术栈：**GoFrame v2 + PostgreSQL + React + nginx**，
mono-repo 布局（一个 `go.mod`，多个 `app/`）。

---

## 快速开始

```bash
cp .env.example .env      # 可选：不改也能跑（compose 里每个变量都有默认值）

# 方式一：本地开发（推荐）
docker compose up -d pg   # 只需要数据库在容器里
make run                  # Go API → http://127.0.0.1:{{apiPort}}
cd web && npm install && npm run dev   # 面板 → http://127.0.0.1:5173

# 方式二：整栈容器化
make up                   # pg + api + nginx → http://127.0.0.1:{{webPort}}
```

`go.sum` 已随模板提供，生成后直接就能 `go build`。改了依赖再跑 `make tidy` 更新它。

打开面板能看到「概览」（后端连通性）与「用户管理」（真实读写 PostgreSQL 的 `t_user`）。

---

## 目录结构

```
app/server/                 # 唯一的 HTTP 应用（mono 可以有多个 app）
  api/                      # 接口契约：路由 + 校验规则 + 文档的唯一真相源
    hello/v1/hello.go
    user/v1/user.go
  internal/
    cmd/                    # 装配：配置、路由、启动（顺序可读）
    controller/             # 只做 接参数 → 调逻辑 → 拼 DTO
    logic/                  # 业务与 SQL 的边界
    model/entity/           # 数据实体（跟着表走）
    consts/
  main.go
manifest/config/            # GoFrame 配置（config.yaml 本机开发 / config.docker.yaml 容器）
hack/config.yaml            # `make dao` 的生成配置
db/schema.sql               # 建表 + 种子（容器首次启动自动执行）
web/                        # React 面板 + nginx 配置 + 前端 Dockerfile
docker-compose.yml
```

---

## 几条不能忘的约定

### 1. `/api` 前缀在**两处**被剥掉，规则必须一致

后端路由没有 `/api` 前缀（GoFrame 的 api 契约就是 `/hello`、`/user/list`）。
前端统一按 `/api/xxx` 调用，剥前缀发生在：

- 开发期：`web/vite.config.ts` 的 `proxy.rewrite`
- 生产期：`web/nginx.conf` 里 `proxy_pass http://api:{{apiPort}}/` **结尾那个斜杠**

两处不一致的症状只有一个：**本地好、上线 404**。

### 2. GoFrame 的 `g.Cfg().Get` 不读环境变量

只有 `GetWithEnv` / `GetEffective` 会查 `GF_` 前缀。所以「以为改了环境变量就生效」
在这里是**静默失效**的。要覆盖配置：改 `manifest/config/` 下的文件，或挂载整个目录
（`docker-compose.yml` 就是这么做的）。

### 3. GoFrame 自带的面板只在开发配置里开着

`/swagger` 与 `/api.json` 是从 `api/` 契约自动生成的，很好用，
但**生产环境多一个入口就多一份暴露面** —— `config.docker.yaml` 里已经把它们关掉了。
面板「概览」页有直达链接（仅本机开发时可用）。

### 4. `internal/` 的可见性决定了入口位置

Go 的 internal 规则：`app/server/internal/...` 只能被 `app/server/...` 子树 import。
所以**入口必须在 `app/server/` 下**，根目录放 `main.go` 是 import 不到自己的 internal 的。

### 5. 数据库结构改动

`db/schema.sql` 只负责「从零到当前」。改了表结构不要改历史语句，
新建 `db/migrations/<时间戳>_<说明>.sql` 增量文件，否则别人的库与你的库会悄悄分叉。

容器里的数据卷**首次创建时**才会执行 `schema.sql`；想重来一遍：
`docker compose down -v && docker compose up -d pg`（会删数据）。

---

## 加一个新的业务模块

1. `app/server/api/<模块>/v1/<模块>.go`：写 `<Action>Req/<Action>Res`，用 `g.Meta` 声明路径与方法
2. `app/server/internal/controller/<模块>/<模块>.go`：方法名必须等于 action 名，否则运行期 404
3. `app/server/internal/logic/<模块>/<模块>.go`：SQL 只写在这里
4. `app/server/internal/cmd/cmd.go`：把新控制器加进 `group.Bind(...)`
5. `web/src/pages/`：加页面，调 `/api/<模块>/<action>`

新增 `app/` 下的第二个应用（如后台任务）：建 `app/<名>/main.go` 与它自己的 `internal/`，
根 `go.mod` 不用动 —— 这就是 mono-repo 的意义。

---

## 常用命令

`make help` 列出全部。最常用的：

| 命令 | 作用 |
|---|---|
| `make run` | 本机起 API |
| `make build-web` | 构建前端到 `web/dist` |
| `make dao` | 按库表结构生成 dao/do/entity |
| `make check` | 提交前的廉价闸门（gofmt + go build + 前端类型检查） |
| `make up` / `make down` | 整栈起停 |
| `make psql` | 进数据库 |
