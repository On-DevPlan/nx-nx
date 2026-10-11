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
| `nx-nx serve [--port N] [--no-open]` | 启动可视化创建面板 |
| `nx-nx template list [--json]` | 列出全部模板（坏模板列出错误而不中断） |
| `nx-nx template describe <id>` | 查看模板说明与全部可选项 |
| `nx-nx template preview <id> [--选项 值...]` | 预览将生成的文件清单（不写盘） |
| `nx-nx template create <id> [--选项 值...] [--dir <path>]` | 生成项目（必填项因模板而异，见 `template describe <id>`） |
| `nx-nx template ports` | 探测本机空闲端口 |
| `nx-nx template check-dir --dir <path>` | 检查目标目录是否可用 |
| `nx-nx routes [--json]` | CLI ↔ HTTP 路由对照表 |

所有命令支持 `--json`（机器可读）与 `--store <path>`（覆盖存储路径）。

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
