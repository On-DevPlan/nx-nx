---
name: nx-nx
description: 当用户要「用 nx-nx 生成一个 CLI + Web 面板项目」「列出/预览/创建项目模板」「起一个本机脚手架项目」「跑内置脚本（带内置全局函数的 .mjs）」时使用。触发词：生成项目、脚手架、模板、create、template、server-cli-web、起项目、npx nx-nx、CLI 加面板、内置脚本、script run、js 脚本。不适用：纯 Web 应用、多用户远程部署。
---

# nx-nx

> 本 skill 面向**使用者**（客户 / agent），随包分发：`nx-nx skill install` 一步装好。
> 只讲「解决什么问题、怎么用」；源码结构与如何新增模板属于开发 skill `nx-dev`。

一句话：nx-nx 是项目生成器——从内置模板（JavaScript / TypeScript 两套 server-cli-web
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
| `nx-nx script list` | 列出随包分发的内置脚本与用法 |
| `nx-nx script aliases` | 列出脚本里可直接调用的内置全局函数（别名模块） |
| `nx-nx script read/save/create/delete ...` | 脚本源码的读取 / 保存 / 新建 / 删除（Web「脚本」页同源，完整 flag 见 `help script`） |
| `nx-nx script run <脚本名\|路径> [--参数 值...]` | 跑内置脚本或任意 .mjs 脚本（内置全局函数已注入） |
| 任何命令 + `--json` | 机器可读输出（agent 模式） |

Web 面板顶部有「新建项目 / 模板 / 脚本」三个 tab；「脚本」页可直接编辑并运行内置脚本。

模板 id（共 4 套）：

- `server-cli-web` / `server-cli-web-ts` — CLI + Web 面板同源（JS / TS），本机工具通用基线
- `mono-gf` — GoFrame v2 + React + PostgreSQL 全栈 mono-repo
- `std-a-lang` — 只铺 `a_<lang>/{sdk, proj, res, doc}` 四象限的目录骨架，不生成可运行项目（参考 `D:\code\` 的命名空间布局）

## agent 典型会话

1. `nx-nx template list --json` —— 拿到模板列表
2. `nx-nx template describe server-cli-web-ts --json` —— 确认可选项
3. `nx-nx template check-dir --dir D:\proj\my-xx --json` —— 确认目标目录可用
4. `nx-nx template create server-cli-web-ts --letters xx --dir D:\proj\my-xx --json`
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

## 关键约束（避免踩坑）

- 目标目录**非空即拒**，绝不覆盖——要重新生成就换新目录或清空目录
- **必填项因模板而异**：`server-cli-web` 家族是 `--letters`（1~5 位小写字母，与 namePrefix 拼出项目名，如 `nx-xx`），
  `mono-gf` 是 `--name`，`std-a-lang` 是 `--lang`。动手前先 `template describe <id>` 看清楚，别照抄别的模板的参数
- 生成项目的端口由模板钩子在创建时探测并写死，面板与 Vite 各一个
- `serve` 遇到端口被占不会报错：上面已经是本面板就**直接打开它**（不重复启动），
  是别的服务就顺延到下一个空闲端口再起自己的面板——两种情况都会开浏览器
- `NX_SERVE_NO_OPEN=1` 让所有 nx-xx 项目的 `serve` 都不自动开浏览器；
  `--no-open` 只影响这一次调用
- 生成的是**本机单用户工具**：状态存 `~/<项目名>/store.json`

## 什么时候不用

- 需要多用户 / 远程部署（生成的是本机工具）
- 纯 Web 应用或纯一次性脚本（不需要 CLI ↔ 面板同源骨架）

## references

| 代号 | 内容 | 文件 |
| --- | --- | --- |
| A01 | 解决什么问题 / 使用背景 / 四套模板对比 / 完整使用流程 | `A01-product.md` |
