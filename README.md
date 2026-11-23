# nx-nx — nx-xx 项目生成器

**通用项目模板生成管理器**：输入两个字母，生成一个开箱可用的 CLI + Web 面板项目。

`server-cli-web` 骨架（serve 驱动 CLI 与 Web 面板、CLI 与 API 同源、编译期类型安全、带发版流水线）
是它的第一个模板，**不是唯一模板**——任何满足模板契约的目录都能被
list / describe / preview / create 四条路径一致地处理。

## 快速开始

```bash
pnpm install && pnpm start        # 起面板（可视化创建）
# 或纯 CLI：
node bin/nx-nx.mjs template list
node bin/nx-nx.mjs template describe server-cli-web
node bin/nx-nx.mjs template create server-cli-web --letters zz --dir ../nx-zz
cd ../nx-zz && pnpm install && pnpm start
```

## 命令

| 命令 | 说明 |
| --- | --- |
| `nx-nx serve [--port N] [--no-open]` | 启动可视化创建面板（端口被占时自动处理，见下） |
| `nx-nx template list [--json]` | 列出全部模板（坏模板列出错误而不中断） |
| `nx-nx template describe <id>` | 查看模板说明与全部可选项 |
| `nx-nx template preview <id> [--选项 值...]` | 预览将生成的文件清单（不写盘） |
| `nx-nx template create <id> [--选项 值...] [--dir <path>]` | 生成项目（必填项因模板而异，见 `template describe <id>`） |
| `nx-nx template ports` | 探测本机空闲端口 |
| `nx-nx template check-dir --dir <path>` | 检查目标目录是否可用 |
| `nx-nx routes [--json]` | CLI ↔ HTTP 路由对照表 |
| `nx-nx script list` | 列出随包分发的内置脚本与用法 |
| `nx-nx script aliases` | 列出脚本里可直接调用的内置全局函数（别名模块） |
| `nx-nx script read <脚本名>` | 读取脚本源码 |
| `nx-nx script save <脚本名> --content <全文>` | 保存脚本源码（先写临时文件再改名） |
| `nx-nx script create --name <名> [--description ...]` | 新建脚本并登记到 manifest |
| `nx-nx script delete <脚本名>` | 删除脚本并从 manifest 移除 |
| `nx-nx sg script <组 id> --op read/save/create/delete --name <名> [--content ...]` | 服务组命名空间内的脚本读写（不碰全局脚本模块） |
| `nx-nx script run <脚本名\|路径> [--参数 值...] [--panel <面板>]` | 跑内置脚本或任意 `.mjs` 脚本（可先装载共享面板，变量堆随结果返回） |
| `nx-nx js sandbox <名\|--code 片段> [--panel 面板] [--args a,b]` | 在沙箱（QuickJS 虚拟机）里跑短脚本：无 fs / 无网络，产出变量堆 |
| `nx-nx js runs [--limit N]` | 最近的短脚本运行台账 |

所有命令支持 `--json`（机器可读）与 `--store <path>`（覆盖存储路径）。

## 内置脚本（别名模块）

一次性小脚本不值得单开一个项目——写段 `.mjs` 就能跑，**内置全局函数直接可用**：

```bash
nx-nx script list                     # 内置脚本清单
nx-nx script aliases                  # 内置全局函数清单
nx-nx script run sync-nx-skills --root D:\code\a_js\proj
```

**Web 面板的「脚本」页**与这些命令同源：左侧选脚本（按「长脚本 / 短脚本 / 共享面板」分区），
中间 CodeMirror 编辑源码（Ctrl/Cmd+S 保存），右侧看输出（ANSI 着色 · 虚拟滚动）、
变量堆、内置函数与运行台账；运行前自动保存当前编辑内容。`nx-nx serve` 后进左侧「脚本」。

**边界**：`script list / read / save / create / delete` 只管全局脚本模块（`assets/scripts/`）。
服务组的 server / stop / client / shared 是另一套命名空间：
`~/.nx-nx/services/groups/<组 id>/scripts/`，用 `sg script` 读写，`script list` 不会列出来。
这样改一个服务脚本不会误伤别的组，也不会把服务脚本当一次性脚本跑。

### 长脚本与短脚本（两条执行通道）

同一份 assets/scripts/ 目录，按后缀分流，谁走哪条路一眼可辨：

| 角色 | 后缀 | 在哪跑 | 能用什么 |
|---|---|---|---|
| 长脚本 | `*.mjs` | Node 子进程 | fs / 网络 / 面板里的 async 函数（服务组的主/停脚本） |
| 短脚本 | `*.short.mjs` | **沙箱**（QuickJS wasm） | 只有 `log / args / set / heap / panel / use / call`，无 fs、无网络，有超时与内存上限 |
| 共享面板 | `*.shared.mjs` | 不作入口 | 只声明：常量、函数、隐藏 `__tests`；被长脚本自动装载，或被沙箱注入 |

```bash
# 沙箱跑短脚本：装 demo.shared 面板，传参数
nx-nx js sandbox demo-batch --panel demo.shared --args '[3]'

# 直接跑一段片段（验算、转换、试逻辑），不用建文件
nx-nx js sandbox --code 'set("sum", [1,2,3].reduce((a,b)=>a+b,0))'

# 每次运行都记台账：时间 / 耗时 / 产出键 / 错误
nx-nx js runs --limit 10
```

沙箱里的变量堆以 JSON 返回：能序列化的给值，Map / Set / 函数只报类型
（不泄露地址与句柄）。沙箱用 [quickjs-emscripten](https://github.com/justjake/quickjs-emscripten)
实现——真虚拟机，不是 `node:vm` 那种可逃逸的隔离。

脚本里能直接用的内置全局函数（裸名调用，完整清单见 `nx-nx script aliases`）：

| 组 | 函数 |
| --- | --- |
| 文件 | `readText` `writeText` `readJson` `writeJson` `exists` `isDir` `isFile` `mkdirp` `removePath` `copyTree` `listDir` `listEntries` `walk` `findFiles` |
| 进程 | `run(cmd, args)` `sh(cmdLine)` `which(bin)` |
| 系统 | `homeDir` `tmpDir` `cwd` `absPath` `env` `setEnv` `sleep` `now` `parseArgs` |
| 输出 | `log` `ok` `warn` `fail` `heading` `table` |

内置脚本 `sync-nx-skills`：把一批 nx 项目的随包 skill 强制覆盖安装到本机 skill 目录
（模板固定 → skill 文档改完，一条命令全量刷新）。**自己装，不借各项目的 bin**——
规则是确定的，直接按规则做：源 `<项目>/assets/<skill>/` → 目标 `<安装目录>/<skill>/`，
目标目录先删后拷（强制覆盖），`hooks.json` 与 `install/` 这类安装期资产不随安装走，
文本里的 `{{PROJECT_ROOT}}` / `{{NX_NX_ROOT}}` 渲染成项目根全路径。整个脚本是纯文件
操作，不起额外子进程。

### 解耦是怎么做到的

```
assets/scripts/
├─ aliases.mjs        内置全局函数（别名模块）——只用 node: 内置，零项目依赖
├─ lib/               文件 / 进程 / 系统 / 输出 四组原语
├─ _runner.mjs        解释器入口：注入全局函数 → 导入脚本
├─ manifest.json      脚本清单
└─ <name>.mjs         具体脚本
```

- 别名模块**不 import 任何 nx-nx 源码** → 整个目录可整体搬到别的项目；
- 脚本只许用「内置全局函数 + node: 内置」，不许再 import 内部模块 → 脚本与项目
  之间只有这一份契约，改项目不会连带改脚本；
- 脚本跑在**自己的子进程**里：全局副作用与崩溃都被关在那个进程里。

服务组脚本不在这棵树下：每组在 `~/.nx-nx/services/groups/<id>/scripts/` 有自己的一份
`aliases.mjs` / `_ns.mjs` / `lib/` 副本，服务运行只认这份副本。

## 写一个新模板

```
templates/<模板id>/
├─ template.json   元数据：id / name / namePrefix / options[] / nextSteps[]
├─ hooks.mjs       （可选）动态选项 / 生成前后钩子
├─ README.md       （可选）describe 面板会展示
└─ files/          模板文件树，路径与文本内容可用 {{var}}
```

### template.json

```json
{
  "id": "my-template",
  "name": "人类可读名",
  "description": "一句话",
  "namePrefix": "nx-",
  "options": [
    { "name": "letters", "type": "letters", "required": true, "label": "项目字母" },
    { "name": "scheme", "type": "enum", "values": ["a", "b"], "default": "a" }
  ],
  "nextSteps": ["cd {{name}} && pnpm install"]
}
```

选项类型：`string` / `number` / `boolean` / `enum` / `letters`。
`letters` 是 nx 家族约定（1~5 位小写字母），自动派生 `{{name}}` / `{{title}}` / `{{envPrefix}}`。

### hooks.mjs

默认导出 `{ options?, beforeGenerate?, afterGenerate? }`，皆可选、可 async：

- `options(ctx)` → 追加/覆盖选项定义（值域依赖运行环境时用，如探测空闲端口）
- `beforeGenerate(vars, ctx)` → 返回 vars 补丁（生成前补默认值）
- `afterGenerate(targetDir, vars, ctx)` → 产出二进制产物（如 logo；返回 `{note}` 展示）

`ctx` 提供 `probePort(port)` / `probePorts({start, count})`。

### 变量

占位符 `{{var}}` 出现在文件**路径**与**文本内容**两处；二进制文件按字节原样复制。
GitHub Actions 的 `${{ ... }}` 语法不会被误替换（`[\w-]+` 不匹配空格与点号，有测试钉住）。

## 面板（serve）

三栏：左选模板 → 中按 option schema 自动生成表单 → 右 logo 实时预览 + 文件树预览。
模板加一个选项，面板自动多一个控件——面板不写死任何模板字段。

端口被占时不报错，直接按「上面跑的是谁」分两种情况处理：

- 上面已经是本项目的面板 → 不重复启动，直接打开浏览器指向它；
- 上面是别的服务（或探测不出来）→ 顺延到下一个空闲端口，起自己的面板。

两种情况都会打开浏览器。想关掉自动开浏览器：`NX_SERVE_NO_OPEN=1`（所有 nx-xx 项目
共用的同一个环境变量）或 `--no-open`（只影响这一次）。

`pnpm dev` 也走同一套口径：后端端口被自己的面板占着就复用（不再起第二个 serve），
被别的服务占着就顺延到下一个空闲端口——**vite 的代理目标会跟着后端实际监听的端口走**，
不会出现「dev 前端连到占用那个端口的别人」。两种情况都会把浏览器指到 dev 地址。

## 开发

```bash
pnpm test        # lint + build + smoke + unit
pnpm dev         # vite + serve 双进程
pnpm gen         # 重新生成 action 清单（改了 action 声明后跑）
```

### 分层（eslint 强制）

```
core/     零业务（paths / errors / templates / generate / store / git / terminal）
modules/  功能域：actions/<名>.ts 一条 action 一个文件 + service.ts 业务
runtime/  装配：cli / api / server / registry / spec
web/      React 壳（视图全部在这里，一个 .tsx 都不许留在 modules/ 下）
```

模块之间禁止互相依赖。**否定式 glob 在 eslint 9 里实测失效**（详见 eslint.config.js
注释），因此用「枚举 + 一致性测试」：新增模块必须登记 `eslint.config.js`，
`tests/unit/lint-enumeration.test.mjs` 会在漏登时直接红。

### 前后端彻底分离

**后端 `src/modules/` 下不允许出现 `.tsx`/`.jsx`**——视图全在 `src/web/frontend/page/<域>/`。
这条规矩破不得：视图一旦躺在后端目录里，就会顺手 `import '../../core/xxx'` 的**值**，
node: 内置模块被 Vite 打进浏览器包；反过来后端又会 import 前端组件，形成环。

守它的不是 lint（lint 只能拦住「引了 react」，拦不住「一个纯 tsx 文件」），而是
`tests/unit/layering.test.mjs` 的五条断言：后端无视图文件、后端不 import 前端、
前端不**值**导入后端、core 不依赖上层、前端注册表指向的文件真实存在。

### action 自动生成规范

**一条 action 一个文件**：`src/modules/<域>/actions/<名>.ts` 里同时写声明
（`id` / `cli` / `http` / `summary`）、契约（zod schema）与实现。
模块的 `index.ts` 只做装配，action 清单由脚本生成：

```bash
pnpm gen:actions     # 扫 src/modules/*/actions/*.ts → actions/_manifest.generated.ts
```

于是「加一条 action」= **新建一个文件 + 跑一次生成**，模块 `index.ts` 一行都不用改。
清单用 `as const` 保留字面量元组形状——注册表的编译期查重（重复 id / CLI 路径 / 路由）
依赖它，丢了就只剩运行时兜底。

改了声明忘了跑 `pnpm gen`？`tests/unit/gen-freshness.test.mjs` 会**现场重生成一遍再逐字比对**，
当场红。测试不写盘，差异只报告不污染工作区。

配套的还有 `tests/unit/registry-consistency.test.mjs`：action ↔ CLI ↔ HTTP ↔ 前端视图
四方一致（每条 action 都有 CLI、CLI 路径能被运行器解析回自己、路由唯一且无歧义、
视图调用的 `/api` 路径都有对应路由）。

### zod 的导入规范

- 值：`import { z } from 'zod'`
- 只要类型：`import type { z, ZodType } from 'zod'`
- 命名空间导入（`import * as z`）被 lint 禁止——拿不到类型推导

### logo 生成（模板自带 tools/logo-gen）

零依赖 JS（SVG 真实字体 + PNG 点阵 + ICO 容器），7 套撞色方案。
**点阵 PNG 只适合 1~3 个字母**——5 字母会明显像素化；SVG 无此限制。
不预置二进制 logo：每次生成实时产出，杜绝「图与项目名对不上」的漂移。

## 明确不做

- 不做 git init / gh repo create / npm 发布——生成器只落盘 + 给出下一步命令
- 不迁移存量 nx-xx 仓库
- 不做布局组件——共享 tokens 与原子类，布局随项目

## 服务组（sg）：长驻服务 + 活性自愈 + 共享函数面板

一个服务 = 一组自己的脚本（启动 / 停止 / 探活 / 共享 / client）+ 一份配置 + 一份运行态。
服务生命周期由服务自己管理；客户端流水线只按顺序执行 client。

**面板分两页**：服务首页保留「探活 / 启动 / 运行客户端 / 停止」、一段说明（`desc`）和最近日志；服务设置页分「服务脚本 / 客户端 / 共享数据 / 高级」四个 Tab。
每个服务组有自己的 **cwd**（默认 `~/.nx-nx/services/groups/<组 id>`）：主脚本在这个目录里跑，client 的构建产物 / 请求样本 / 测试数据也落这里，互不串目录。

### 5 分钟跑通一个 node ping 服务（推荐入口）

```bash
nx-nx sg init ping-demo     # 默认模板 node-ping：五个脚本 + 配置 + 下一步
nx-nx sg start ping-demo    # 启动服务
nx-nx sg check ping-demo    # 执行服务自己的探活脚本
nx-nx sg run ping-demo      # 只运行 client：验证 /ping 与共享数据
nx-nx sg stop ping-demo     # 执行停止脚本，必要时端口 / pid 兜底
```

`sg init` 会在服务组自己的命名空间 `~/.nx-nx/services/groups/<组 id>/scripts/`
下生成五个文件（不再写进全局 `assets/scripts/`，也不登记全局 manifest），并写好服务组配置：

| 文件 | 角色 | 内容 |
| --- | --- | --- |
| `ping-demo-server.mjs` | 主脚本 | Node HTTP：`/ping`、`/health`、`/api/users`、`/shutdown` |
| `ping-demo-stop.mjs` | 停止脚本 | 请求 `/shutdown` 优雅退出 |
| `ping-demo-health.mjs` | 探活脚本 | 请求 `/ping`，退出码 0=活，末行 JSON 给详情 |
| `ping-demo-client.mjs` | client | 验证 `/ping`，再比对共享用户数据与服务接口 |
| `ping-demo.shared.mjs` | 共享面板 | token、三条示例用户、请求配置与 `checkUp` 起飞闸门 |

改 `ping-demo-server.mjs` 就能接自己的业务；换成 REST 接口可以参考 `--template node-api`。
两者都是「能跑、能探活、能关」的完整闭环，不是一个只能启动的空壳。共享数据不是示例注释——
`/api/users`、client 与 `sg space` 用的是同一份 `DEMO_USERS`。

服务脚本只属于这个组：同名脚本在两个组里互不影响，Web 服务设置页的脚本选项也只列本组命名空间里的文件。
存量组的旧脚本（原本在 `assets/scripts/`）会在第一次解析时惰性复制进组命名空间，之后以组内副本为准。

```bash
nx-nx sg script ping-demo --op read --name ping-demo-server
nx-nx sg script ping-demo --op save --name ping-demo-server --content "<全文>"
nx-nx sg script ping-demo --op create --name extra-client --content "<全文>"
nx-nx sg script ping-demo --op delete --name extra-client
```

让 AI 生成完整脚本时用 `--contentFile`，不要拼多行 shell 字符串：

```bash
nx-nx sg script <id> --op create --name <id>-client --contentFile ./client.mjs
```

### AI 生成完整 servicegroup（SOP）

直接用 CLI 建一个可运行的服务套件：写五份脚本 → `sg set` 写配置 → `sg script --contentFile`
逐份导入 → `sg start/check/run/stop` 验证。完整动作清单看
`nx-nx skill get nx-nx A03-service-module`；现成底座在
`assets/examples/nx-kv-servicegroup/`（nx-kv 启动 + 五个 HTTP 接口验证）。

```bash
nx-nx sg templates                                  # 看全部模板
nx-nx sg init api-demo --template node-api          # 带 Bearer 鉴权的业务 API 示例
nx-nx sg init my-svc --template node-ping --port 18090 --name "我的服务"
nx-nx sg init my-svc --dry                          # 只看会生成什么，不落盘
```

### 多版本启动：同一服务，用不同启动脚本

同一份服务代码可以按不同端口 / 配置文件 / 环境启动。控制方式是 **启动脚本列表**（`launch.entries`）：每一行就是一套完整命令，不在启动时填参数，也不需要单独的参数配置页。

```json
"launch": {
  "entries": [
    {
      "name": "默认",
      "script": "ping-server",
      "args": ["--port", "18080", "--config", "config/default.json"],
      "env": { "NODE_ENV": "development" },
      "port": 18080,
      "desc": "本机开发"
    },
    {
      "name": "预发",
      "args": ["--port", "18081", "--config", "config/staging.json"],
      "env": { "NODE_ENV": "staging" },
      "port": 18081
    }
  ]
}
```

- `script` 可选：不写就沿用 `main.script`；也可以指向组命名空间里另一个启动包装脚本。
- `args` 是这一版的完整参数，不继承 `main.args`；`env` 原样注入子进程。面板参数框识别单 / 双引号，带空格的路径写成 `"C:\Program Files\..."`。
- `port` 驱动 argv / 探活 / 停止三处，避免「启动 18081、探活盯 18080」；留空则从 `args` 里的 `--port` 推断。
- 组内第一行是默认版本。Web 首页点「启动」弹出的是**版本列表**（不是参数表单），选一行确认即启动；本次版本记进运行态，自愈重启沿用。
- 切换版本会先停旧进程再按新版本起，不会让旧端口上的进程继续跑；Web 服务运行中主按钮变成「切换版本」，选当前版本则保持不动。
- 模板 `node-ping` / `node-api` 创建时自带「默认 / 预发 / 生产」三条启动脚本（端口 +0/+1/+2，配 `NODE_ENV`）；示例里的 `config/*.json` 只是示意，用自己的配置文件时把真实相对 / 绝对路径写进 `args`。在「服务设置 → 高级」的启动脚本列表里可以增删、排序、改参数。
- CLI 等价写法：

```bash
nx-nx sg start ping-demo --entry 预发
```

### 客户端流水线：只跑 client

长服务负责一直跑，短 client 负责请求验证。服务设置页的「客户端」Tab 里可以把 client 按顺序排列；首页出现「运行客户端 (N)」按钮：

- 点按钮只执行这些 client，**不会启动或停止服务**；服务生命周期仍由 `sg start` / `sg check` / `sg stop` 控制。
- 每个脚本都在服务的 cwd 里跑，退出码、耗时、stdout / stderr 追加到 `~/.nx-nx/services/logs/clients-<id>.log`。
- client 里用 `send()` / `get()` 发的请求一请求一日志，落在 `~/.nx-nx/services/http-logs/<id>/`；日志抽屉的「HTTP 请求」能看到文件清单。
- 执行完弹出逐步结果，失败步骤直接标红；「查看执行日志」跳到 client 执行记录。
- 启动脚本的 `env` 与端口会传给 client：脚本里读 `NX_SERVICE_URL` / `NX_SERVICE_PORT` 就能跟着当前版本走，不会把模板里的默认端口写死。

CLI 等价：

```bash
nx-nx sg run ping-demo
```

### 手工配置（已有自己的脚本时）

```bash
# 创建（配置整组 JSON：main / stop / probe / killPort / stopMode / health / shared / clients）
nx-nx sg set demo-group --config '{
  "name": "演示服务",
  "main":  { "script": "demo-server", "args": ["--port", "18999"] },
  "stop":  { "script": "demo-stop" },
  "probe": { "script": "demo-health" },
  "killPort": 18999,
  "stopMode": "auto",
  "health": { "kind": "http", "port": 18999, "host": "127.0.0.1", "path": "/health",
              "intervalMs": 3000, "failThreshold": 2, "readyTimeoutMs": 20000, "onDead": "restart" },
  "shared": "demo.shared",
  "clients": ["demo-client"]
}'

nx-nx sg start demo-group   # 启动（过闸门）
nx-nx sg run demo-group     # 客户端流水线：按顺序跑 clients
nx-nx sg status demo-group # 运行态（pid / 活性 / 自愈计数）
nx-nx sg check demo-group  # 执行探活脚本 → { alive, detail }
nx-nx sg autoheal demo-group --state off  # 关自愈（仍监控，只记录不处理）
nx-nx sg stop demo-group   # 按 stopMode 关闭（默认 auto：关停脚本 → 杀端口 → 杀 pid）
nx-nx sg stop demo-group --mode port      # 本次直接杀端口占用进程
nx-nx sg list / show / delete
```

- **日常四个动作**：启动 / 探活 / 运行客户端 / 关闭。关闭的走法由 `stopMode` 决定：
  `auto`（依次兜底，每步之后复核，清干净就收工）、`script`（只跑优雅关停脚本）、
  `port`（直接杀掉占用端口的进程）、`pid`（只杀运行态记录的进程）。`sg stop --mode` 可临时覆盖本次。
- **活性自愈**：`nx-nx serve` 运行时内置 watcher 按间隔检测；配了 `probe` 就执行组内探活脚本（退出码 0=活），否则用端口 / HTTP。连续失败达阈值自动重启主脚本并记入事件日志；自愈是**开关**（`sg autoheal`），关掉只是不乱重启，检测照跑。serve 不在跑时可随时手动 `sg stop/start`。
- **启动就绪上限**：`health.readyTimeoutMs`（默认 20s）——`java -jar` / `go build` 这类冷启动慢的服务调大即可，流水线不再固定等 20 秒就判失败。
- **共享函数面板**：`<name>.shared.mjs`（如 `demo.shared`）——「常量 = 函数 = {}」整体优先执行，不可作为入口直接运行；组内脚本执行前自动装载并输出**堆快照**（只显示可 JSON 表示的数据确认，函数报签名，Map/循环引用等只报类型，不泄露内部表示）。面板里可以定义 API token、随机数据工厂、以及 `serviceAlive(id)` 这类活性 check 函数。
- **client-base 思想**：基础设施（send 封装、token、常量）放共享面板，业务请求单独一个 client 脚本文件。
- 面板「服务」页的新建流程同一条路：选模板 → 预填 id / 端口 → 创建即生成五个脚本与配置，没有半成品服务。
- 完整模块说明：`nx-nx skill get nx-nx A03-service-module`；命令与排障看 `A02-service`。

## git 模块：企业级 git 工作流（交互式 + 直连）

把 `gitlike`（Go 版企业 git 编排工具）的设计整体迁到 TypeScript，并给它一套
**渐进式交互终端**：能推导的参数不问，只问需要人拍板的。

```bash
nx-nx git i              # 进入交互模式（真 TTY 下才有菜单；管道里降级为只读快照）
nx-nx git i prfeat       # 预选操作，直接从这一步开始
nx-nx git status         # 当前分支 / 进行中的操作 / 冲突 / 未提交改动
nx-nx git operations     # 全部操作 + 什么时候用 + 等价命令
nx-nx git prfeat --name login
nx-nx git abort --force  # 有冲突时必须显式 --force（见下）
```

### 交互模式：渐进式

`nx-nx git i` 进的是**菜单**，不是一份说明文字：

1. **选操作** —— 按分组折叠的搜索列表（日常 / 分支 / 冲突 / 迁移 / 历史），
   打字过滤，↑↓ 移动，**回车直接选中**；右侧详情写着「什么时候用」与等价命令。
2. **逐项补参数** —— 只问需要人拍板的：
   - 能从仓库现状推导出来的（当前分支、唯一可选项）**自动采用**，并告诉你采用了什么；
   - 选哪个分支 / 选哪些文件才真的问你（长列表走可搜索的多选）。
3. **确认** —— 展示「即将执行」与等价 CLI 命令；危险操作必须**原样敲出确认文字**
   （`cleanup-history` 要敲「我了解风险，确认清理」，`force-push` 要敲 `FORCE-PUSH`）。
4. **执行** —— spinner + 分步日志 + 结果。

两条入口跑的是**同一个实现**（`src/modules/git/ops/`），所以交互与直连不会跑偏。

### 十一个操作

| 操作 | 什么时候用 |
| --- | --- |
| `status` | 不确定该用哪个操作时，先看这里 |
| `prfeat` | 要开特性分支，但想让「开发分支」与「PR 分支」分开 |
| `cherry-pick` | 别的分支里有你要的提交，想单独拿一个过来 |
| `abort` | merge / rebase 冲突了，想回到操作之前的状态 |
| `resolve-conflicts` | 冲突文件不多，想批量选一边（ours / theirs） |
| `migrate-workspace` | 改动**还没提交**，想搬到别的分支继续写 |
| `migrate-with-memory` | 目标分支**已经有内容**，别让源分支覆盖掉它 |
| `extract-commits` | AI 提交了一串 commit，想抽到 feat 分支、让主分支历史保持干净 |
| `purge-files` | 仓库混进了 docx/mp4/exe 这类大文件，想从历史里彻底抹掉（**危险**） |
| `cleanup-history` | 抹掉历史内容但保留提交形状（**危险**） |
| `force-push` | 本地分支改名并覆盖远端同名分支（**危险**） |

三个「迁移」操作动的东西不同，别混：

- `migrate-workspace` 搬的是**工作区**：源分支的改动整体落到目标分支；
  目标分支已存在且分叉时，改动以「未提交」形态落地。
- `migrate-with-memory` 从 **merge-base**（共同祖先）建新分支 —— 目标分支已有的内容
  天然保留，再按目标分支的文件清单过滤暂存区，不覆盖它。
- `extract-commits` 搬的是**已提交的 commit**：抽到 `feat-<名字>` 保留原始历史，
  主分支 squash 成 1 个 commit（AI 提交一串时不污染主分支历史）。

### purge-files：把大文件从历史里抹掉

删掉工作区那一份 docx 没用——它还留在历史里（每个 commit 各存一份 blob），
仓库体积一直下不来。`purge-files` 把它从**创建点往后的整段历史**里删掉：

```bash
# 1) 只扫描：列出快照里匹配正则的文件与大小，历史一个字都不动
nx-nx git purge-files --pattern '\.(docx|mp4|exe)$'

# 2) 真删：选中文件后重写历史（危险操作，必须显式 --force）
nx-nx git purge-files --pattern '\.(docx|mp4|exe)$' --files 'demo.docx,clip.mp4' --force --push
```

交互式（`nx-nx git i` → 选「从历史里清除文件」）的流程是：
**填快照 commit（默认 HEAD）→ 填正则 → 看清单（文件 + 体积）→ 勾选要清除的文件
→ 三个开关 → 敲 `PURGE-HISTORY` 确认 → 执行**。

要点：

- **重写范围按「文件的创建点」算**，不是按 HEAD —— 文件是 10 个提交之前加进来的，
  只重写 HEAD 那一个提交等于没删。
- **改名链自动展开**：文件被改名过（`assets/sk-thesis/x.docx` → `assets/nx-sk/x.docx`）时，
  旧路径也会一起清掉——否则同一个 blob 还挂在老路径下，照样能下到。
- **默认连 tag 一起重写**（`--scope all`）：文件常常还挂在老 tag 的树里，
  只改当前分支的话，从 `raw/<tag>/<路径>` 照样能下到。`--scope branch` 只改当前分支。
- **提交标题 / 作者 / 时间不变**，只有 hash 会变；其它文件与提交原样保留。
- 因清除文件而变空的提交会被剪掉（`--keep-empty` 可保留）。
- 目标文件在工作区那份也会一起消失；`--gc`（默认开）才会真正释放磁盘空间。
- **验证逐个 ref 复查**：重写完会把所有分支与标签的树挨个查一遍，
  确认没有 ref 还挂着目标文件。
- `--push` 会把分支**与标签**一起强推到远端。
- 重写前强制备份 `.git`，每阶段失败都把备份路径带出来。

> ⚠️ 强推后，GitHub 仍会保留「分支上一版顶端」一小段时间（keep-around 引用），
> 按旧 SHA 直取仍可能下到文件；彻底清除需要联系 GitHub Support 清缓存视图，
> 或等 GitHub 自然 GC。

### 事务安全（照搬 gitlike 的契约，不打折）

- **有冲突时禁止自动中止**：`git abort` 先打印「GIT 操作中止指南」（操作摘要、冲突文件、
  风险、检查清单、验证步骤、替代方案），`--yes` 也不行，必须显式 `--force`。
- **混合冲突类型拒绝统一策略**：UU + DD 同时存在时只给类型说明文档，不动任何文件。
- **危险操作有 `.git` 兜底**：`cleanup-history` / `purge-files` 执行前强制备份 `.git`，
  每阶段失败都把备份路径带出来。
- **强制推送先备份分支**：本地目的分支会被备份成 `<branch>-bak-HHMMSS`。
- **重写历史必须显式表态**：直连 CLI 时 `purge-files` 不带 `--force` 就只列清单、
  不动历史；交互式走「敲确认文字」那一关。

git 模块是 **CLI 优先**：改分支结构、重写历史这类动作不做成面板上的「一键按钮」，
只有 `GET /api/git/status` 与 `GET /api/git/operations` 两个只读端点。
