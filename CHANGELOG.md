# Changelog

本文件记录对外可见的变更。格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)。

## [0.5.0] - 2026-10-09

新增第一个**非 Node 生态**的模板（GoFrame 全栈），并把模板引擎的一个静默失败修掉。

- **新模板 `mono-gf`：GoFrame mono-repo 全栈骨架**（与 `server-cli-web` 同级）。
  Go 后端（GoFrame v2.10 + PostgreSQL）+ React 面板 + nginx 前置，一仓多应用：
  `app/server` 带 api 契约（`/hello`、`/user/list`、`/user/create`）、
  controller → logic → `g.DB()` 完整分层、`db/schema.sql`、`make dao` 的 gen 配置、
  docker-compose（pg + api + web）、CI。实测：生成即 `go build` 通过、
  前端 `tsc --noEmit` + `vite build` 通过、`docker compose config` 通过、
  起服务后 `/hello` 返回 `{code:0,message:"OK",data:{…}}`、`/user/list` 能真连库
  （无库时报连接失败而不是找不到驱动）、校验失败回 `code:51`。
- **修复 `isTextPath` 的扩展名白名单漏项**：`.go .mod .sum .sql .conf .example .dockerignore`
  之前不在白名单里 → 这些文件被当二进制**原样拷贝**，占位符字面留在生成产物里
  （不报错的静默失败）。mono-gf 模板就是踩到这一点才暴露的。
- 单测加固两条：`isTextPath` 覆盖非 JS 生态扩展名；
  「模板库全部文本文件都能渲染」新增一条断言 —— **非文本扩展名的文件里不允许出现占位符**，
  否则生成时会原样拷贝、静默坏掉。
- **两个模板的 lint 新增「单文件有效字符数」闸门**（`local/max-file-chars`，上限 15000）：
  `max-lines` 只管行数，把每行拉长照样能一直膨胀；字符数是同一件事的另一把尺子，
  两者同口径、都只统计「有效代码」（跳过空行与注释）。
  该闸门**不跟着 `max-lines` 给 `scripts/`、`tools/` 开豁免**：行数豁免的本意是
  「开发脚本结构随意」，不是「体积可以无上限」——JS 模板里被免检的
  `scripts/link-local.mjs`（约 12.7k 有效字符 / 528 行）现在也在闸门内。
- 新增单元测试：两个模板的 `eslint.config.js` 都必须带这条闸门。根 lint 忽略
  `templates/**`，模板规则没有别的地方会跑到，不钉住就没人发现。
- 新增长期护栏：**模板库全部文本文件都必须能渲染**。这条规则本身就是踩出来的——
  ESLint 的 `messages` / `messageId` 插值语法和模板引擎的占位符是同一套双花括号，
  写进模板文件会让 `template create` 当场报「未声明的变量」（smoke 只 dry-run 了
  JS 模板，TS 模板没人兜）。规则内改成字符串拼接，并把「渲染全部模板文件」钉成测试。

## [0.4.0] - 2026-10-09

多 skill 编排与配置驱动 hook 总线，并把整套机制沉淀为标准模块植入两个模板。

- **multi-skill**：`skill install [name]` 显式安装、`skill install --group <g>`
  一键装一组、`skill list` / `skill groups` 列出可装项与默认安装标记；
  `groups.json` 缺失或损坏时降级为目录扫描，schema 错误显眼报错
- **配置驱动 hook 总线**（参考 Claude Code hooks 模型）：
  - 每个 skill 可带 `hooks.json`，事件平面开放（首批 `skill:pre-install` /
    `skill:post-install`），`match` 正则匹配目标，核心不枚举事件
  - 两类 handler：`module`（ESM 导入，路径越界拒绝，支持 `#export`）与
    `command`（子进程语言无关，payload 走 stdin；exit 2 阻断、exit 0 返回决策）
  - 统一 decision：`block` 阻断安装、`vars` 聚合为动态字符串、`data` 收集；
    坏 JSON / schema / 坏正则一律 specError
  - 安装期资产（`hooks.json`、`install/`）不复制进安装目标
- **标准模块沉淀**：skill 机制重组为自包含的 `core/skills/` 六文件
  （index / get / install / bus / handlers / text-util），零生成器依赖，
  可直接移植；`text-util` 为文本判定的独立模块
- **两个模板初始化即具备 multi-skill + hook 机制**：
  - `server-cli-web-ts` 与 `server-cli-web` 均内置 skill 模块、模板资产
    （主 skill + hooks.json + install handler）
  - 首个 hook：skill 安装时校验当前项目根，非本项目拒绝安装，是则注入
    项目根全路径（安装期占位 `PROJECT_ROOT`）
  - JS 模板补齐 smoke 测试、JSX lint 支持（eslint-plugin-react）
- 工程：build 前清理 dist（杜绝旧产物打包），`tsc -b --force` 保证干净构建
- 测试：nx-nx smoke 8 项、unit 27 项全闸门通过；两个模板 e2e 项目
  （nx-ts / nx-js）lint / build / smoke 全部通过

## [0.3.0] - 2026-10-09

项目本身全面 TypeScript 化，并新增 TS 模板。

- **项目从 JavaScript 迁移到 TypeScript**，落地编译期类型安全系统：
  - 两段式泛型 action builder：run 的 ctx 由声明精确派生，漏传必填参数、
    flag 值类型写错编译即红
  - 注册表查重前移到编译期：模块 / action id、CLI 路径、HTTP 路由重复 +
    结构性路由歧义
  - typed client：未知 action、漏传路由参数、位置参数缺失全部编译报错，
    返回数据按 run 精确推导
  - branded 路径（AbsolutePath / SafeRelPath）、错误码穷尽映射
- **新增模板 `server-cli-web-ts`**：TypeScript 版骨架，自带上述类型系统与
  home 示例模块（bootstrap / routes / health / greet）
- ESLint 新增 `max-lines`：单文件有效代码行上限 300（跳过空行与注释）；
  超限文件（cli / view）已按职责拆分
- 修复：面板 `CliHints` 组件 props 与调用方不匹配，提示区域静默渲染为 null
- 修复：typed client 的调用参数漏覆盖不在路由中的位置参数
- 测试：smoke 6 项、unit 23 项，全闸门（lint / typecheck / build / smoke / unit）通过

## [0.2.0] - 2026-10-04

- 模板随包 skill 转为产品文档：`assets/{{name}}/` 面向使用者（客户 / agent），
  只讲解决什么问题、命令用法与使用场景，不再包含源码结构
  - `SKILL.md` 删除「核心不变量」（action 三端声明、依赖方向等开发内容）
  - `references/00-design.md`（架构图 / 分层 / 错误案例）替换为
    `references/00-product.md`（解决什么问题 / 使用背景与需求 / 使用场景）
- CLI：`--letters` 与 `--dir` 组合生成时输出目录语义不变

## [0.1.0] - 2026-09-27

首个版本。

- 通用模板引擎：`{{var}}` 占位符（路径 + 内容）、二进制原样复制、GitHub Actions `${{ }}` 不误替换
- 模板契约：`template.json`（元数据 + option schema）+ `hooks.mjs`（动态选项 / 生成前后钩子）
- 首个模板 `server-cli-web`：serve 驱动 CLI 与 Web 面板的全量骨架
  - runtime 五件套（cli/api/server/registry/spec，一条 action 三端同源）
  - core（paths/errors/store/open）
  - web 壳（React + vite，style 分 tokens/atomic/layout 三层）
  - logo 生成（零依赖，SVG + PNG + ICO，7 套撞色，每次生成实时产出）
  - dev 启动器、link-local shim、发版流水线（tag 幂等 + provenance）
- CLI：list / describe / preview / create / ports / check-dir，全命令 `--json`
- 面板：三栏可视化创建（模板选择 / schema 驱动表单 / logo 实时预览 + 文件树）
- 安全：目标目录非空即拒、路径非法段拒绝、模板 id 防穿越
- 测试：29 项（模板引擎边界 + smoke + lint 清单一致性）
