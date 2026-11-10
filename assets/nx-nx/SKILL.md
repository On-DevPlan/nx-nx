---
name: nx-nx
description: 当用户要「用 nx-nx 生成一个 CLI + Web 面板项目」「列出/预览/创建项目模板」「起一个本机脚手架项目」「跑内置脚本（带内置全局函数的 .mjs）」「起一个长驻服务并做活性自愈」「写 client 请求脚本 / 调客户 API 并留全量请求日志」「用共享函数面板管理 token 与 API 封装」时使用。触发词：生成项目、脚手架、模板、create、template、server-cli-web、起项目、npx nx-nx、CLI 加面板、内置脚本、script run、js 脚本、服务组、sg、dispatch、长驻服务、活性检测、自愈、共享面板、shared、send 请求、一请求一日志。不适用：纯 Web 应用、多用户远程部署。
---

# nx-nx

> 本 skill 面向**使用者**（客户 / agent），随包分发：`nx-nx skill install` 一步装好。
> 只讲「解决什么问题、怎么用」；源码结构与如何新增模板属于开发 skill `nx-dev`。

一句话：nx-nx 是项目生成器——从内置模板（TypeScript 版 server-cli-web
骨架）一键物化一个开箱可用的「CLI + Web 面板」项目；顺带提供**内置脚本**能力：
写一段 .mjs，用内置全局函数直接跑。

## 解决什么问题

起一个「既有命令行、又有浏览器面板」的本机工具，传统做法要手工铺 CLI 解析、HTTP
路由、前端壳、构建链、发版流水线，几十处配置还容易漏。nx-nx 把这套已经在多个项目
上验证过的骨架做成模板：选模板、给 1~5 个字母作为项目标识，一条命令得到完整项目，
生成后直接 `pnpm install && pnpm test` 即绿。

## 命令速查

| 命令 | 说明 |
| --- | --- |
| `nx-nx template list` | 列出可用模板（agent 摸底从这里开始） |
| `nx-nx template describe <id>` | 查看模板说明与可选项 |
| `nx-nx template preview <id> [--选项 值...]` | 预览将生成的文件清单（不写盘） |
| `nx-nx template create <id> [--选项 值...] [--dir D]` | 按模板生成项目 |
| `nx-nx template ports [--start N] [--count N]` | 探测空闲本机端口 |
| `nx-nx template check-dir --dir D` | 检查输出目录是否可用（非空即不可用） |
| `nx-nx serve [--port N] [--no-open]` | 启动 nx-nx 自己的 Web 面板（可视化创建） |
| `nx-nx routes` | CLI 命令 ↔ HTTP 路由对照表 |
| `nx-nx health` | 自检 |
| `nx-nx skill install [name] [--group G] [--all] [--to D]` | 安装单个 / 一组 / 全部随包 skill（`--all` 与 name、`--group` 互斥） |
| `nx-nx skill list` | 列出可装的 skill 与 group |
| `nx-nx script list` | 列出随包分发的内置脚本与用法（`.shared` 面板也列出，标 ⛭，可编辑但不可运行） |
| `nx-nx script aliases` | 列出脚本里可直接调用的内置全局函数（别名模块，六组：文件/进程/系统/输出/网络/服务组） |
| `nx-nx script read/save/create/delete ...` | 脚本源码的读取 / 保存 / 新建 / 删除（Web「脚本」页同源，完整 flag 见 `help script`） |
| `nx-nx script run <脚本名\|路径> [--参数 值...]` | 跑内置脚本或任意 .mjs 脚本（内置全局函数已注入） |
| `nx-nx sg list` | 列出服务组（配置 + 运行态） |
| `nx-nx sg show <id>` | 服务组详情：状态 / pid / 活性 / 自愈次数 / 日志路径 |
| `nx-nx sg hub <id>` | **hub 概览**：一组看清 server / client / 空间方法 / 当前状态 |
| `nx-nx sg set <id> --config <JSON>` | 创建或整组更新服务组配置（Web「服务」页是表单，手写 JSON 只在脚本/CI 里用） |
| `nx-nx sg run <id>` | **流水线**：空间 check → 启动主脚本 → 等活性就绪 → client 脚本依次执行 |
| `nx-nx sg start <id>` / `sg stop <id>` | 只启 / 只停主脚本（stop = 关停脚本 → 杀端口 → 杀 pid 三重兜底）；start 同样要过空间闸门 |
| `nx-nx sg status [id]` / `sg check <id>` | 运行态快照 / 立即活性检测（返回 `{ alive, detail }`） |
| `nx-nx sg logs <id>` | 查看日志：事件（启动/停止/检测失败/自愈）/ 主脚本 IO 尾部 / HTTP 请求日志清单 |
| `nx-nx sg space <id>` | 管理空间的方法清单 + 状态堆快照 + 调用记录 |
| `nx-nx sg space-call <id> --method <名> [--args <JSON数组>]` | 调用空间里的一个方法（附带调用后的空间状态与调用栈） |
| `nx-nx sg delete <id>` | 删除服务组（先停服务） |
| 任何命令 + `--json` | 机器可读输出（agent 模式） |

Web 面板顶部有「新建项目 / 模板 / 脚本 / 服务」四个 tab；「脚本」页可直接编辑并运行脚本
（共享面板 `⛭` 也可编辑，运行按钮禁用），「服务」页用**表单**管理服务组：状态卡（活性/自愈/日志）、
启动/停止/跑流水线按钮、主脚本与活性检测字段全部下拉与输入，不需要手写 JSON。
「流水线步骤」区可以**上下移动**client 脚本——列表顺序就是执行顺序。
「管理空间」卡列出空间的方法与状态；**按钮刻意少**——活性检测、日志、空间方法调用都给出了等价命令
（`sg check` / `sg logs` / `sg space-call`），界面上不铺按钮，自动化时照抄命令即可。

面板前端基于 **Ant Design 6**（`@ant-design/icons`），token 在 `src/web/frontend/components/theme.tsx`
里对齐本项目的灰阶视觉规范（黑主色 / 12px 字号 / 28px 行高 / 1px 底线分隔 / 无阴影堆叠），
换肤只需改 `style.css` 的 `:root` 变量 + 该文件。

模板 id（共 3 套）：

- `server-cli-web` — CLI + Web 面板同源（TypeScript，带编译期类型安全），本机工具通用基线
- `mono-gf` — GoFrame v2 + React + PostgreSQL 全栈 mono-repo
- `std-a-lang` — 只铺 `a_<lang>/{sdk, proj, res, doc}` 四象限的目录骨架，不生成可运行项目（参考 `D:\code\` 的命名空间布局）

## agent 典型会话

1. `nx-nx template list --json` —— 拿到模板列表
2. `nx-nx template describe server-cli-web --json` —— 确认可选项
3. `nx-nx template check-dir --dir D:\proj\my-xx --json` —— 确认目标目录可用
4. `nx-nx template create server-cli-web --letters xx --dir D:\proj\my-xx --json`
   —— 生成；读返回的 nextSteps
5. 进入生成目录：`pnpm install`，然后 `pnpm test`（lint / typecheck / build / smoke / unit）
6. `pnpm start` 起面板，或 `pnpm dev` 开发模式

出错时读 `error` 字段：带「用法:」前缀 = 参数问题，改参数重试；`NOT_FOUND` =
模板 / 路径不存在；目录非空被拒 = 换空目录或新路径。

## 内置脚本（别名模块）

为一个一次性小脚本单开一个项目不划算时用它：写一段 `.mjs`，跑在 nx-nx 自带的
node 解释器里，**内置全局函数直接可用**——不用 import，也不用自己拼 fs / shell 样板。

```bash
nx-nx script list                     # 有哪些内置脚本
nx-nx script aliases                  # 内置全局函数清单（文件 / 进程 / 系统 / 输出 四组）
nx-nx script run <脚本名或路径> --参数 值...
```

脚本里可用的内置全局函数（裸名调用；完整清单见 `nx-nx script aliases`）：

| 组 | 函数 |
| --- | --- |
| 文件 | `readText` `writeText` `readJson` `writeJson` `exists` `isDir` `isFile` `mkdirp` `removePath` `copyTree` `listDir` `listEntries` `walk` `findFiles` |
| 进程 | `run(cmd, args)` `sh(cmdLine)` `which(bin)` |
| 系统 | `homeDir` `tmpDir` `cwd` `absPath` `env` `setEnv` `sleep` `now` `parseArgs` |
| 输出 | `log` `ok` `warn` `fail` `heading` `table` |

`nx-nx script run <脚本> --k v` 里的 `--k v` 会原样转成脚本的 argv，脚本里用
`parseArgs(process.argv.slice(2))` 取。

### 脚本参数：声明一次，Web 上自动变成输入框

在脚本头部写 `@param` 注释，Web「脚本」页就自动渲染成对应控件（文本 / 数字 / 开关 / 下拉）——
**不用手打 `--k v`**：

```js
// @param port number 18999 监听端口
// @param host string 127.0.0.1 绑定地址
// @param mode select(dev|prod) dev 运行模式
// @param verbose boolean false 输出详细信息
```

规则：

- 声明在**头部连续区**（遇到空行即结束，正文里的 `@param` 不算）
- 类型：`string` / `number` / `boolean` / `select(a|b|c)`
- 默认值写字面量；不需要默认值写 `-`（留空即可）；行尾是说明
- Web 上填的是**值**，不是命令行 token；界面负责拼成脚本认的 `--k=v`
- 没声明参数时，界面给一个「参数名 / 参数值」两段输入：名字留空 = 位置参数

CLI 侧写法不变：`nx-nx script run demo-server --port 18999`。

内置脚本之一 `sync-nx-skills`：把一批 nx 项目的随包 skill 强制覆盖安装到本机 skill
目录（模板固定 → skill 文档改完，一条命令全量刷新）：

```bash
nx-nx script run sync-nx-skills --root D:\code\a_js\proj         # 真装
nx-nx script run sync-nx-skills --root D:\code\a_js\proj --dry   # 只看会发生什么
```

**自己装，不借各项目的 bin**：安装规则是确定的，所以直接按规则做——源
`<项目>/assets/<skill>/` → 目标 `<安装目录>/<skill>/`，目标目录先删后拷（强制覆盖，
旧文件不残留），`hooks.json` 与 `install/` 这类安装期资产不随安装走，文本里的
`{{PROJECT_ROOT}}` / `{{NX_NX_ROOT}}` 渲染成项目根全路径。整个脚本是纯文件操作，
不起额外子进程。

## 服务组（scripthub）：长驻服务 + 活性自愈 + 请求测试

内置脚本解决「一次性小任务」；**服务组**解决「一个长期活着的服务 + 一组围着它跑的请求脚本」。
它是自己写 dispatch 的现成替代：不必再维护一套 start / check / restart 的胶水脚本。

### 一个服务组由四样东西组成

| 角色 | 是什么 | 配置形态 |
| --- | --- | --- |
| 主脚本 `main` | 长驻服务：node 起 HTTP server，或在 node 里 `run('java', ['-jar', ...])` / `go run` 拉起别的服务 | `{ "script": "my-server", "args": ["--port", "18080"] }` |
| 活性检测 `health` | 端口可连（`kind: "port"`）或 HTTP 响应（`kind: "http"`，状态码 **< 500 即算活**） | `{ "kind": "http", "host": "127.0.0.1", "port": 18080, "path": "/health", "intervalMs": 3000, "failThreshold": 3, "onDead": "restart" }` |
| client 脚本 | 每个文件一个业务领域（一组请求），流水线里依次执行 | `"clients": ["用户模块", "订单模块"]` |
| 共享面板 `shared` | 常量 + 函数 + API 封装，组内脚本执行前自动装载 | `"shared": "myapi.shared"` |

可选：`stop`（优雅关停脚本）、`killPort`（stop 时兜底杀端口）。

### 管理空间（namespace）：面板不是一段脚本，是一个可管理的空间

共享面板装载后就成了**管理空间**：有名字、有状态（堆）、有方法（可列举 / 可调用）、有调用栈。
一个服务组的启动按钮对应的就是这段空间。空间**常驻**：面板只装载一次，状态与调用栈跨调用保留。

```json
"shared": "myapi.shared",
"space": { "panel": "myapi.shared", "check": "checkUp" }
```

`space.check` 指向空间里那个**返回 bool** 的方法。**启动主脚本之前**先调它：

```
space.check → false  ⇒  不启动主脚本（依赖没就绪，起早了只会白占端口）
space.check → true   ⇒  启动 server → 等活性就绪 → client 依次执行
```

**闸门管住两扇门**：`sg run`（流水线）与 `sg start` / 面板「启动」按钮**都**必须过闸门。
自愈重启走 `skipGate` —— 恢复动作不能被业务闸门拦死，否则上游抖动会造成「永不重启」。

**写 check 的正确姿势：判依赖，不要判自己。**
问「我能不能起」却先去问「我活着吗」是循环依赖；应该问「我依赖的东西就绪了吗」。

```js
// myapi.shared.mjs
import { defineSpace } from './_ns.mjs';

globalThis.checkUp = async function checkUp() {
  return (await upstreamReady());   // 判依赖：上游可达 / 凭据就绪 / 端口没被占
};

export const SPACE = defineSpace({
  name: 'myapi',
  description: '用户服务的管理空间：token / API 封装 / 起飞闸门',
  state: { API_TOKEN, BASE_URL },
  methods: {
    getCustomers: async () => send({ method: 'GET', url: `${BASE_URL}/api/customers` }),
  },
});
```

> 面板里凡是走 serve API 的判断（`serviceCheck` / `serviceAlive`），都靠 `NX_NX_SERVE_PORT`
> 回连本机面板。CLI 直跑（不经 `nx-nx serve`）时该变量不存在 —— 那种场景下 check
> 应当自包含（判依赖可达性），不要绕回 serve。

**空间是常驻的**：面板**只装载一次**，之后 `sg space` / `sg space-call` / 启动闸门都作用在
同一个空间实例上——状态堆跨调用保留，调用栈会累积（`sg space-call` 会一并打印「调用后的
空间状态」与「这次调用的调用栈」）。空闲 5 分钟自动回收，serve 退出时收掉，不留孤儿进程。

> 实例边界：本机**有 serve 在跑时**，CLI 的空间命令会自动转给 serve（`~/.nx-nx/serve.json`
> 记着落点），于是命令与 Web 界面作用在**同一个**空间上——你在命令行调完一个方法，
> 界面的「最近调用」立刻能看到。没起 serve 时 CLI 自己起一个临时空间，用完即走
> （那种情况下每次调用的随机 token 都会变）。

### 命令覆盖全部能力（界面不堆按钮，自动化照抄即可）

```bash
nx-nx sg hub my-svc        # 一组看清：server / client / 空间方法 / 当前状态
nx-nx sg space my-svc      # 空间的方法清单 + 状态堆快照
nx-nx sg space-call my-svc --method getCustomers --args '[]'   # 调空间方法
nx-nx sg spaces            # 本机所有空间（索引落盘，不用每次装载）
```

### 三条命令覆盖大部分场景

```bash
# 1) 建组（Web「服务」页是表单；CLI 用 --config 传 JSON，适合脚本/CI）
nx-nx sg set my-svc --config '{
  "name": "本地用户服务",
  "main": { "script": "my-server", "args": ["--port", "18080"] },
  "stop": { "script": "my-stop" },
  "killPort": 18080,
  "health": { "kind": "http", "host": "127.0.0.1", "port": 18080, "path": "/health",
              "intervalMs": 3000, "failThreshold": 3, "onDead": "restart" },
  "shared": "myapi.shared",
  "space": { "panel": "myapi.shared", "check": "checkUp" },
  "clients": ["my-client"]
}'

# 2) 跑流水线：空间 check → 启动服务 → 等活性就绪 → client 依次执行
nx-nx sg run my-svc

# 3) 看状态 / 立即检测 / 停
nx-nx sg show my-svc
nx-nx sg check my-svc          # { alive, detail }
nx-nx sg stop my-svc
```

**幂等语义**：`sg run` / `sg start` 时如果端口上已经有服务在响应（活性通过），会**跳过启动**
直接跑 client——反复执行不会重复起进程、不会撞端口把自己搞挂。

**自愈**：`nx-nx serve` 在跑时，watcher 按 `intervalMs` 检测；连续 `failThreshold` 次失败且
`onDead: "restart"` 就自动停掉再拉起，次数记在运行态（`sg show` 的「自愈次数」）。
serve 不在跑时不自动重启，但 `sg start` / `sg stop` 随时可用。

### 请求脚本的写法（client-base 思想）

**基础设施放共享面板，业务请求单独一个文件。**

`myapi.shared.mjs`（不可直接运行，只做声明；`常量 = 函数 = {}` 会在脚本执行前整体跑一遍）：

```js
const BASE = 'http://127.0.0.1:18080';

globalThis.API_TOKEN = 'tok_' + Math.random().toString(36).slice(2, 12);
globalThis.headers = () => bearer(API_TOKEN);

globalThis.api = {
  // 扩展 API 时只要记住函数签名就够了
  getCustomers: ({ page = 1, size = 20, keyword = '' } = {}) =>
    send({ method: 'GET', url: `${BASE}/api/customers`, headers: headers(),
           qs: { page, size, keyword }, label: 'getCustomers' }),
  createCustomer: ({ name, phone }) =>
    post(`${BASE}/api/customers`, { name, phone }, { headers: headers(), label: 'createCustomer' }),
};
```

`my-client.mjs`（业务脚本，作为入口可直接执行）：

```js
import './myapi.shared.mjs';   // 单独执行时自动装载面板；流水线里命中 ESM 缓存，不重复执行

// 1) 先 check 再动作（内置 serviceAlive 返回 bool）
if (!(await serviceAlive('my-svc'))) {
  fail('服务没起来：先 nx-nx sg start my-svc');
}

// 2) 业务请求
const r = await api.getCustomers({ page: 1 });
if (expectStatus(r, 200, 'getCustomers')) ok(`拿到 ${r.json.data.length} 条`);
log(`请求日志: ${r.logFile}`);
```

**共享面板装载后会打印一次堆快照**：面板的具名导出与 `globalThis` 上新增的数据都会显示——
可 JSON 表示的数据直接预览（token、随机数组），函数只报签名，对象展开列出它的函数成员
（`api: { getCustomers: [function getCustomers] }`），Map / Buffer 这类只报类型与条数、不泄露内部细节
——用来确认「面板产出了什么」，不会把运行时垃圾刷满屏。

面板里还可以放 `__tests`（**隐藏测试案例**），装载后自动跑一遍：

```js
globalThis.__tests = {
  'token 可 JSON 表示': () => JSON.stringify(API_TOKEN).length > 8,
  'makeUsers 返回数组': () => Array.isArray(makeUsers(1)),
};
```

通过的用例不出声，失败的会在 stderr 报「隐藏用例失败: <用例名>」——**只告警不阻断**，
面板里的用例坏了不该拖垮同一次执行里的业务脚本。

### 网络内置函数（别名模块的「网络」组）

| 函数 | 签名 |
| --- | --- |
| `send` | `send({ method, url, qs, headers, body, timeoutMs, label })` → `{ ok, status, headers, body, json, ms, error, logFile }` |
| `get` / `post` / `put` / `del` | `get(url, opts)` · `post(url, body, opts)` …（对象 body 自动 JSON + content-type） |
| `getJson` / `postJson` | 直接返回 JSON（失败返回 `undefined`） |
| `bearer` / `basic` | `bearer(token)` → `{ authorization: 'Bearer …' }` · `basic(user, pass)` |
| `expectStatus` | `expectStatus(res, 200, 'label')` → bool，不符合打 warn |

**一请求一日志**：每次调用自动把**全量请求与响应**写进独立文件——REQUEST 段（时间/方法/URL/全部请求头/body）、
RESPONSE 段（状态/耗时/全部响应头/body）、META 段（ok/error）。目录：

- 经 `sg run` 执行 → `~/.nx-nx/services/http-logs/<组 id>/`
- 单独 `script run` 执行 → 当前目录 `./http-logs/`（可用 `NX_HTTP_LOG_DIR` 覆盖）

文件名形如 `2026-11-04T09-12-33-210-GET-127-0-0-1-18080-api-customers-a1b2.log`，一个请求一个文件。

### 服务组内置函数（别名模块的「服务组」组）

| 函数 | 说明 |
| --- | --- |
| `serviceAlive(id)` | **返回 bool**——执行 server 前先 check，最常用的一个 |
| `serviceCheck(id)` | `{ alive, detail }`，detail 是探测结果说明 |
| `serviceStart(id)` / `serviceStop(id)` | 启动（幂等）/ 停止（三重兜底） |
| `serviceStatus(id)` | 运行态：status / pid / 活性 / 自愈计数 |

它们走本机 `nx-nx serve` 的 API（端口由 `NX_NX_SERVE_PORT` 注入，默认 7880）——
**面板与脚本读写同一份状态**，不会出现「脚本以为服务活着、面板显示已停」的分叉。

### 日志都在哪

| 内容 | 路径 |
| --- | --- |
| 主脚本 stdout/stderr（含崩溃堆栈、周期心跳） | `~/.nx-nx/services/logs/<组>-<启动时间>.log` |
| 服务组事件（启动/停止/检测失败/自愈） | `~/.nx-nx/services/logs/events-<组>.log` |
| client 脚本的执行记录（退出码 / 耗时 / 输出尾部） | `~/.nx-nx/services/logs/clients-<组>.log` |
| 每个 HTTP 请求的全量 req/resp | `~/.nx-nx/services/http-logs/<组>/` |
| 服务组配置 / 运行态 | `~/.nx-nx/service-groups.json` · `~/.nx-nx/services/runtime.json` |
| 管理空间索引（各空间的方法清单） | `~/.nx-nx/services/spaces.json` |
| serve 落点（端口 / pid，CLI 据此转交空间命令） | `~/.nx-nx/serve.json` |

配置与运行态是**两份数据**：改配置不会重置运行态，删运行态也不会丢配置。

## 关键约束（避免踩坑）

- 目标目录**非空即拒**，绝不覆盖——要重新生成就换新目录或清空目录
- **必填项因模板而异**：`server-cli-web` 是 `--letters`（1~5 位小写字母，与 namePrefix 拼出项目名，如 `nx-xx`），
  `mono-gf` 是 `--name`，`std-a-lang` 是 `--lang`。动手前先 `template describe <id>` 看清楚，别照抄别的模板的参数
- 生成项目的端口由模板钩子在创建时探测并写死，面板与 Vite 各一个
- `serve` 遇到端口被占不会报错：上面已经是本面板就**直接打开它**（不重复启动），
  是别的服务就顺延到下一个空闲端口再起自己的面板——两种情况都会开浏览器
- `NX_SERVE_NO_OPEN=1` 让所有 nx-xx 项目的 `serve` 都不自动开浏览器；
  `--no-open` 只影响这一次调用
- 生成的是**本机单用户工具**：状态存 `~/<项目名>/store.json`
- 服务组的 `main` 必须是**长驻**脚本（一次性脚本跑完就退出，会被判失活并反复重启）；只做一次的事用 `script run`
- `.shared.mjs` 不能 `script run` 直接跑（会报专属错误）——它只被组内脚本 `import` 或服务组自动装载
- 服务组自愈依赖 `nx-nx serve` 在跑（watcher 活在 serve 进程里）；没开 serve 时用 `sg start/stop` 手动管理

## 什么时候不用

- 需要多用户 / 远程部署（生成的是本机工具）
- 纯 Web 应用或纯一次性脚本（不需要 CLI ↔ 面板同源骨架）

## references

| 代号 | 内容 | 文件 |
| --- | --- | --- |
| A01 | 解决什么问题 / 使用背景 / 三套模板对比 / 完整使用流程 | `A01-product.md` |
