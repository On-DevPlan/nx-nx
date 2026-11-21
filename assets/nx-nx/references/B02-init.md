---
name: B02-init
description: nx-nx 生成后初始化 SOP——装依赖、跑测试闸门、起面板、项目结构与状态位置；三套模板各自的第一步与故障处置。项目刚生成或初始化失败时读。
---

# B02 · 初始化

## 加载时机

- `template create` 刚完成，准备装依赖 / 跑测试 / 起面板
- 生成的项目 `pnpm install` / `pnpm test` / `pnpm start` 出问题
- 主 SKILL.md 路由到「初始化」场景

## 1. server-cli-web：六步起项目

```bash
cd D:\proj\my-xx
pnpm install
pnpm test                 # lint（含行数 / 字符数限制）+ typecheck + build + smoke + unit
pnpm dev                  # vite + 后端 tsx 直跑源码，改码即生效
pnpm start                # 构建并启动面板
node bin\xx.mjs greet Ada # 与面板同源的 CLI 命令（可加 --loud / --json）
```

- `pnpm test` 是生成项目的完整闸门，基线应当全绿；先过它再开发。
- `pnpm dev` 用于开发（前端热更），`pnpm start` 用于构建后起面板。
- 面板里的路由与 CLI 由同一份 action 声明派生；加功能先看 `.claude/skills/dev-<letters>/`。

### 生成出来的结构

| 路径 | 是什么 |
| --- | --- |
| `bin/<letters>.mjs` | 唯一可执行入口（serve / CLI 都从这里进） |
| `src/core/` | 基础设施：store、paths、open、errors |
| `src/modules/` | 功能域；一条 action 一个文件，`gen:actions` 扫目录生成清单 |
| `src/runtime/` | 装配层：CLI、HTTP、action 注册表 |
| `src/web/frontend/` | Web 面板（左侧导航壳 + 页面 + 主题） |
| `tests/` | smoke + unit，`pnpm test` 的一部分 |
| `assets/<name>/` | 生成项目自带的 skill，可 `skill install` 给 agent 用 |
| `.claude/skills/dev-<letters>/` | 面向开发者的项目内 skill |
| `scripts/` · `tools/` | 开发脚本与代码生成工具 |

### 数据与开关

- 状态默认落 `~/.<项目名>/store.json`（项目名是带前缀的完整名）；环境变量 `<ENV前缀>_STORE` 可整体改路径。
- serve 端口与 vite dev 端口在**创建时**写死；要换端口重新生成或同时改两处配置。
- `NX_SERVE_NO_OPEN=1` 让所有 nx 系列项目 serve 都不自动开浏览器；`--no-open` 只影响本次。
- 项目自带 skill：`node bin/<letters>.mjs skill list` 看，`skill install <name>` 装；`--to` 指定目录，冲突时 `--force`。
- 自检与路由：`node bin/<letters>.mjs health` · `routes`。

## 2. mono-gf：先起数据库，再起 API / 面板

```bash
cd <项目目录>
cp .env.example .env          # 可选；不建也能跑
docker compose up -d pg       # PostgreSQL
make run                      # Go API
cd web && npm install && npm run dev   # 面板（已代理到 API）
docker compose up -d          # 或者整栈容器化：pg + api + nginx
make tidy                     # 改了 Go 依赖后才需要
```

- 端口用生成时的 `apiPort` / `webPort` / `pgPort`；容器与本地开发共用同一套 `.env` 默认值。
- `manifest/config/config.yaml` 是本机开发配置，`config.docker.yaml` 是容器配置；数据库主机在容器里指向服务名 `pg`。
- 改了 Go 依赖记得 `make tidy`，生成时自带的 `go.sum` 能直接 `go build`。
- 该模板没有 server-cli-web 那种 `assets/<name>` 随包 skill；项目内是 `.claude/skills/dev-<name>` 开发 skill，改代码前先读它。

## 3. std-a-lang：只铺目录，按象限填内容

```bash
cd <父目录>
ls                             # a_ts/ a_go/ …（多语言时平级兄弟）
cd a_ts && git init            # 想给哪个起 git 就进哪个目录
```

| 象限 | 放什么 |
| --- | --- |
| `sdk/` | 自研 / 二次封装的 SDK、客户端封装 |
| `proj/` | 该语言下的项目，建议统一前缀（`nx-` / `pg-` / `go-` …） |
| `res/` | 第三方仓库、参考资料、下载资源 |
| `doc/` | 工具链笔记、规范、最佳实践 |

它不生成可运行项目，没有 `pnpm test` / `make run` 这一步；验收就是目录与象限齐全。

## 4. 通用检查

- 目标目录必须为空；非空时生成器直接拒绝，不做合并。
- 必填项按模板：`letters` / `name` / `lang`，不要照抄别的模板的命令。
- 端口在创建时探测；生成后才发现端口冲突，改配置或重新生成。
- 生成项目是**本机单用户工具**（server-cli-web）：状态落本机文件，不做多用户 / 远程部署。

## 5. 初始化故障处置

| 现象 | 处置 |
| --- | --- |
| `pnpm install` 失败 | 先确认 Node / pnpm 版本与网络；生成项目用 pnpm，不要混 npm |
| `pnpm test` 红 | 按 lint → typecheck → build → smoke → unit 的顺序看第一个失败；基线本应全绿 |
| `pnpm start` 端口被占 | 起面板时同项目面板会复用，别的服务会顺延；也可重新生成换端口 |
| 面板打不开 / 自动开浏览器被拦 | 用 `--no-open` 或 `NX_SERVE_NO_OPEN=1`，手动访问输出里的 URL |
| mono-gf 连不上数据库 | 先 `docker compose up -d pg`；检查 `.env` 的 `pgHost` / `pgPort` / 库名 |
| `make run` 缺依赖 | `make tidy` 后再跑；GoFrame 版本以 `go.mod` 为准 |

## 6. 验收清单

- [ ] 依赖安装完成，锁文件生成
- [ ] `pnpm test`（或对应模板的构建 / 测试命令）全绿
- [ ] 面板能起、CLI 入口能跑（server-cli-web 用 `greet` 自检）
- [ ] 状态文件落在 `~/.<项目名>/`，可用环境变量覆盖
- [ ] 需要 agent 操作时，项目自带 skill 已 `skill list` 可见并可安装
