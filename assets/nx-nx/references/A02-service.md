---
name: A02-service
description: nx-nx 服务组场景 SOP——模板建组、探活、失活自愈、stop 四种模式、启动参数、流水线、共享面板与管理空间。起长驻服务、排查自愈或流水线问题时读。
---

# A02 · 服务组

## 加载时机

- 用户说「服务组」「sg」「起一个长驻服务」「活性检测 / 自愈」「跑 client」「共享面板 / 管理空间」
- 主 SKILL.md 路由到「服务」场景

## 1. 先跑通最小案例

```bash
nx-nx sg init ping-demo          # 默认模板 node-ping：生成脚本 + 配置 + 下一步
nx-nx sg run ping-demo           # 闸门 → 启动/复用 → 等活性 → client 打 /ping
nx-nx sg check ping-demo         # 立即探活：{ alive, detail }
nx-nx sg stop ping-demo          # 关闭
```

`sg init` 生成三个脚本：`<id>-server.mjs`（`GET /ping` → `pong`）、`<id>-client.mjs`（请求 /ping）、`<id>.shared.mjs`（`BASE_URL` + `checkUp` 闸门），并写好 main / health / killPort / shared / space.check / clients。`sg templates` 看模板，`--dry` 只看计划不落盘。

## 2. 一个服务组由什么组成

| 角色 | 作用 | 配置字段 |
| --- | --- | --- |
| 主脚本 | 长驻服务；node 起 HTTP，或在 node 里 `run('java', ['-jar', …])` / `go run` | `main: { script, args }` |
| 活性检测 | 端口可连（`port`）或 HTTP 响应（`http`，状态码 < 500 算活） | `health` |
| client 脚本 | 每个文件一个业务领域，流水线里依次执行 | `clients: []` |
| 共享面板 | 常量 + 函数 + API 封装，组内脚本执行前自动装载 | `shared` |

可选字段：`stop`（优雅关停脚本）、`killPort`（兜底杀端口）、`stopMode`（默认 `auto`）、`desc`（首页说明）、`cwd`（服务自己的工作目录，默认 `~/.nx-nx/services/groups/<id>`）、`space`（管理空间与起飞闸门）、`launch`（启动参数与预设）。

主脚本与 client 都以该组 `cwd` 为工作目录，环境变量 `NX_SERVICE_DIR` 指向它。

## 3. 建组：优先模板，自己已有脚本才手写配置

```bash
nx-nx sg init my-svc --template node-ping --port 18080 --name "我的服务"
```

已有现成脚本时：

```bash
nx-nx sg set my-svc --config '{
  "name": "本地用户服务",
  "desc": "用户 CRUD 的本机 API",
  "main": { "script": "my-server", "args": ["--port", "18080"] },
  "stop": { "script": "my-stop" },
  "killPort": 18080,
  "stopMode": "auto",
  "health": { "kind": "http", "host": "127.0.0.1", "port": 18080, "path": "/health",
              "intervalMs": 3000, "failThreshold": 3, "readyTimeoutMs": 20000, "onDead": "restart" },
  "shared": "myapi.shared",
  "space": { "panel": "myapi.shared", "check": "checkUp" },
  "clients": ["my-client"]
}'
```

- `sg set` 是**整组覆盖**，不是局部 patch；改前先 `sg show <id> --json` 拿现状。
- health 默认：`intervalMs 5000` / `failThreshold 3` / `readyTimeoutMs 20000` / `onDead restart`；模板通常写 3000 / 2。
- java / go 冷启动慢，把 `readyTimeoutMs` 放宽到 60000 级别。

## 4. 生命周期命令

| 命令 | 用途 |
| --- | --- |
| `sg templates` | 模板清单（node-ping / node-api） |
| `sg init <id>` | 按模板建组（生成脚本 + 配置） |
| `sg list` / `sg show <id>` | 列表 / 配置 + 运行态详情 |
| `sg set <id> --config <JSON>` | 创建或整组更新配置 |
| `sg start <id> [--values JSON]` | 启动主脚本（先过闸门） |
| `sg stop <id> [--mode auto\|script\|port\|pid]` | 关闭，模式见下 |
| `sg autoheal <id> --state on\|off` | 自愈开关（监控不停） |
| `sg status [id]` / `sg check <id>` | 运行态快照 / 立即探活 |
| `sg logs <id>` | 事件 / 主脚本 IO 尾部 / HTTP 请求日志清单 |
| `sg hub <id>` | 一组看清 server / client / 空间方法 / 当前状态 |
| `sg space <id>` / `sg space-call <id> --method <名> [--args JSON数组]` | 空间方法清单 + 状态堆 / 调用方法 |
| `sg spaces` | 本机所有管理空间 |
| `sg run <id> [--values JSON]` | 一键测试组：闸门 → 启动/复用 → 等活性 → clients 依次执行 |
| `sg delete <id>` | 删除服务组（须先停） |

`stopMode` 四种走法：

| 模式 | 行为 | 何时用 |
| --- | --- | --- |
| `auto`（默认） | 关停脚本 → 杀端口 → 杀 pid，每步复核 | 常规关闭 |
| `script` | 只跑优雅关停脚本 | 服务自己有退出协议 |
| `port` | 直接杀占用端口的进程 | 用户点名「关掉这个端口」 |
| `pid` | 只杀运行态记录的 pid | 端口可能被别的进程占用，避免误杀 |

## 5. 启动参数与多版本

`launch.params` 让同一组按不同端口 / 配置文件 / 环境启动：

```json
"launch": {
  "params": [
    { "key": "port", "label": "端口", "type": "number", "default": "18080", "arg": "port" },
    { "key": "env", "label": "运行环境", "type": "select", "options": ["development", "staging"], "default": "development", "env": "NODE_ENV" },
    { "key": "config", "label": "配置文件", "type": "text", "default": "config/default.json", "arg": "config" }
  ],
  "profiles": [
    { "name": "默认", "values": { "port": "18080", "env": "development", "config": "config/default.json" } },
    { "name": "预发", "values": { "port": "18081", "env": "staging", "config": "config/staging.json" } }
  ]
}
```

- `type`：`text` / `number` / `select`；`arg` 追加成 `--<arg> <value>`；`env` 注入同名环境变量。
- CLI 用 `--values` 传同一份值：`sg start my-svc --values '{"port":"18081","env":"staging"}'`。
- **`key` 或 `arg` 为 `port` 的参数同时驱动 argv、探活与 stop 端口**；换端口只改这里，别只改 config 里的 `killPort`。
- 本次值写进运行态，自愈重启沿用；面板首页「启动」先弹参数表单，可选预设再逐项改。

## 6. 流水线：client 按顺序跑

- `clients` 是顺序数组；`sg run` 依次执行并逐步报告（闸门 / 启动 / 等活性 / 每个 client）。
- 每个 client 的退出码、耗时、stdout / stderr 追加到 `clients-<id>.log`；失败标红，可跳执行日志。
- 启动端口以 `NX_SERVICE_URL` / `NX_SERVICE_PORT` 传给 client——**不要写死模板默认端口**。
- 端口上已有本组服务且活性通过时，`sg run` / `sg start` **复用**，不重复起进程、不撞端口。
- 设置页「流水线」Tab 可排序 / 增删 client；Web 与 CLI 改的是同一份配置。

## 7. 共享面板与管理空间

```json
"shared": "myapi.shared",
"space": { "panel": "myapi.shared", "check": "checkUp" }
```

- `shared` 在组内脚本执行前自动装载；常量、`globalThis` 增量、具名导出都进空间。
- `space.check` 指向一个**返回 bool** 的方法，启动主脚本前先调：
  - `false` → 不启动（依赖没就绪，起早了只占端口）；
  - `true` → 启动 → 等活性 → clients。
- **闸门管住两扇门**：`sg run` 与 `sg start` / 面板「启动」都过闸门；自愈重启走 `skipGate`，恢复动作不能被业务闸门拦死。
- 写 check 的正确姿势：**判依赖，不判自己**。问「上游可达 / 凭据就绪 / 端口没被占」，不要先问「我活着吗」。
- 空间是常驻实体：方法可列举、状态堆跨调用保留、调用栈会累积；`sg space` 看快照，`sg space-call` 调方法。
- 有 serve 在跑时，CLI 的空间命令自动转给 serve，和 Web 面板作用在同一个空间；没 serve 时 CLI 起临时空间，用完即走。

## 8. 失活自愈

- watcher 按 `intervalMs` 检测；连续 `failThreshold` 次失败且 `onDead: "restart"` → 自动停掉再拉起，次数记在运行态。
- **watcher 活在 `nx-nx serve` 进程里**：serve 不在跑时只做检测 / 手动 start / stop，不自动重启。
- `sg autoheal <id> --state off` 只关「处理」，**监控不停**；用于「先观察一阵」。
- 自愈重启沿用本次启动参数（端口 / 环境 / 配置文件），不会退回模板默认。

## 9. 日志与数据在哪

| 内容 | 路径 |
| --- | --- |
| 主脚本 stdout / stderr（含崩溃栈、心跳） | `~/.nx-nx/services/logs/<组>-<启动时间>.log` |
| 事件（启动 / 停止 / 检测失败 / 自愈） | `~/.nx-nx/services/logs/events-<组>.log` |
| client 执行记录 | `~/.nx-nx/services/logs/clients-<组>.log` |
| HTTP 全量请求 / 响应 | `~/.nx-nx/services/http-logs/<组>/` |
| 服务自己的工作目录 | `~/.nx-nx/services/groups/<组>/` |
| 配置 / 运行态 | `~/.nx-nx/service-groups.json` · `~/.nx-nx/services/runtime.json` |
| 空间索引 / serve 落点 | `~/.nx-nx/services/spaces.json` · `~/.nx-nx/serve.json` |

配置与运行态是两份数据：改配置不重置运行态，删运行态不丢配置。

## 10. 陷阱

| 偏差 | 正确做法 |
| --- | --- |
| 把一次性脚本设成 `main` | 它跑完就退出，会被判失活并反复重启；一次性的事用 `script run` |
| health 路径写错（服务是 `/ping`，配置写 `/health`） | 探活 404 会判失活 → 自愈循环；路径必须与主脚本真实路由一致 |
| 没开 serve 却等自愈 | watcher 在 serve 里；先 `nx-nx serve`，或接受手动 start / stop |
| 换端口只改 `killPort` | 同步改 `launch.params` 的 port 参数，argv / 探活 / stop 都跟它走 |
| `checkUp` 里查本服务是否活着 | 循环依赖，永远 false；只判上游依赖 |
| 端口被别的进程占用还选 `port` 模式 | 会误杀；改 `pid` 模式只杀本组记录的进程 |
| 把 `.shared.mjs` 当入口跑 | 只被自动装载 / import；见 [[A01-script]] |

## 11. 验收清单

- [ ] `sg init` 生成的脚本与配置能直接 `sg run`，client 有成功输出
- [ ] `sg check` 启动后 `alive=true`，`sg stop` 后端口关闭
- [ ] `sg show` 的 pid / 活性 / 自愈次数与实际一致
- [ ] 换 `--values` 端口后，探活与 stop 都打到新端口
- [ ] 需要自愈时，serve 在跑；杀主进程后运行态 `restarts` 增长
- [ ] client 日志与 HTTP 一请求一日志都落在对应目录
