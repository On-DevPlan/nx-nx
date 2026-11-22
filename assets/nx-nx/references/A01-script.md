---
name: A01-script
description: nx-nx 脚本场景 SOP——判脚本类型、列/读/建/改、@param 参数、Node 运行、QuickJS 沙箱、变量堆与运行台账。用户要写 / 跑 / 改脚本，或调试短脚本时读。
---

# A01 · 脚本

## 加载时机

- 用户说「跑个脚本」「写个 .mjs」「script run」「沙箱跑一段」「变量堆 / 台账」
- 主 SKILL.md 路由到「脚本」场景

## 1. 先判类型（走错通道必报错）

| 类型 | 识别 | 执行通道 | 能否直接 `run` | 典型用途 |
| --- | --- | --- | --- | --- |
| 长脚本 | `*.mjs`（非 `.short` / `.shared`） | Node 子进程 | 是 | 文件批处理、调外部命令、HTTP 请求 |
| 短脚本 | `*.short.mjs` | QuickJS 沙箱 | 否，走 `js sandbox` | 纯计算、数据整形、验算 |
| 共享面板 | `*.shared.mjs` | 被装载 | 否 | 常量 / 函数 / API 封装，服务组自动装载 |

`script list` 会列出全部**全局脚本模块**：短脚本带 `.short` 后缀、共享面板带 `.shared`；Web「脚本」页再按长 / 短 / 面板分区摆开。判错类型的典型报错是「走不了 Node 通道」或「.shared 不能作入口」。

**服务组脚本是另一套命名空间**：server / stop / client / shared 住在 `~/.nx-nx/services/groups/<组 id>/scripts/`，用 `sg script` 管理，不出现在 `script list` / 脚本页。两者完全分离——改全局脚本不会影响任何服务组，两个组的同名脚本也互不干扰。详见 [[A02-service]]。

## 2. 找脚本、看能力

```bash
nx-nx script list                    # 有哪些内置脚本（长 / 短 / 面板分区）
nx-nx script aliases                 # 脚本里可直接裸名调用的内置函数（六组）
nx-nx script params demo-server      # 某个脚本声明了哪些 @param
nx-nx script read demo-server        # 读源码
```

## 3. 新建 / 保存 / 删除

```bash
nx-nx script create --name my-task --description "一句话说明" --usage "nx-nx script run my-task"
nx-nx script save my-task --content "<脚本全文>"
nx-nx script delete my-task
```

- 新建会同时登记 `manifest.json`，脚本页与 `script list` 立刻可见；删除会一并移除登记。
- 脚本名不带 `.mjs`；不允许路径分隔符、`..`、`_` / `.` 开头的名字（解释器与别名模块受保护）。
- `save` 只改已存在的脚本；`--content` 要整段全文，不是增量。
- Web「脚本」页用 CodeMirror 编辑，与 CLI 读写同一份文件；长文本优先在面板里改。

Windows / PowerShell 传整段源码：

```powershell
$src = Get-Content -Raw .\my-task.mjs
nx-nx script save my-task --content $src
```

## 4. 声明参数：写一次，面板自动出输入框

在脚本**头部连续注释区**写 `@param`（遇到空行即结束，正文里的不算）：

```js
// @param port number 18999 监听端口
// @param host string 127.0.0.1 绑定地址
// @param mode select(dev|prod) dev 运行模式
// @param verbose boolean false 输出详细信息
```

| 字段 | 规则 |
| --- | --- |
| 位置 | 文件头部连续 `//` 注释；空行后失效 |
| 类型 | `string` / `number` / `boolean` / `select(a\|b\|c)` |
| 默认值 | 字面量；不需要默认值写 `-` |
| 说明 | 行尾剩余文字 |

- Web 上是**值输入**，界面负责拼成 `--k=v`；CLI 侧仍是普通 flag。
- 没声明参数时，面板给「参数名 / 参数值」两行：名字留空 = 位置参数。
- 用 `script params <name>` 核对声明是否被解析到。

## 5. Node 通道运行

```bash
nx-nx script run demo-server -- --port 18999
nx-nx script run demo-client --panel demo.shared
```

- `--` 之后的参数原样进 `process.argv`；脚本里用 `parseArgs(process.argv.slice(2))` 取。
- `--panel` 先装载共享面板，再跑脚本；面板变量堆以 `NX_HEAP_RESULT <json>` 一行回传，并从展示用的 stdout 摘除。
- 内置函数（`readText` / `run` / `send` / `log` 等）已挂在 `globalThis`，裸名即可，不用 import。
- 长脚本可以 `run('java', ['-jar', ...])` / `run('go', ['run', ...])` 拉起别的进程；主脚本要长驻时尤其常用。

## 6. 沙箱通道（短脚本）

```bash
nx-nx js sandbox demo-batch --panel demo.shared --args '3'
nx-nx js sandbox --code 'set("sum", [1,2,3].reduce((a,b)=>a+b,0))'
nx-nx js runs --limit 10
```

| 约束 | 说明 |
| --- | --- |
| 能力 | 无 `fs` / 无网络 / 无 `process`；只有 `log` `args` `set` `heap` `panel` `use` `call` |
| 面板函数 | 只支持**同步**函数；async 会被明确拒绝并指向 Node 通道 |
| 多面板 | `--panel a.shared,b.shared` 逗号分隔 |
| 时限 | `--timeoutMs` 默认 5000，死循环会被真中断 |
| 内存 | `--memoryMb` 默认 64 |
| 产出 | `set(key, value)` 汇总成变量堆，`--code` 也走同一套 |

## 7. 产物与日志

| 产物 | 位置 / 形态 |
| --- | --- |
| 变量堆 | 每项 `{ key, type, describe, json }`；Map / 函数 / Buffer 只报类型与说明 |
| 沙箱运行台账 | `~/.nx-nx/logs/script-runs.jsonl`，`js runs` 读最近 N 条 |
| HTTP 请求日志（单独 `script run`） | 当前目录 `./http-logs/`，可用 `NX_HTTP_LOG_DIR` 覆盖 |
| HTTP 请求日志（服务组流水线） | `~/.nx-nx/services/http-logs/<组 id>/`，一请求一文件 |

数据隔离（测试 / agent 演练）：同时设 `NX_NX_HOME`（服务与台账数据）与 `NX_NX_SCRIPTS`（脚本目录）即可整体搬走，不碰真实 `~/.nx-nx`。

## 8. 内置函数速查（六组）

| 组 | 关键函数 |
| --- | --- |
| 文件 | `readText` `writeText` `readJson` `writeJson` `exists` `mkdirp` `copyTree` `walk` `findFiles` |
| 进程 | `run(cmd, args)` `sh(cmdLine)` `which(bin)` |
| 系统 | `homeDir` `tmpDir` `cwd` `absPath` `env` `setEnv` `sleep` `now` `parseArgs` |
| 网络 | `send` `get` `post` `put` `del` `getJson` `postJson` `bearer` `basic` `expectStatus` |
| 服务组 | `serviceAlive` `serviceCheck` `serviceStart` `serviceStop` `serviceStatus` |
| 输出 | `log` `ok` `warn` `fail` `heading` `table` |

完整签名以 `nx-nx script aliases` 为准；服务组场景见 [[A02-service]]。

## 9. 陷阱

| 偏差 | 正确做法 |
| --- | --- |
| 把 `.short.mjs` 丢给 `script run` | 短脚本只能 `js sandbox`；它没有 fs / 网络 |
| 把 `.shared.mjs` 当入口跑 | 它只被 `import` 或服务组自动装载 |
| 在沙箱里调 async 面板函数 | 沙箱只收同步函数；异步逻辑放 Node 通道 |
| 以为面板里也能用 `send` | 网络别名不进沙箱；沙箱要请求就出不去，改长脚本 |
| `@param` 写在空行之后 | 参数区遇到空行即结束，声明会被忽略 |
| 参数里有空格直接拼命令行 | 用 `--k=v` 等号连写，或由面板生成 token |
| 在 `script list` 里找服务组脚本 | 服务脚本在组命名空间，用 `sg script` / `sg show`；见 [[A02-service]] |

## 10. 验收清单

- [ ] `script list` 能看到目标脚本，类型分区正确
- [ ] `script params <name>` 能列出预期参数
- [ ] 长脚本 `script run` / 短脚本 `js sandbox` 各自走对通道
- [ ] 需要面板时，输出里有变量堆且 `__tests` 失败只告警不阻断
- [ ] 请求场景能在对应目录找到一请求一日志
