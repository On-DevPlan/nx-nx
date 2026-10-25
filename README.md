# nx-nx — nx-xx 项目生成器

**通用项目模板生成管理器**：输入两个字母，生成一个开箱可用的 CLI + Web 面板项目。

`server-cli-web` 骨架（serve 驱动 CLI 与 Web 面板、CLI 与 API 同源、带发版流水线）
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
| `nx-nx script run <脚本名\|路径> [--参数 值...]` | 跑内置脚本或任意 `.mjs` 脚本（内置全局函数已注入） |

所有命令支持 `--json`（机器可读）与 `--store <path>`（覆盖存储路径）。

## 内置脚本（别名模块）

一次性小脚本不值得单开一个项目——写段 `.mjs` 就能跑，**内置全局函数直接可用**：

```bash
nx-nx script list                     # 内置脚本清单
nx-nx script aliases                  # 内置全局函数清单
nx-nx script run sync-nx-skills --root D:\code\a_js\proj
```

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
```

### 分层（eslint 强制）

```
core/     零业务（paths / errors / templates / generate / store）
modules/  功能域：index.js 声明 action + service.js 业务 + view.jsx 面板
runtime/  装配：cli / api / server / registry / spec
web/      React 壳
```

模块之间禁止互相依赖。**否定式 glob 在 eslint 9 里实测失效**（详见 eslint.config.js
注释），因此用「枚举 + 一致性测试」：新增模块必须登记 `eslint.config.js`，
`tests/unit/lint-enumeration.test.mjs` 会在漏登时直接红。

### logo 生成（模板自带 tools/logo-gen）

零依赖 JS（SVG 真实字体 + PNG 点阵 + ICO 容器），7 套撞色方案。
**点阵 PNG 只适合 1~3 个字母**——5 字母会明显像素化；SVG 无此限制。
不预置二进制 logo：每次生成实时产出，杜绝「图与项目名对不上」的漂移。

## 明确不做

- 不做 git init / gh repo create / npm 发布——生成器只落盘 + 给出下一步命令
- 不迁移存量 nx-xx 仓库
- 不做布局组件——共享 tokens 与原子类，布局随项目
