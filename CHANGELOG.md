# Changelog

本文件记录对外可见的变更。格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)。

## [0.6.3] - 2026-10-10

把「list 可变模板」做成引擎原生能力，并补上面板/元数据的小开关。

- **引擎原生支持列表变量**（`core/generate.ts: listVarExpansions`）。
  模板里形如 `a_{{lang}}/...` 的路径，只要对应变量（`vars.lang`）的值是数组，就按
  元素复制出多份子树；副本内该变量降为标量、其余变量同全局 `vars`，文本里的
  `{{lang}}` 用各副本的标量值替换。这就是 `std-a-lang` 这类「同一骨架铺多份」的
  原生机制——钩子不再需要「母版-复制」那套 workaround（v0.6.0~0.6.2 的
  beforeGenerate 留 `{{lang}}` 字面、afterGenerate 复制母版再清理），所有路径安全检查、
  文本/二进制分流都直接走引擎，不会分叉。
- **`std-a-lang` 用上列表变量后，「框架很奇怪」变成「按 schema 自然展开」**。
  模板树就是 `files/a_{{lang}}/{doc,sdk,proj,res}/`——输入 `ts, go, py` 时引擎直接铺
  `a_ts/ a_go/ a_py/` 平级到父目录。`template.json` 新增 `outputMode: "siblings"`，
  service 看到它就不再从 `vars.name` 倒推 `targetDir`；siblings 模板**单 lang 与多 lang
  都要求 `--dir`**（统一语义：「输出目录 = a_<lang>/ 们的父目录」）。钩子从
  32 行的母版+复制变成 12 行——拆列表、强制 `--dir`、设 `vars.lang = list`。
- **`outputMode: "siblings"` 让面板知道不要乱猜**。
  选中 `std-a-lang` 时面板的「输出目录」留空、标必填 `*`，底部提示
  「a_<lang>/ 们的父目录（必填、空目录，生成器拒绝非空）」；多出的「缺输出目录」
  阻塞项走 issues 单一通道，按钮门禁与底部提示同源。`template.preview` 也跟着
  接受 `--dir` 并走 list-var 展开——预览看到的清单 = 落盘时的清单，不会出现
  「preview 显示 `a_ts/a_ts/` 但生成的是 `a_ts/`」的错位。
- **模板元数据支持 `logo: false`**。面板按它决定是否画 logo 预览与撞色行。
  `std-a-lang`（纯目录骨架）与 `server-cli-web-ts`（无 logo 二进制产物）设了它——
  默认马尔斯绿撞色行只会误导；`server-cli-web`（有 scheme）与 `mono-gf`（有品牌首字母）
  继续保留。是否画是模板的事实，面板**不猜**。
- **`mono-gf` 的 `goModule` 提示**：
  「推荐与 GitHub 仓库保持一致：github.com/<用户>/<仓库名>；留空则用
  github.com/example/<项目名>，发布前记得改」——把「保持一致」摆到第一位，发布前再改。
- **测试**：`tests/unit/templates.test.mjs` 新增一条端到端回归——std-a-lang 单语言只生
  一个 `a_ts/`、多语言平级 `a_ts/` `a_go/`、副本文本 `# a_<lang> · <lang>` 用各副本
  标量替换、单/多 lang 缺 `--dir` 钩子当场拒。锁住 `a_ts/a_ts/` 这个 bug 形状。
  `option-form.test.mjs` 的回归断言也跟到新的 `allIssues.length > 0`。

## [0.6.2] - 2026-10-10

修 `mono-gf` 与 `std-a-lang` 在 Web 面板上「生成项目」点不动，并把必填 / 可选的呈现统一到一处。

- **面板的按钮门禁改为 schema 驱动**。此前 `view.tsx` 把可点性硬编码在 `letters` 上——那是
  `server-cli-web` 家族的专属选项。`mono-gf` 的必填项是 `name`、`std-a-lang` 是 `lang`，
  两个模板无论怎么填都够不到那条分支，「预览文件 / 生成项目」恒灰。判定改由
  `modules/scaffold/option-form.ts` 承担：必填项、格式、目录建议全部从模板的 option schema 推出，
  面板不再认识任何具体选项名。输出目录的默认建议也跟着改了（`namePrefix + letters` → 按 schema 推项目名），
  `mono-gf` 填完项目名自动带出目录，`std-a-lang` 填 `lang=ts` 建议 `a_ts`；多语言（`ts, go`）
  不是合法目录名就不猜，交给用户填。
- **必填 / 可选的显示统一**。必填的红色 `*` 此前只画在 string / number 上，enum 与 boolean 完全没有标记，
  同一份 schema 在面板上有两种读法。现在三种控件共用一个 `FieldBadge`：必填带 `*`，选填一律带「选填」徽标；
  表单按「必填 / 可选」分组；按钮上方直接写明还差什么（`还差必填项：项目名`）——灰着的按钮必须说清在等什么。
  模板列表视图原来的表头叫「可选项」却把必填项混在里面列出，现在同样按必填 / 可选分组并逐项打标。
- **`pattern` 从此真的生效**。`std-a-lang` 的 `lang` 早就在 `template.json` 里声明了格式正则，
  但引擎从头到尾没读过它——声明是契约，不执行就是骗模板作者，也让面板无从校验。
  `resolveVars` 现在会执行它（`readTemplateMeta` 也会把非法正则判成坏模板，不拖到生成期）。
- **测试**：新增 `tests/unit/option-form.test.mjs`，拿真实模板库与 `resolveVars` **对拍**——
  面板说能生成，服务端必须收；面板说缺必填，服务端必须拒；规则漂移直接红。
  另有一条把 bug 的形状钉死：视图里不得再出现按具体选项名门禁的写法。
  控件标记的一致性用 `renderToStaticMarkup` 断言，不依赖浏览器。
- 文档：README / `assets/nx-nx/SKILL.md` / `assets/nx-dev/references/51-verification-loop.md`
  的命令表不再把 `--letters` 写成通用参数（它只是 `server-cli-web` 家族的必填项）。

## [0.6.1] - 2026-10-10

修一处 v0.5.0 加 `mono-gf` 时就遗留、本次加 `std-a-lang` 才显式报修的文档漂移：
随包分发的 skill 文档里模板清单仍停留在「两套」，与实际四套不一致。

- `assets/nx-nx/SKILL.md` 的「模板 id」列表更新到 4 套（`server-cli-web` /
  `server-cli-web-ts` / `mono-gf` / `std-a-lang`），每套一行用途一句话
- `assets/nx-nx/references/00-product.md` 的「两套模板对比」表重写为「四套模板
  一览」：可运行的三套（JS / TS / GoFullstack）一行一列，`std-a-lang` 单独说明
  「只铺目录、不产出可运行项目」，并点出 `--lang` 多值特性

## [0.6.0] - 2026-10-10

新增第一个「不生成项目、只铺目录」的模板，并修掉 nx-nx 自己面板的图标 404。

- **新模板 `std-a-lang`：a_{语言} 命名空间骨架**。参考 `D:\code` 的实际布局
  （`a_js/`、`a_go/`、`a_py/` …），把每个语言目录收敛成 **sdk / proj / res / doc**
  四象限：sdk 放自研/封装的库，proj 放该语言的项目（建议统一前缀），res 放第三方
  仓库与下载资源，doc 放工具链笔记。`--lang` 支持**逗号分隔的多个值**，一次起多个
  语言工作区（`--lang "ts, go, py"`）；单语言留空 `--dir` 时默认在当前目录生成
  `a_<lang>/`，多语言必须 `--dir` 指定空父目录——否则当场报错，而不是把
  `a_<lang>/` 们嵌进 `a_<firstLang>/` 里。
- **模板引擎：`--dir` 注入钩子 ctx**。`beforeGenerate(vars, ctx)` 之前拿不到
  `--dir`，模板没机会在解析期判断「多语言却只给了可嵌套的默认目录」。现在
  `ctx.dir` 即 CLI `--dir` 原值（`service.ts` 把 `rawDir` 的取值提到钩子之前）。
  这是 `std-a-lang` 多语言校验的依据，也修掉了原先「钩子里改目录名没参与目标检查」
  的一个时序隐患。
- **修复 nx-nx 自身面板的图标全 404**：`index.html` 引用的 `/favicon-32.png`、
  `/favicon-16.png`、`/favicon.ico`、`/logo-rounded.png`，以及 `App.tsx` 侧栏的
  `<img src="/logo-rounded.png">`，在**整个项目里一个文件都不存在**，也没有
  `public/` 目录——dev 与 prod 下全 404，侧栏 logo 图裂。根因与 v0.5.1 修 mono-gf
  的 favicon 同源，但当时只修了「按模板生成的项目」，nx-nx 自己从没修过
  （旧注释还误称「图标由生成器的 logo-gen 产出」——logo-gen 是模板钩子，
  只在生成新项目时跑，nx-nx 自己永远不会被生成）。改法与 v0.5.1 一致：
  **内联 SVG data URI**，零网络请求、零二进制依赖，字面与侧栏品牌字统一取 `nx`。

## [0.5.1] - 2026-10-09

`mono-gf` 端到端实跑（真起 PostgreSQL + 真浏览器）之后修掉的两处 ——
两处都**不报错**，只有把项目真跑起来才看得见。v0.5.0 已发布的版本里都还在。

- **时间列全是字面的 `2006-01-02 15:04:05`**：`gtime.Time.Format()` 用的是 GoFrame
  自定义语法（`Y-m-d H:i:s`），标准库 layout 必须用 `Layout()`。用反了不报错，
  只是把格式串原样当结果输出。已改为 `Layout("2006-01-02 15:04:05")`。
- **每个生成项目的控制台都有一条 favicon 404，且侧栏品牌字是写死的 `M`**：
  新增 `initial` 选项（留空自动取项目名首字符，由 `hooks.mjs` 填充），
  侧栏品牌标记与标签页图标共用它；图标改用内联 SVG data URI，
  浏览器不再隐式请求 `/favicon.ico`。

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
